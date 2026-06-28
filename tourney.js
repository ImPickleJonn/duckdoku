// =============================================================
// tourney.js — Duckdoku Tournament ("Duck Cup") server module.
// One format: a 5-player ROOM on a shared seeded puzzle. WIN RULE = fewest mistakes, ties broken
// by a hidden time. Rooms are GHOST-FILLED (recent real runs on the same seed; seeded bots for
// cold-start) so they always feel full + finish instantly. Each room finish awards GOALS to the
// player's COUNTRY (top 3: 3/2/1) which feed the World Cup standings (leaderboard only, NO WC
// reward). Prizes come only from a room top-3 finish. History is stored per player.
//   const tourney = require('./tourney'); tourney.register(app, { dbPool, validateInitData, users, noteUser });
// =============================================================
const ROUND_MS = 20 * 60 * 1000;                  // a new shared seed every 20 min -> a fresh ghost pool

// deterministic LCG so the same seed always shows the same bots
function srng(s){ let x = (s >>> 0) || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
const BOT_NAMES = ['Lucky Duck','Sir Quacks','Pip','Waddles','Bubbles','Nugget','Sunny','Pebbles','Coco','Mochi','Biscuit','Dax','Olive','Ziggy','Tofu','Maple','Pumpkin','Suzu','Boba','Yolko','Peep','Splash','Goldie','Captain Quack'];
const BOT_CC   = ['BR','AR','US','GB','DE','FR','ES','IT','PT','NL','JP','KR','MX','TR','IN','NG','EG','SA','AU','CA','CO','PL','UA','SE'];
function makeBot(seed, i){
  const r = srng(seed * 131 + i * 977 + 7);
  const mistakes = r() < 0.5 ? 0 : (r() < 0.8 ? 1 : 2);     // mostly clean, occasionally slips
  const time_ms  = Math.floor(35000 + r() * 90000);         // 35s..125s
  return { name: BOT_NAMES[Math.floor(r() * BOT_NAMES.length)], country: BOT_CC[Math.floor(r() * BOT_CC.length)], avatar: null, mistakes, time_ms, bot: true };
}

// pure scorer: the player's run + the ghosts -> sorted board, the player's rank, country goals, prize
function scoreRoom(me, ghosts){
  const all = [{ ...me, me: true }, ...ghosts.map(g => ({ ...g, me: false }))];
  all.sort((a, b) => (a.mistakes - b.mistakes) || (a.time_ms - b.time_ms) || (a.me ? 1 : -1));
  const rank = all.findIndex(x => x.me) + 1;
  const goals = rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0;      // feeds the country World Cup standings
  const prize = rank === 1 ? { gold: 100, sticker: true } : rank === 2 ? { gold: 50 } : rank === 3 ? { gold: 25 } : {};
  const board = all.map((x, i) => ({ rank: i + 1, name: x.name, country: x.country, avatar: x.avatar, mistakes: x.mistakes, timeMs: x.time_ms, me: !!x.me, bot: !!x.bot }));
  return { board, rank, goals, prize };
}

function register(app, deps){
  const { dbPool, validateInitData, users, noteUser } = deps;

  async function ensureSchema(){
    if (!dbPool) return;
    try {
      await dbPool.query(`
        ALTER TABLE players ADD COLUMN IF NOT EXISTS country TEXT;
        CREATE TABLE IF NOT EXISTS tourney_runs (
          run_id     BIGSERIAL PRIMARY KEY,
          seed       BIGINT NOT NULL,
          tg_id      BIGINT NOT NULL,
          name       TEXT, country TEXT, avatar TEXT,
          mistakes   INT NOT NULL DEFAULT 0,
          time_ms    INT NOT NULL DEFAULT 0,
          rank       INT, goals INT NOT NULL DEFAULT 0,
          board      JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS tr_seed    ON tourney_runs(seed);
        CREATE INDEX IF NOT EXISTS tr_uid_ts  ON tourney_runs(tg_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS tr_country  ON tourney_runs(country);
        CREATE TABLE IF NOT EXISTS tourney_names (
          name_lower TEXT PRIMARY KEY,
          tg_id      BIGINT NOT NULL,
          name       TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      console.log('[tourney] schema ready');
    } catch (e) { console.error('[tourney] schema:', e.message); }
  }
  ensureSchema();

  async function getGhosts(seed, excludeUid, n){
    const out = [];
    if (dbPool) {
      try {
        // recent OTHER real runs on this seed (one per player, freshest first)
        const q = await dbPool.query(
          `SELECT DISTINCT ON (tg_id) name, country, avatar, mistakes, time_ms, created_at
             FROM tourney_runs WHERE seed = $1 AND tg_id <> $2
             ORDER BY tg_id, created_at DESC`, [seed, String(excludeUid)]);
        const rows = (q.rows || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        for (const r of rows) { if (out.length >= n) break; out.push({ name: r.name || 'Duck', country: r.country, avatar: r.avatar, mistakes: r.mistakes, time_ms: r.time_ms }); }
      } catch (e) { console.error('[tourney] ghosts:', e.message); }
    }
    let i = 0; while (out.length < n) out.push(makeBot(seed, i++));   // cold-start fill with seeded bots
    return out.slice(0, n);
  }

  // current shared seed (public; everyone in the same 20-min window gets the same puzzle)
  app.get('/api/tourney/seed', (req, res) => res.json({ seed: Math.floor(Date.now() / ROUND_MS), roundMs: ROUND_MS }));

  // submit a finished run -> build the room, rank the player, award goals + prize, snapshot for history
  app.post('/api/tourney/submit', async (req, res) => {
    const body = req.body || {};
    const user = validateInitData(body.initData);
    if (!user) return res.status(401).json({ error: 'invalid initData' });
    const seed = Math.floor(Number(body.seed) || 0);
    const mistakes = Math.max(0, Math.min(99, Math.floor(Number(body.mistakes) || 0)));
    let timeMs = Math.max(0, Math.min(3600000, Math.floor(Number(body.timeMs) || 0)));
    if (timeMs < 4000) timeMs = 4000;                                   // anti-cheat lite: floor implausible times
    const known = (users && users.get(user.id)) || {};
    const country = (typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country)) ? body.country : (known.country || null);
    const name = String(body.name || user.first_name || user.username || 'Duck').slice(0, 24);
    const avatar = String(body.avatar || user.photo_url || '').slice(0, 300) || null;

    const ghosts = await getGhosts(seed, user.id, 4);
    const { board, rank, goals, prize } = scoreRoom({ name, country, avatar, mistakes, time_ms: timeMs }, ghosts);

    if (dbPool) {
      try {
        await dbPool.query(
          `INSERT INTO tourney_runs (seed, tg_id, name, country, avatar, mistakes, time_ms, rank, goals, board)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [seed, String(user.id), name, country, avatar, mistakes, timeMs, rank, goals, JSON.stringify(board)]);
        if (country) await dbPool.query('UPDATE players SET country = $2 WHERE tg_id = $1', [String(user.id), country]);
      } catch (e) { console.error('[tourney] submit:', e.message); }
    }
    if (noteUser) noteUser(user.id, { country: country || known.country });
    res.json({ ok: true, board, myRank: rank, goals, prize });
  });

  // a player's recent rooms (snapshotted boards) for the History tab
  app.post('/api/tourney/history', async (req, res) => {
    const user = validateInitData((req.body || {}).initData);
    if (!user) return res.status(401).json({ error: 'invalid initData' });
    let runs = [];
    if (dbPool) {
      try {
        const q = await dbPool.query(
          `SELECT seed, mistakes, time_ms, rank, goals, board, created_at
             FROM tourney_runs WHERE tg_id = $1 ORDER BY created_at DESC LIMIT 30`, [String(user.id)]);
        runs = (q.rows || []).map(r => ({ seed: String(r.seed), mistakes: r.mistakes, timeMs: r.time_ms, rank: r.rank, goals: r.goals, board: r.board, ts: r.created_at }));
      } catch (e) { console.error('[tourney] history:', e.message); }
    }
    res.json({ runs });
  });

  // World Cup standings: countries ranked by total goals (LEADERBOARD ONLY, no reward). Cached 60s.
  let _ccCache = { ts: 0, list: [] };
  app.get('/api/tourney/countries', async (req, res) => {
    const now = Date.now();
    if (now - _ccCache.ts < 60000) return res.json({ countries: _ccCache.list });
    let list = [];
    if (dbPool) {
      try {
        const q = await dbPool.query(
          `SELECT country, SUM(goals)::int AS goals, COUNT(*)::int AS plays, COUNT(DISTINCT tg_id)::int AS players
             FROM tourney_runs WHERE country IS NOT NULL GROUP BY country ORDER BY goals DESC, plays DESC LIMIT 60`);
        list = (q.rows || []).map(r => ({ country: r.country, goals: r.goals, plays: r.plays, players: r.players }));
      } catch (e) { console.error('[tourney] countries:', e.message); }
    }
    _ccCache = { ts: now, list };
    res.json({ countries: list });
  });

  // in-country members board: top players from one country by goals
  app.get('/api/tourney/country', async (req, res) => {
    const cc = String(req.query.cc || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return res.json({ country: cc, players: [] });
    let players = [];
    if (dbPool) {
      try {
        const q = await dbPool.query(
          `SELECT tg_id, MAX(name) AS name, SUM(goals)::int AS goals, COUNT(*)::int AS plays
             FROM tourney_runs WHERE country = $1 GROUP BY tg_id ORDER BY goals DESC, plays DESC LIMIT 50`, [cc]);
        players = (q.rows || []).map(r => ({ name: r.name || 'Duck', goals: r.goals, plays: r.plays }));
      } catch (e) { console.error('[tourney] in-country:', e.message); }
    }
    res.json({ country: cc, players });
  });

  // set/update the player's country flag (first-time picker)
  app.post('/api/tourney/flag', async (req, res) => {
    const body = req.body || {};
    const user = validateInitData(body.initData);
    if (!user) return res.status(401).json({ error: 'invalid initData' });
    const cc = String(body.country || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return res.status(400).json({ error: 'bad country' });
    if (noteUser) noteUser(user.id, { country: cc });
    if (dbPool) { try { await dbPool.query('UPDATE players SET country = $2 WHERE tg_id = $1', [String(user.id), cc]); } catch (e) {} }
    res.json({ ok: true, country: cc });
  });

  // reserve a UNIQUE duck name. ok:false + taken:true if another player already holds it (case-insensitive).
  app.post('/api/tourney/claim-name', async (req, res) => {
    const body = req.body || {};
    const user = validateInitData(body.initData);
    if (!user) return res.status(401).json({ error: 'invalid initData' });
    const name = String(body.name || '').trim().slice(0, 16);
    if (!name) return res.json({ ok: false });
    const nl = name.toLowerCase();
    if (!dbPool) return res.json({ ok: true, name });          // no DB -> accept (best effort)
    try {
      const q = await dbPool.query('SELECT tg_id FROM tourney_names WHERE name_lower = $1', [nl]);
      if (q.rows.length && String(q.rows[0].tg_id) !== String(user.id)) return res.json({ ok: false, taken: true });
      await dbPool.query('DELETE FROM tourney_names WHERE tg_id = $1 AND name_lower <> $2', [String(user.id), nl]);  // release my old name
      await dbPool.query(
        `INSERT INTO tourney_names (name_lower, tg_id, name) VALUES ($1,$2,$3)
         ON CONFLICT (name_lower) DO UPDATE SET tg_id = EXCLUDED.tg_id, name = EXCLUDED.name`,
        [nl, String(user.id), name]);
      res.json({ ok: true, name });
    } catch (e) { console.error('[tourney] claim-name:', e.message); res.json({ ok: true, name }); }  // fail open
  });

  console.log('[tourney] routes mounted (seed, submit, history, countries, country, flag, claim-name)');
}

module.exports = { register, scoreRoom, makeBot, ROUND_MS };
