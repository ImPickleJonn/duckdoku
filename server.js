// Duckdoku — Express server with Telegram Stars IAP.
// Serves the single-file game (index.html) and exposes a small API for buying
// boosters via Telegram Stars (currency XTR). Game state lives in the browser
// (localStorage), optionally mirrored to Postgres for cross-device sync. The
// server is the source of truth for prices + what a purchase grants; the
// client just applies the grant it receives after a successful payment.
//
// No ads. Ever. The only money flow is Stars boosters.
//
// Env:
//   BOT_TOKEN            Telegram bot token (enables IAP + bot). Optional locally.
//   TELEGRAM_ADMIN_IDS   space/comma separated tg ids (for the 1-star test SKU).
//   DATABASE_URL         Postgres (optional). Without it: in-memory + localStorage.
//   PORT                 default 3000.
//   PUBLIC_URL           override the play URL used in the /start button.
//   NOTIF_BOT_URL/SECRET optional purchase pings to the shared data-HQ bot.

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || process.argv[2] || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;
const WEBHOOK_SECRET = BOT_TOKEN
  ? crypto.createHash('sha256').update(BOT_TOKEN).digest('hex').slice(0, 32)
  : null;

// ----- Optional purchase ping to the shared data-HQ bot (safe no-op) -----
const NOTIF_BOT_URL = process.env.NOTIF_BOT_URL || '';
const NOTIF_SECRET = process.env.NOTIF_SECRET || '';
const NOTIF_GAME_ID = 'duckdoku';
function notifyPurchase(info) {
  if (!NOTIF_BOT_URL || !NOTIF_SECRET) return;
  try {
    fetch(NOTIF_BOT_URL.replace(/\/+$/, '') + '/api/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-notif-key': NOTIF_SECRET },
      body: JSON.stringify({ game: NOTIF_GAME_ID, sku: info.sku, stars: info.stars, userId: info.userId, username: info.username, ts: Date.now() }),
    }).catch(() => {});
  } catch (_e) {}
}
function reportEvent(event, info) {
  if (!NOTIF_BOT_URL || !NOTIF_SECRET) return;
  try {
    fetch(NOTIF_BOT_URL.replace(/\/+$/, '') + '/api/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-notif-key': NOTIF_SECRET },
      body: JSON.stringify({ game: NOTIF_GAME_ID, event, userId: info.userId, username: info.username, ts: Date.now() }),
    }).catch(() => {});
  } catch (_e) {}
}

// ----- SKU catalog (server is source of truth) -----
// 3 boosters: Place-a-Duck (free single-cell duck), Hint (highlight a valid
// move), Undo (revert last placement). Sold as small packs + value bundles.
// Telegram Stars: 1 Star ~= $0.013. Smallest purchase >= 50 Stars (no 1-star
// paywall). grant.boosters keys MUST match the client BOOSTERS ids.
const SKUS = {
  hint_pack: {
    id: 'hint_pack', title: 'Hints x5', description: '5 Hints. Highlights a duck you can place right now.',
    price: 60, priceUsd: '$0.79', grant: { boosters: { hint: 5 } },
  },
  undo_pack: {
    id: 'undo_pack', title: 'Undos x5', description: '5 Undos. Take back your last placement.',
    price: 60, priceUsd: '$0.79', grant: { boosters: { undo: 5 } },
  },
  placeduck_pack: {
    id: 'placeduck_pack', title: 'Place a Duck x5', description: '5 magic single ducks you can drop on any empty cell.',
    price: 90, priceUsd: '$1.19', grant: { boosters: { placeduck: 5 } },
  },
  helper_bundle: {
    id: 'helper_bundle', title: 'Helper Bundle', description: '10 Hints, 10 Undos and 10 Place a Duck. Best starter value.',
    price: 199, priceUsd: '$2.59', grant: { boosters: { hint: 10, undo: 10, placeduck: 10 } },
  },
  pond_bundle: {
    id: 'pond_bundle', title: 'Big Pond Bundle', description: '30 Hints, 30 Undos and 30 Place a Duck.',
    price: 499, priceUsd: '$6.49', grant: { boosters: { hint: 30, undo: 30, placeduck: 30 } },
  },
  test_purchase: {
    id: 'test_purchase', title: 'Test Purchase (admin)', description: 'Admin-only 1-star smoke test. Grants 1 Hint.',
    price: 1, priceUsd: '$0.01', grant: { boosters: { hint: 1 } }, adminOnly: true,
  },
};

// ----- Postgres (optional): idempotent IAP ledger + cross-device save -----
const DATABASE_URL = process.env.DATABASE_URL || '';
let dbPool = null, dbReady = false;
if (DATABASE_URL) {
  dbPool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 8 });
  dbPool.on('error', (e) => console.error('[pg] pool error', e.message));
}
async function initSchema() {
  if (!dbPool) { console.log('[pg] DATABASE_URL not set — running in-memory + localStorage only'); return; }
  try {
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS players (
        tg_id      BIGINT PRIMARY KEY,
        first_name TEXT, username TEXT,
        save       JSONB NOT NULL DEFAULT '{}'::jsonb,
        lang       TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS iap_grants (
        payment_charge_id TEXT PRIMARY KEY,
        tg_id   BIGINT NOT NULL,
        sku     TEXT NOT NULL,
        stars   INTEGER NOT NULL DEFAULT 0,
        grant_data JSONB NOT NULL,
        applied_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    dbReady = true;
    console.log('[pg] schema ready');
  } catch (e) { console.error('[pg] initSchema failed:', e.message); }
}

// ----- Telegram initData validation -----
function validateInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dcs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const expected = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    if (hash !== expected) return null;
    const userStr = params.get('user');
    return userStr ? JSON.parse(userStr) : null;
  } catch (e) { return null; }
}
function parseAdminIds() {
  return String(process.env.TELEGRAM_ADMIN_IDS || '').split(/[\s,;|]+/).map(s => s.trim()).filter(Boolean);
}
function isAdmin(id) { return parseAdminIds().includes(String(id)); }

// ----- pending grant queue (in-memory fallback when no DB) -----
const pendingByUser = new Map();
function pushPending(uid, sku) {
  if (!SKUS[sku]) return;
  if (!pendingByUser.has(uid)) pendingByUser.set(uid, []);
  pendingByUser.get(uid).push({ sku, grant: SKUS[sku].grant, ts: Date.now() });
}
function drainPending(uid) { const a = pendingByUser.get(uid) || []; pendingByUser.delete(uid); return a; }

function getPublicUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN;
  if (req) {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    if (host) return `${proto}://${host}`;
  }
  return '';
}

// CORS: the game is served from Cloudflare Pages and calls this API
// cross-origin. No cookies/credentials are used (auth travels as initData in
// the body), so a permissive origin is safe for these endpoints.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-setup-key');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.json({ limit: '256kb' }));
app.use(express.static(__dirname, {
  setHeaders: (res, fp) => { if (fp.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate'); },
}));

// Feature flags + public config the client reads on boot.
app.get('/api/flags', (req, res) => {
  const cc = String(req.headers['cf-ipcountry'] || '').toUpperCase();
  res.json({
    iap: !!BOT_TOKEN, dbReady,
    mixpanel_token: process.env.MIXPANEL_TOKEN || '',
    country: (cc && cc !== 'XX' && cc !== 'T1') ? cc : '',
  });
});

// List SKUs (client renders the shop from this).
app.get('/api/skus', (req, res) => {
  res.json({
    enabled: !!BOT_TOKEN,
    skus: Object.values(SKUS).filter(s => !s.adminOnly).map(s => ({
      id: s.id, title: s.title, description: s.description, price: s.price, priceUsd: s.priceUsd, grant: s.grant,
    })),
  });
});

// Create a Stars invoice link for a SKU.
app.post('/api/create-invoice', async (req, res) => {
  if (!BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN not set' });
  const { sku, initData } = req.body || {};
  const user = validateInitData(initData);
  if (!user) return res.status(401).json({ error: 'invalid initData' });
  const item = SKUS[sku];
  if (!item) return res.status(400).json({ error: 'unknown sku' });
  if (item.adminOnly && !isAdmin(user.id)) return res.status(403).json({ error: 'sku is admin-only' });
  const payload = JSON.stringify({ uid: user.id, sku, ts: Date.now() });
  try {
    const r = await fetch(`${TELEGRAM_API}/createInvoiceLink`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: item.title, description: item.description, payload,
        provider_token: '', currency: 'XTR', prices: [{ label: item.title, amount: item.price }],
      }),
    });
    const data = await r.json();
    if (!data.ok) return res.status(500).json({ error: data.description || 'telegram api failed' });
    res.json({ link: data.result });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
});

// Client polls after openInvoice resolves 'paid'. Drains unapplied grants.
app.post('/api/poll-purchases', async (req, res) => {
  const user = validateInitData((req.body || {}).initData);
  if (!user) return res.status(401).json({ error: 'invalid initData' });
  if (dbReady) {
    try {
      const q = await dbPool.query(
        `UPDATE iap_grants SET applied_at = now() WHERE tg_id = $1 AND applied_at IS NULL RETURNING sku, grant_data`,
        [user.id]
      );
      return res.json({ purchases: q.rows.map(r => ({ sku: r.sku, grant: r.grant_data })) });
    } catch (e) { console.error('[iap] poll db error:', e.message); }
  }
  res.json({ purchases: drainPending(user.id) });
});

// Cross-device save (optional, DB-gated). Server is source of truth.
app.post('/api/sync/load', async (req, res) => {
  const user = validateInitData((req.body || {}).initData);
  if (!user) return res.status(401).json({ error: 'invalid initData' });
  if (!dbReady) return res.json({ save: null });
  try {
    const q = await dbPool.query('SELECT save FROM players WHERE tg_id = $1', [user.id]);
    if (!q.rows.length) {
      await dbPool.query(
        `INSERT INTO players (tg_id, first_name, username) VALUES ($1,$2,$3) ON CONFLICT (tg_id) DO NOTHING`,
        [user.id, user.first_name || null, user.username || null]
      );
      return res.json({ save: null });
    }
    res.json({ save: q.rows[0].save || null });
  } catch (e) { res.status(500).json({ error: 'load failed' }); }
});
app.post('/api/sync/save', async (req, res) => {
  const body = req.body || {};
  const user = validateInitData(body.initData);
  if (!user) return res.status(401).json({ error: 'invalid initData' });
  if (!dbReady) return res.json({ ok: true, persisted: false });
  const save = body.save;
  if (!save || typeof save !== 'object') return res.status(400).json({ error: 'save must be object' });
  try {
    await dbPool.query(
      `INSERT INTO players (tg_id, first_name, username, save, lang, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
       ON CONFLICT (tg_id) DO UPDATE SET save = $4, lang = COALESCE($5, players.lang),
         first_name = $2, username = $3, updated_at = now()`,
      [user.id, user.first_name || null, user.username || null, JSON.stringify(save), body.lang || null]
    );
    res.json({ ok: true, persisted: true });
  } catch (e) { res.status(500).json({ error: 'save failed' }); }
});

// Lightweight heartbeat for retention telemetry.
app.post('/api/heartbeat', (req, res) => {
  const body = req.body || {};
  const user = validateInitData(body.initData);
  if (!user) return res.status(401).json({ error: 'invalid initData' });
  reportEvent('app_init', { userId: user.id, username: user.username });
  // Learn enough to schedule re-engagement DMs (chat id == user id for private chats).
  noteUser(user.id, {
    chatId: user.id,
    lang: (body.lang || user.language_code || 'en').slice(0, 2) === 'ru' ? 'ru' : 'en',
    lastActive: Date.now(),
    levelsDone: Number(body.levelsDone) || 0,
    tz: (typeof body.tz === 'number') ? body.tz : (users.get(user.id) || {}).tz,
    first: user.first_name,
  });
  res.json({ ok: true });
});

// Telegram webhook: answer pre_checkout fast, record successful payments.
app.post('/api/telegram-webhook', async (req, res) => {
  if (WEBHOOK_SECRET && req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) return res.status(403).end();
  const update = req.body || {};
  try {
    if (update.pre_checkout_query) {
      await fetch(`${TELEGRAM_API}/answerPreCheckoutQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pre_checkout_query_id: update.pre_checkout_query.id, ok: true }),
      });
    } else if (update.message && update.message.successful_payment) {
      const sp = update.message.successful_payment;
      try {
        const payload = JSON.parse(sp.invoice_payload);
        if (payload && payload.uid && SKUS[payload.sku]) {
          const sku = SKUS[payload.sku];
          if (dbReady) {
            try {
              await dbPool.query(
                `INSERT INTO iap_grants (payment_charge_id, tg_id, sku, stars, grant_data)
                 VALUES ($1,$2,$3,$4,$5) ON CONFLICT (payment_charge_id) DO NOTHING`,
                [sp.telegram_payment_charge_id || ('mem:' + Date.now()), payload.uid, payload.sku, sp.total_amount || 0, sku.grant]
              );
            } catch (e) { console.error('[iap] webhook db write:', e.message); }
          }
          pushPending(payload.uid, payload.sku);
          notifyPurchase({ sku: payload.sku, stars: sp.total_amount || sku.price || 0, userId: payload.uid, username: update.message.from && update.message.from.username });
        }
      } catch (e) { /* malformed payload */ }
    } else if (update.message && typeof update.message.text === 'string') {
      try { await handleCommand(update.message); } catch (e) {}
    }
  } catch (e) { /* never crash on a webhook */ }
  res.json({ ok: true });
});

// One-time webhook registration: curl -X POST <url>/api/setup-webhook -H "x-setup-key: <BOT_TOKEN>"
app.post('/api/setup-webhook', async (req, res) => {
  if (!BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN not set' });
  if (req.headers['x-setup-key'] !== BOT_TOKEN) return res.status(403).json({ error: 'wrong setup key (must equal BOT_TOKEN)' });
  const url = getPublicUrl(req) + '/api/telegram-webhook';
  try {
    const r = await fetch(`${TELEGRAM_API}/setWebhook`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, secret_token: WEBHOOK_SECRET, allowed_updates: ['pre_checkout_query', 'message'], drop_pending_updates: true }),
    });
    res.json({ webhook_url: url, telegram: await r.json() });
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
});

// Set the bot's menu button to open the game + register the command list.
app.post('/api/setup-bot', async (req, res) => {
  if (!BOT_TOKEN) return res.status(500).json({ error: 'BOT_TOKEN not set' });
  if (req.headers['x-setup-key'] !== BOT_TOKEN) return res.status(403).json({ error: 'wrong setup key' });
  const url = process.env.GAME_URL || getPublicUrl(req);
  try {
    const out = {};
    let r = await fetch(`${TELEGRAM_API}/setChatMenuButton`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ menu_button: { type: 'web_app', text: 'Play', web_app: { url } } }),
    });
    out.menuButton = await r.json();
    r = await fetch(`${TELEGRAM_API}/setMyCommands`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: [
        { command: 'start', description: 'Play Duckdoku' },
        { command: 'help', description: 'How to play' },
      ] }),
    });
    out.commands = await r.json();
    res.json(out);
  } catch (e) { res.status(500).json({ error: String((e && e.message) || e) }); }
});

// ============ Telegram bot: notifications, commands, /preview ============
function tg(method, body) {
  if (!TELEGRAM_API) return Promise.resolve({ ok: false });
  return fetch(`${TELEGRAM_API}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(r => r.json()).catch(e => ({ ok: false, error: String((e && e.message) || e) }));
}
const GAME = () => process.env.GAME_URL || 'https://duckdoku.com/game';
const ASSET_BASE = () => (process.env.ASSET_BASE || 'https://duckdoku.com').replace(/\/+$/, '');
function playKb(lang) { return { inline_keyboard: [[{ text: lang === 'ru' ? 'Играть' : 'Play Duckdoku', web_app: { url: GAME() } }]] }; }

// In-memory player state for re-engagement DMs (populated by /start + /api/heartbeat).
// Lost on restart; add a Postgres mirror later for durable cross-restart notifications.
const users = new Map();
function noteUser(uid, patch) { if (!uid) return null; const s = users.get(uid) || { chatId: uid, lang: 'en', optOut: false }; Object.assign(s, patch); users.set(uid, s); return s; }

// ---- notification content (EN + RU, no emoji, no dashes) ----
const NOTIF_CTA = { en: 'Play now', ru: 'Играть' };
const NOTIF = {
  comeback:  { media: 'comeback',  en: 'Your ducks miss you. A fresh puzzle is waiting whenever you are ready.', ru: 'Утята скучают по тебе. Новая головоломка ждёт, когда захочешь.' },
  daily:     { media: 'daily',     en: 'A new day, a new duck puzzle. Come find every hidden duck.', ru: 'Новый день, новая утиная головоломка. Найди всех спрятанных уток.' },
  newlevels: { media: 'celebrate', en: 'New levels are open. Think you can find every hidden duck?', ru: 'Открылись новые уровни. Думаешь, найдёшь всех спрятанных уток?' },
  gift:      { media: 'gift',      en: 'A little gift is waiting. A free booster for your next puzzle.', ru: 'Тебя ждёт подарок. Бесплатный бустер для следующей головоломки.' },
  nudge:     { media: 'comeback',  en: 'One quick puzzle? The duck is ready when you are.', ru: 'Одна быстрая головоломка? Утка готова, когда и ты.' },
};
// media key -> filename served from /assets/notif (set once art/gifs are generated). Empty -> text only.
const NOTIF_MEDIA = {};
function notifMediaUrl(key) { const f = NOTIF_MEDIA[key]; return f ? (ASSET_BASE() + '/assets/notif/' + f) : ''; }
async function sendNotif(s, key) {
  const def = NOTIF[key]; if (!def) return { ok: false };
  const lang = s.lang === 'ru' ? 'ru' : 'en';
  const caption = def[lang] || def.en;
  const reply_markup = { inline_keyboard: [[{ text: NOTIF_CTA[lang] || NOTIF_CTA.en, web_app: { url: GAME() } }]] };
  const url = notifMediaUrl(def.media);
  if (url && /\.(mp4|gif)(\?|$)/i.test(url)) return tg('sendAnimation', { chat_id: s.chatId, animation: url, caption, reply_markup });
  if (url) return tg('sendPhoto', { chat_id: s.chatId, photo: url, caption, reply_markup });
  return tg('sendMessage', { chat_id: s.chatId, text: caption, reply_markup });
}

// ---- loop: cooldowns + daily cap + quiet hours + NOTIFY_OFF kill switch ----
const NOTIF_LOOP_MS = 10 * 60 * 1000;
function nowYMD() { return new Date().toISOString().slice(0, 10); }
function inQuiet(s) { const off = Number(s.tz) || 0; const h = (((new Date().getUTCHours()) + off) % 24 + 24) % 24; return h < 9 || h >= 22; }
function canNotify(s) {
  if (s.optOut) return false;
  if (Date.now() - (s.lastNotifTs || 0) < 22 * 3600 * 1000) return false;
  if (s.notifYMD === nowYMD() && (s.notifN || 0) >= 1) return false;
  if (inQuiet(s)) return false;
  return true;
}
function pickTrigger(s) { const h = (Date.now() - (s.lastActive || 0)) / 3600000; if (h >= 48) return 'comeback'; if (h >= 20) return 'daily'; return null; }
async function notifyLoop() {
  if (process.env.NOTIFY_OFF === '1' || !BOT_TOKEN) return;
  for (const [, s] of users) {
    try {
      if (!canNotify(s)) continue;
      const k = pickTrigger(s); if (!k) continue;
      const r = await sendNotif(s, k);
      if (r && r.ok) { const ymd = nowYMD(); s.notifN = (s.notifYMD === ymd ? (s.notifN || 0) : 0) + 1; s.notifYMD = ymd; s.lastNotifTs = Date.now(); }
      else if (r && (r.error_code === 403)) { s.optOut = true; }
      await new Promise(res => setTimeout(res, 150));
    } catch (e) {}
  }
}

// ---- bot copy (EN + RU, no emoji, no dashes) ----
const BOTMSG = {
  help: { en: 'How to play Duckdoku\n\nA duck is hiding in one cell of every colored area. Find them all.\n\nRules\nOne duck per colored area.\nOne duck per row and per column.\nNo two ducks may touch, not even diagonally.\n\nControls\nSingle tap marks an X note where a duck cannot be.\nSwipe across cells to mark a whole row or column quickly.\nDouble tap to place a duck. A wrong guess leaves a red X and costs a heart.\n\nBoosters\nHint, Undo, and Place a Duck. No ads, ever.',
        ru: 'Как играть в Duckdoku\n\nВ каждой цветной зоне в одной клетке прячется утка. Найди их всех.\n\nПравила\nПо одной утке в каждой цветной зоне.\nПо одной утке в каждом ряду и столбце.\nУтки не должны соприкасаться, даже по диагонали.\n\nУправление\nОдно нажатие ставит метку X, где утки быть не может.\nПроведи пальцем по клеткам, чтобы быстро отметить ряд.\nДвойное нажатие ставит утку. Неверная догадка оставляет красный X и стоит сердце.\n\nБустеры\nПодсказка, Назад и Утка. Без рекламы.' },
  faq: { en: 'Duckdoku FAQ\n\nAre there ads? No. Never.\nHow do boosters work? Hint shows where to look, Undo takes back your notes, Place a Duck reveals one. Buy more with Telegram Stars.\nLost progress? Your progress is saved on this device, and in your Telegram account when you play in the app.\nStuck on a level? Use a Hint, or mark X notes to narrow it down.',
        ru: 'Частые вопросы\n\nЕсть реклама? Нет. Никогда.\nКак работают бустеры? Подсказка показывает, где искать, Назад отменяет заметки, Утка открывает одну. Больше можно купить за Telegram Stars.\nПропал прогресс? Прогресс хранится на устройстве и в твоём аккаунте Telegram при игре в приложении.\nЗастрял на уровне? Используй Подсказку или отмечай X, чтобы сузить варианты.' },
  about: { en: 'Duckdoku is a cozy logic puzzle. Find the duck hiding in every colored area without breaking the rules. Made with love and a lot of ducks.', ru: 'Duckdoku это уютная логическая головоломка. Найди утку, спрятанную в каждой цветной зоне, не нарушая правил. Сделано с любовью и множеством уток.' },
  support: { en: 'Need help or found a bug? Message the team at @ImPickleJonn and we will take a look.', ru: 'Нужна помощь или нашёл ошибку? Напиши команде @ImPickleJonn, и мы посмотрим.' },
  privacy: { en: 'Privacy\n\nDuckdoku stores your game progress on your device and, in the Telegram app, in your account so it follows you across devices. We use anonymous analytics to improve the game. We never sell your data. No ads.', ru: 'Конфиденциальность\n\nDuckdoku хранит прогресс на устройстве и, в приложении Telegram, в аккаунте, чтобы он был с тобой на всех устройствах. Мы используем анонимную аналитику, чтобы улучшать игру. Мы не продаём данные. Без рекламы.' },
  terms: { en: 'Terms\n\nDuckdoku is provided as is for your enjoyment. Booster purchases are made with Telegram Stars and are final. Play fair and have fun.', ru: 'Условия\n\nDuckdoku предоставляется как есть для твоего удовольствия. Покупки бустеров совершаются за Telegram Stars и возврату не подлежат. Играй честно и получай удовольствие.' },
  muted: { en: 'You will not get reminder messages anymore. Send /start any time to come back.', ru: 'Ты больше не будешь получать напоминания. Отправь /start, когда захочешь вернуться.' },
};
function welcomeText(first) {
  return 'Hi ' + (first || 'there') + '. Welcome to Duckdoku.\n\n' +
    'A cozy logic puzzle. A duck is hiding in one cell of every colored area. Find them all without two ducks sharing a row, a column, or touching.\n\n' +
    'No ads. Just you, the board, and the ducks.\n\nTap Play to start.';
}
async function previewAll(chatId, lang) {
  await tg('sendMessage', { chat_id: chatId, text: 'Preview of every push notification (' + Object.keys(NOTIF).length + '):' });
  for (const k of Object.keys(NOTIF)) {
    await tg('sendMessage', { chat_id: chatId, text: 'trigger: ' + k });
    await sendNotif({ chatId, lang }, k);
    await new Promise(r => setTimeout(r, 350));
  }
  await tg('sendMessage', { chat_id: chatId, text: 'End of preview.' });
}
function statsText() {
  let total = users.size, active = 0, opted = 0; const now = Date.now();
  for (const [, s] of users) { if (now - (s.lastActive || 0) < 86400000) active++; if (s.optOut) opted++; }
  return 'Duckdoku stats (in memory since last restart)\nKnown users: ' + total + '\nActive last 24h: ' + active + '\nOpted out: ' + opted;
}
async function handleCommand(m) {
  const txt = String(m.text || '').trim(); const uid = m.from && m.from.id; const chat = m.chat.id;
  const lang = ((m.from && m.from.language_code) || 'en').slice(0, 2) === 'ru' ? 'ru' : 'en';
  noteUser(uid, { chatId: chat, lang, lastActive: Date.now(), first: m.from && m.from.first_name });
  const cmd = (txt.match(/^\/([a-z]+)/) || [, ''])[1];
  if (cmd === 'start') return tg('sendMessage', { chat_id: chat, text: welcomeText(m.from && (m.from.first_name || m.from.username)), reply_markup: playKb(lang) });
  if (cmd === 'help' || cmd === 'howto' || cmd === 'how') return tg('sendMessage', { chat_id: chat, text: BOTMSG.help[lang], reply_markup: playKb(lang) });
  if (cmd === 'faq') return tg('sendMessage', { chat_id: chat, text: BOTMSG.faq[lang], reply_markup: playKb(lang) });
  if (cmd === 'about') return tg('sendMessage', { chat_id: chat, text: BOTMSG.about[lang], reply_markup: playKb(lang) });
  if (cmd === 'support') return tg('sendMessage', { chat_id: chat, text: BOTMSG.support[lang] });
  if (cmd === 'privacy') return tg('sendMessage', { chat_id: chat, text: BOTMSG.privacy[lang] });
  if (cmd === 'terms') return tg('sendMessage', { chat_id: chat, text: BOTMSG.terms[lang] });
  if (cmd === 'stop' || cmd === 'mute') { noteUser(uid, { optOut: true }); return tg('sendMessage', { chat_id: chat, text: BOTMSG.muted[lang] }); }
  if (cmd === 'stats') { if (isAdmin(uid)) return tg('sendMessage', { chat_id: chat, text: statsText() }); return; }
  if (cmd === 'preview') { if (isAdmin(uid)) return previewAll(chat, lang); return; }
  // any other message: gentle nudge to play
  return tg('sendMessage', { chat_id: chat, text: welcomeText(m.from && (m.from.first_name || m.from.username)), reply_markup: playKb(lang) });
}

// Register the bot profile: command list (EN + RU), description, menu button.
const BOT_CMDS = [
  { command: 'start', description: 'Play Duckdoku' },
  { command: 'help', description: 'How to play' },
  { command: 'faq', description: 'Frequently asked questions' },
  { command: 'about', description: 'About Duckdoku' },
  { command: 'support', description: 'Get help' },
  { command: 'privacy', description: 'Privacy' },
  { command: 'terms', description: 'Terms' },
];
async function configureBotProfile() {
  if (!BOT_TOKEN) return;
  await tg('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Play', web_app: { url: GAME() } } });
  await tg('setMyCommands', { commands: BOT_CMDS });
  await tg('setMyCommands', { commands: BOT_CMDS, language_code: 'ru' });
  await tg('setMyShortDescription', { short_description: 'A cozy duck logic puzzle. Find the hidden duck in every area. No ads.' });
  await tg('setMyDescription', { description: 'Duckdoku is a cozy logic puzzle. A duck hides in one cell of every colored area. Find them all without two ducks sharing a row, a column, or touching. No ads.' });
}

// Account / data deletion (Play + Telegram compliance). Validates the caller
// via Telegram initData and removes their server-side data. The page at
// /delete-account also clears on-device localStorage.
app.post('/api/delete-account', async (req, res) => {
  const user = validateInitData((req.body || {}).initData);
  if (!user) return res.status(401).json({ error: 'invalid initData' });
  try { users.delete(user.id); } catch (e) {}
  try { drainPending(user.id); } catch (e) {}
  if (dbReady) {
    try {
      await dbPool.query('DELETE FROM players WHERE tg_id = $1', [user.id]);
      await dbPool.query('DELETE FROM iap_grants WHERE tg_id = $1', [user.id]);
    } catch (e) { console.error('[delete] db error:', e.message); }
  }
  console.log('[delete] removed data for', user.id);
  res.json({ ok: true });
});

// Secret-guarded endpoint so the local ship-notify script can DM the owner
// without ever holding the bot token (token stays on the server).
app.post('/api/ship-notify', async (req, res) => {
  const secret = process.env.SHIP_SECRET || '';
  if (!secret || req.headers['x-ship-key'] !== secret) return res.status(403).json({ error: 'forbidden' });
  const text = String((req.body && req.body.text) || '').slice(0, 3800);
  if (!text) return res.status(400).json({ error: 'no text' });
  const ids = parseAdminIds(); let sent = 0;
  for (const id of ids) { const r = await tg('sendMessage', { chat_id: id, text }); if (r && r.ok) sent++; }
  res.json({ ok: true, sent });
});

app.get('/healthz', (req, res) => res.json({ ok: true, dbReady }));

initSchema().finally(() => {
  app.listen(PORT, () => console.log(`Duckdoku server on :${PORT} (iap ${BOT_TOKEN ? 'on' : 'off'})`));
  if (BOT_TOKEN) {
    setTimeout(() => { configureBotProfile().catch(() => {}); }, 1500);
    if (process.env.NOTIFY_OFF !== '1') setInterval(() => { notifyLoop().catch(() => {}); }, NOTIF_LOOP_MS);
  }
});
