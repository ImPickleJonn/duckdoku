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
  res.json({ iap: !!BOT_TOKEN, dbReady, mixpanel_token: process.env.MIXPANEL_TOKEN || '' });
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
  const user = validateInitData((req.body || {}).initData);
  if (!user) return res.status(401).json({ error: 'invalid initData' });
  reportEvent('app_init', { userId: user.id, username: user.username });
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
    } else if (update.message && typeof update.message.text === 'string' && update.message.text.startsWith('/start')) {
      const m = update.message;
      const playUrl = process.env.GAME_URL || getPublicUrl(req) || 'https://duckdoku.onrender.com';
      const first = (m.from && (m.from.first_name || m.from.username)) || 'there';
      const text =
        'Hi ' + first + '! Welcome to Duckdoku.\n\n' +
        'A cozy block puzzle starring one very cute duck.\n\n' +
        'How it works\n' +
        'Drag the duck blocks onto the 9x9 board. Fill a full row, a full column, or a 3x3 square and it clears with a happy quack. Keep the board open as long as you can.\n\n' +
        'No ads. Just you, the board, and the duck.\n\n' +
        'Tap PLAY to start.';
      try {
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: m.chat.id, text,
            reply_markup: { inline_keyboard: [[{ text: 'PLAY DUCKDOKU', web_app: { url: playUrl } }]] },
          }),
        });
      } catch (e) {}
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

app.get('/healthz', (req, res) => res.json({ ok: true, dbReady }));

initSchema().finally(() => {
  app.listen(PORT, () => console.log(`Duckdoku server on :${PORT} (iap ${BOT_TOKEN ? 'on' : 'off'})`));
});
