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
  const score    = Math.floor(8 + r() * 38);                // GOALS (ducks found) before 3 lives gone: 8..46
  const time_ms  = Math.floor(60000 + r() * 240000);        // 1..5 min run
  return { name: BOT_NAMES[Math.floor(r() * BOT_NAMES.length)], country: BOT_CC[Math.floor(r() * BOT_CC.length)], avatar: null, score, time_ms, bot: true };
}

// pure scorer: a SURVIVAL run ranked by GOALS (ducks found) DESC, faster time breaks ties.
function scoreRoom(me, ghosts){
  const all = [{ ...me, me: true }, ...ghosts.map(g => ({ ...g, me: false }))];
  all.sort((a, b) => ((b.score || 0) - (a.score || 0)) || (a.time_ms - b.time_ms) || (a.me ? 1 : -1));
  const rank = all.findIndex(x => x.me) + 1;
  const goals = rank === 1 ? 3 : rank === 2 ? 2 : rank === 3 ? 1 : 0;      // feeds the country World Cup standings
  const prize = rank === 1 ? { gold: 100, sticker: true } : rank === 2 ? { gold: 50 } : rank === 3 ? { gold: 25 } : {};
  const board = all.map((x, i) => ({ rank: i + 1, name: x.name, country: x.country, avatar: x.avatar, score: (x.score || 0), timeMs: x.time_ms, me: !!x.me, bot: !!x.bot }));
  return { board, rank, goals, prize };
}

// ---- populated-leaderboard baseline (so the boards feel alive before real data accrues) ----
const BASE_COUNTRIES = [
  ['US',2200],['BR',2100],['IN',1950],['ID',1820],['RU',1700],['MX',1580],['TR',1460],['DE',1350],
  ['GB',1250],['FR',1160],['PH',1080],['VN',1000],['TH',930],['JP',860],['KR',800],['EG',740],
  ['IT',690],['ES',640],['PL',590],['UA',540],['AR',500],['NG',460],['PK',420],['CO',390],
  ['BD',360],['SA',330],['MY',300],['IR',270],
];
const SEED_NAMES = ['Lucky Duck','Sir Quacks','Pip','Waddles','Bubbles','Nugget','Sunny','Pebbles','Coco','Mochi','Biscuit','Dax','Olive','Ziggy','Tofu','Maple','Pumpkin','Suzu','Boba','Yolko','Peep','Splash','Goldie','Captain Quack','Mallard','Quackers','Puddles','Marigold','Cricket','Bingo','Noodle','Pickles','Waffles','Sprout','Clover','Dibble','Pim','Quill','Hazel','Tater','Munchkin','Beans','Fizz','Gizmo','Snickers','Waddington','Quackford','Featherly','Doodle','Pumpernickel'];
function _srng(s){ let x = (s >>> 0) || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function seedMembers(cc, n){           // deterministic in-country members so every country's board is populated
  let base = 0; for (const ch of cc) base = (base * 131 + ch.charCodeAt(0)) >>> 0;
  const rnd = _srng(base + 17), out = [], used = new Set();
  for (let i = 0; i < n; i++){
    let nm, t = 0; do { nm = SEED_NAMES[Math.floor(rnd() * SEED_NAMES.length)]; if (rnd() < 0.35) nm += ' ' + (2 + Math.floor(rnd() * 97)); t++; } while (used.has(nm) && t < 8); used.add(nm);
    const goals = Math.max(1, Math.round(150 * Math.pow(1 - i / (n + 6), 2.1) + rnd() * 10));
    out.push({ name: nm, goals, seed: true });
  }
  return out.sort((a, b) => b.goals - a.goals);
}
function guestUid(gid){ let h = 0; const s = String(gid); for (let i = 0; i < s.length; i++) h = (Math.imul(h, 131) + s.charCodeAt(i)) >>> 0; return 9000000000000 + h; } // stable BIGINT-safe id for an anonymous (native) player

function register(app, deps){
  const { dbPool, validateInitData, users, noteUser } = deps;
  // a Telegram user, or an anonymous native player keyed by their stable device id
  function resolveUser(body){
    const u = validateInitData(body && body.initData);
    if (u) return u;
    const gid = body && body.guestId;
    if (gid && typeof gid === 'string' && gid.length >= 4 && gid.length <= 80) return { id: guestUid(gid), first_name: '', username: '', guest: true };
    return null;
  }

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
          score      INT NOT NULL DEFAULT 0,
          time_ms    INT NOT NULL DEFAULT 0,
          rank       INT, goals INT NOT NULL DEFAULT 0,
          board      JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        ALTER TABLE tourney_runs ADD COLUMN IF NOT EXISTS score INT NOT NULL DEFAULT 0;
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
          `SELECT DISTINCT ON (tg_id) name, country, avatar, score, time_ms, created_at
             FROM tourney_runs WHERE seed = $1 AND tg_id <> $2
             ORDER BY tg_id, created_at DESC`, [seed, String(excludeUid)]);
        const rows = (q.rows || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        for (const r of rows) { if (out.length >= n) break; out.push({ name: r.name || 'Duck', country: r.country, avatar: r.avatar, score: r.score, time_ms: r.time_ms }); }
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
    const user = resolveUser(body);
    if (!user) return res.status(401).json({ error: 'invalid initData' });
    const seed = Math.floor(Number(body.seed) || 0);
    const score = Math.max(0, Math.min(999, Math.floor(Number(body.score) || 0)));   // GOALS (ducks found) this survival run
    let timeMs = Math.max(0, Math.min(3600000, Math.floor(Number(body.timeMs) || 0)));
    if (timeMs < 4000) timeMs = 4000;                                   // anti-cheat lite: floor implausible times
    const known = (users && users.get(user.id)) || {};
    const country = (typeof body.country === 'string' && /^[A-Z]{2}$/.test(body.country)) ? body.country : (known.country || null);
    const name = String(body.name || user.first_name || user.username || 'Duck').slice(0, 24);
    const avatar = String(body.avatar || user.photo_url || '').slice(0, 300) || null;

    const ghosts = await getGhosts(seed, user.id, 4);
    const { board, rank, goals, prize } = scoreRoom({ name, country, avatar, score, time_ms: timeMs }, ghosts);

    if (dbPool) {
      try {
        await dbPool.query(
          `INSERT INTO tourney_runs (seed, tg_id, name, country, avatar, score, time_ms, rank, goals, board)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [seed, String(user.id), name, country, avatar, score, timeMs, rank, goals, JSON.stringify(board)]);
        if (country) await dbPool.query('UPDATE players SET country = $2 WHERE tg_id = $1', [String(user.id), country]);
      } catch (e) { console.error('[tourney] submit:', e.message); }
    }
    if (noteUser) noteUser(user.id, { country: country || known.country });
    res.json({ ok: true, board, myRank: rank, goals, prize });
  });

  // a player's recent rooms (snapshotted boards) for the History tab
  app.post('/api/tourney/history', async (req, res) => {
    const user = resolveUser(req.body || {});
    if (!user) return res.status(401).json({ error: 'invalid initData' });
    let runs = [];
    if (dbPool) {
      try {
        const q = await dbPool.query(
          `SELECT seed, score, time_ms, rank, goals, board, created_at
             FROM tourney_runs WHERE tg_id = $1 ORDER BY created_at DESC LIMIT 30`, [String(user.id)]);
        runs = (q.rows || []).map(r => ({ seed: String(r.seed), score: r.score, timeMs: r.time_ms, rank: r.rank, goals: r.goals, board: r.board, ts: r.created_at }));
      } catch (e) { console.error('[tourney] history:', e.message); }
    }
    res.json({ runs });
  });

  // World Cup standings: countries ranked by total goals (LEADERBOARD ONLY, no reward). Cached 60s.
  let _ccCache = { ts: 0, list: [] };
  app.get('/api/tourney/countries', async (req, res) => {
    const now = Date.now();
    if (now - _ccCache.ts < 60000) return res.json({ countries: _ccCache.list });
    const tally = new Map(BASE_COUNTRIES);                       // cc -> total goals (seeded baseline)
    const playersByCc = new Map();
    if (dbPool) {
      try {
        const q = await dbPool.query(
          `SELECT country, SUM(score)::int AS score, COUNT(DISTINCT tg_id)::int AS players
             FROM tourney_runs WHERE country IS NOT NULL GROUP BY country`);
        for (const r of (q.rows || [])) { tally.set(r.country, (tally.get(r.country) || 0) + (r.score || 0)); playersByCc.set(r.country, r.players || 0); }
      } catch (e) { console.error('[tourney] countries:', e.message); }
    }
    const list = [...tally.entries()].map(([country, goals]) => ({ country, goals, players: (playersByCc.get(country) || 0) }))
      .sort((a, b) => b.goals - a.goals).slice(0, 25);            // top 25 only
    _ccCache = { ts: now, list };
    res.json({ countries: list });
  });

  // in-country members board: top players from one country by goals.
  // POST + caller-aware: always returns the CALLER's own row (flagged me:true in players, or summarized in `me`)
  // with a true rank against the whole population, so a player who just scored never shows "play to rank".
  const countryHandler = async (req, res) => {
    const body = req.body || {};
    const cc = String((body.cc || req.query.cc) || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return res.json({ country: cc, players: [], me: null });
    const caller = resolveUser(body);                            // POST body carries identity; legacy GET -> no caller (me:null)
    const callerId = caller ? String(caller.id) : null;
    const realById = new Map();                                  // tgId -> { tgId, name, goals }
    if (dbPool) {
      try {
        const q = await dbPool.query(
          `SELECT tg_id, MAX(name) AS name, SUM(score)::int AS goals FROM tourney_runs
             WHERE country = $1 GROUP BY tg_id ORDER BY SUM(score) DESC LIMIT 300`, [cc]);
        for (const r of (q.rows || [])) realById.set(String(r.tg_id), { tgId: String(r.tg_id), name: r.name || 'Duck', goals: r.goals || 0 });
      } catch (e) { console.error('[tourney] in-country:', e.message); }
    }
    // full population = real players + seeded fill (real players win name ties), ranked by goals
    const realNames = new Set([...realById.values()].map(p => p.name.toLowerCase()));
    const pop = [...realById.values()];
    for (const m of seedMembers(cc, 50)) { if (!realNames.has(m.name.toLowerCase())) pop.push({ tgId: null, name: m.name, goals: m.goals }); }
    pop.sort((a, b) => b.goals - a.goals);
    // the caller's OWN row + true rank against the whole population
    let me = null;
    if (callerId) {
      const idx = pop.findIndex(p => p.tgId === callerId);
      me = idx >= 0 ? { found: true, rank: idx + 1, goals: pop[idx].goals } : { found: false, rank: 0, goals: 0 };
    }
    const players = pop.slice(0, 50).map((p, i) => ({ rank: i + 1, name: p.name, goals: p.goals, me: !!(callerId && p.tgId === callerId) }));
    res.json({ country: cc, players, me });
  };
  app.get('/api/tourney/country', countryHandler);             // legacy clients (no caller -> me:null)
  app.post('/api/tourney/country', countryHandler);            // current clients (caller-aware)

  // set/update the player's country flag (first-time picker)
  app.post('/api/tourney/flag', async (req, res) => {
    const body = req.body || {};
    const user = resolveUser(body);
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
    const user = resolveUser(body);
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
