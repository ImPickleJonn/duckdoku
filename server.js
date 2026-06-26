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
const fs = require('fs');
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
// Gold is the single in-game currency: it is earned by playing and spent on
// boosters (Hint / Undo / Place a Duck), heart refills, and sticker packs.
// Real money (Telegram Stars) buys GOLD, never boosters directly. Bundles add
// a few free Golden sticker packs on top. Telegram Stars: 1 Star ~= $0.013,
// smallest purchase >= 50 Stars (no 1-star paywall). grant schema the client
// understands: { gold?:number, packs?:{ basic?:number, golden?:number } }.
const SKUS = {
  gold_small: {
    id: 'gold_small', title: 'Pouch of Gold', description: '250 gold coins. Spend on boosters and sticker packs.',
    price: 60, priceUsd: '$0.79', grant: { gold: 250 },
  },
  gold_med: {
    id: 'gold_med', title: 'Sack of Gold', description: '800 gold coins. Better value.',
    price: 159, priceUsd: '$1.99', grant: { gold: 800 },
  },
  gold_large: {
    id: 'gold_large', title: 'Treasure Chest', description: '2000 gold coins. Best value.',
    price: 349, priceUsd: '$4.49', grant: { gold: 2000 },
  },
  starter_bundle: {
    id: 'starter_bundle', title: 'Starter Bundle', description: '600 gold plus 1 Golden sticker pack.',
    price: 199, priceUsd: '$2.59', grant: { gold: 600, packs: { golden: 1 } },
  },
  collector_bundle: {
    id: 'collector_bundle', title: 'Collector Bundle', description: '1800 gold plus 3 Golden sticker packs.',
    price: 499, priceUsd: '$6.49', grant: { gold: 1800, packs: { golden: 3 } },
  },
  test_purchase: {
    id: 'test_purchase', title: 'Test Purchase (admin)', description: 'Admin-only 1-star smoke test. Grants 50 gold.',
    price: 1, priceUsd: '$0.01', grant: { gold: 50 }, adminOnly: true,
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
    levelsDone: Math.max(Number(body.levelsDone) || 0, (users.get(user.id) || {}).levelsDone || 0),
    tz: (typeof body.tz === 'number') ? body.tz : (users.get(user.id) || {}).tz,
    first: user.first_name,
    name: user.first_name || user.username || 'Duck',
  });
  lbSaveSoon();
  res.json({ ok: true });
});

// Public leaderboard: top players by highest level reached.
app.get('/api/leaderboard', (req, res) => {
  const arr = [];
  for (const [, s] of users) { const lvl = s.levelsDone || 0; if (lvl > 0) arr.push({ name: s.name || s.first || 'Duck', level: lvl }); }
  arr.sort((a, b) => b.level - a.level);
  res.json({ top: arr.slice(0, 50) });
});

// ---- Adjust SERVER CALLBACK (install / attribution). In Adjust: Data management
//      -> Server callbacks -> New callback -> Activity type = Install -> paste the
//      /api/adjust-callback URL with the {placeholders} (see DUCKDOKU-ADJUST-SETUP.md).
//      ALWAYS returns 200 (Adjust retries on any non-2xx). Logs each hit as
//      [adjust-cb] and keeps a small in-memory ring of recent attributed installs.
//      Mirrors Rail the Way / Dumpling Drop. The endpoint is open (no secret). ----
const adjustLog = [];
app.get('/api/adjust-callback', (req, res) => {
  res.type('text/plain').send('ok');
  try {
    const q = req.query || {};
    const rec = {
      event: q.event || 'install', network: q.network || null, campaign: q.campaign || null,
      adgroup: q.adgroup || null, creative: q.creative || null, store: q.store || null,
      os: q.os || null, country: q.country || null, adid: q.adid || null,
      revenue: q.revenue || null, currency: q.currency || null, app_version: q.app_version || null,
      ts: Date.now(),
    };
    console.log('[adjust-cb]', JSON.stringify(rec));
    adjustLog.push(rec); if (adjustLog.length > 500) adjustLog.shift();
  } catch (e) {}
});

// FCM device tokens from the native Android app (Firebase Cloud Messaging).
// Stored in memory (add Postgres for durability). Server-side SEND additionally
// needs a Firebase Admin service account JSON (see fcmSend below) which is not
// wired yet, so this just collects tokens so push can be turned on later.
const fcmTokens = new Map(); // token -> { did, platform, lang, level, ts }
app.post('/api/fcm-register', (req, res) => {
  const b = req.body || {};
  const token = String(b.token || '').trim();
  if (!token || token.length > 400) return res.status(400).json({ error: 'bad token' });
  fcmTokens.set(token, { did: String(b.did || '').slice(0, 64), platform: String(b.platform || 'android').slice(0, 16), lang: (b.lang === 'ru' ? 'ru' : 'en'), level: Number(b.level) || 1, ts: Date.now() });
  if (fcmTokens.size > 50000) { const k = fcmTokens.keys().next().value; fcmTokens.delete(k); }
  res.json({ ok: true });
});
// Placeholder for server-side FCM push. Wire FIREBASE_SA (a Firebase Admin
// service account JSON from the Firebase console: Project settings, Service
// accounts) to enable sending; until then this is a safe no-op.
async function fcmSend(/* token, title, body */) { return false; }

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
          payments.push({ uid: payload.uid, sku: payload.sku, stars: sp.total_amount || sku.price || 0, chargeId: sp.telegram_payment_charge_id, ts: Date.now(), refunded: false });
          if (payments.length > 2000) payments.shift();
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

// Stars payments ledger (in-memory) for /refund within 48h.
const payments = []; // { uid, sku, stars, chargeId, ts, refunded }

// Leaderboard: highest level reached, from the in-memory users map with a
// best-effort disk snapshot so it survives restarts (add Postgres for full durability).
const LB_FILE = path.join(__dirname, 'data', 'leaderboard.json');
let lbTimer = null;
function lbSaveSoon() {
  if (lbTimer) return;
  lbTimer = setTimeout(() => {
    lbTimer = null;
    try {
      const arr = [];
      for (const [uid, s] of users) { const lvl = s.levelsDone || 0; if (lvl > 0) arr.push({ uid, name: s.name || s.first || 'Duck', level: lvl }); }
      arr.sort((a, b) => b.level - a.level);
      fs.mkdirSync(path.dirname(LB_FILE), { recursive: true });
      fs.writeFileSync(LB_FILE, JSON.stringify(arr.slice(0, 500)));
    } catch (e) {}
  }, 8000);
}
function lbLoad() {
  try {
    const arr = JSON.parse(fs.readFileSync(LB_FILE, 'utf8'));
    for (const r of arr) if (r && r.uid) { const s = users.get(r.uid) || { chatId: r.uid, lang: 'en', optOut: false }; if ((r.level || 0) > (s.levelsDone || 0)) { s.name = r.name; s.levelsDone = r.level; } users.set(r.uid, s); }
    console.log('[lb] loaded ' + arr.length + ' entries');
  } catch (e) {}
}

// ---- notification content (EN + RU, no emoji, no dashes, salt rotated) ----
// Each type carries several copy variants; a per-user daily salt rotates them so
// repeat sends never read the same. Mirrors the Rail the Way notification system.
const NOTIF_CTA = { en: 'Play now', ru: 'Играть' };
const NOTIF = {
  comeback: {
    en: ['Your ducks miss you. A fresh puzzle is waiting whenever you are ready.',
         'The pond has been quiet without you. One cozy puzzle to come back to?',
         'A little duck is still hiding, waiting for you to find it.'],
    ru: ['Утята скучают по тебе. Новая головоломка ждёт, когда захочешь.',
         'Без тебя на пруду тихо. Одна уютная головоломка, чтобы вернуться?',
         'Маленькая утка всё ещё прячется и ждёт, когда ты её найдёшь.'],
  },
  daily: {
    en: ['A new day, a new duck puzzle. Come find every hidden duck.',
         'Today the pond is fresh. Can you spot every duck?'],
    ru: ['Новый день, новая утиная головоломка. Найди всех спрятанных уток.',
         'Сегодня на пруду всё свежее. Найдёшь всех уток?'],
  },
  nudge: {
    en: ['One quick puzzle? The duck is ready when you are.',
         'Just one little duck to find. Quick game?',
         'A tidy little board is waiting. Find the duck?'],
    ru: ['Одна быстрая головоломка? Утка готова, когда и ты.',
         'Всего одна уточка, которую нужно найти. Быстрая игра?',
         'Тебя ждёт аккуратная доска. Найдёшь утку?'],
  },
  newlevels: {
    en: ['New puzzles are open. Think you can find every hidden duck?',
         'Fresh boards just landed. Ready for a trickier hunt?'],
    ru: ['Открылись новые головоломки. Думаешь, найдёшь всех спрятанных уток?',
         'Появились новые доски. Готов к более хитрой охоте?'],
  },
};
// Media pools per type: cute duck stills (photos) + animated 3D duck clips, all
// already shipped under /assets/ducks. sendNotif alternates photo and animation
// by a per-user daily salt and degrades gracefully photo -> animation -> text.
const NOTIF_MEDIA = {
  comeback:  { photos: ['assets/notif/comeback.png', 'assets/ducks/face-sad-frame.png', 'assets/ducks/hero-frame.png'],     anims: ['assets/ducks/hero.mp4', 'assets/ducks/face-happy.mp4'] },
  daily:     { photos: ['assets/notif/daily.png', 'assets/ducks/hero-frame.png', 'assets/ducks/face-happy-frame.png'],      anims: ['assets/ducks/hero.mp4', 'assets/ducks/victory.mp4'] },
  nudge:     { photos: ['assets/notif/nudge.png', 'assets/ducks/face-happy-frame.png', 'assets/ducks/hero-frame.png'],      anims: ['assets/ducks/hero.mp4', 'assets/ducks/face-happy.mp4'] },
  newlevels: { photos: ['assets/notif/newlevels.png', 'assets/ducks/victory-frame.png', 'assets/ducks/levelup-frame.png'],  anims: ['assets/ducks/victory.mp4', 'assets/ducks/levelup.mp4'] },
};
const NOTIF_COOLDOWN = { comeback: 48 * 3600e3, daily: 24 * 3600e3, nudge: 24 * 3600e3, newlevels: 36 * 3600e3 };
function notifAssetUrl(p) { return ASSET_BASE() + '/' + String(p).replace(/^\/+/, ''); }
function notifPick(arr, salt) { return (arr && arr.length) ? arr[Math.abs(salt | 0) % arr.length] : ''; }
async function sendNotif(s, key) {
  const def = NOTIF[key]; if (!def || !s || !s.chatId) return { ok: false };
  const lang = s.lang === 'ru' ? 'ru' : 'en';
  const salt = (Number(s.uid || s.chatId) || 0) + Math.floor(Date.now() / 86400000);
  const ri = Math.abs(salt | 0);
  const caption = notifPick(def[lang] || def.en, salt);
  if (!caption) return { ok: false };
  const reply_markup = { inline_keyboard: [[{ text: NOTIF_CTA[lang] || NOTIF_CTA.en, web_app: { url: GAME() } }]] };
  const media = NOTIF_MEDIA[key] || {};
  const photo = (media.photos && media.photos.length) ? notifAssetUrl(media.photos[ri % media.photos.length]) : '';
  const anim = (media.anims && media.anims.length) ? notifAssetUrl(media.anims[ri % media.anims.length]) : '';
  const photoItem = photo ? { m: 'sendPhoto', k: 'photo', v: photo } : null;
  const animItem = anim ? { m: 'sendAnimation', k: 'animation', v: anim } : null;
  // Alternate which media leads (animation vs photo) by salt, fall back across both, then text.
  const seq = ((ri % 2 === 0) ? [animItem, photoItem] : [photoItem, animItem]).filter(Boolean);
  for (const it of seq) {
    const payload = { chat_id: s.chatId, caption, reply_markup };
    payload[it.k] = it.v;
    const r = await tg(it.m, payload);
    if (r && r.ok) return r;
    if (r && r.error_code === 403) return r; // blocked: stop trying
  }
  return tg('sendMessage', { chat_id: s.chatId, text: caption, reply_markup });
}

// ---- loop: per-type cooldown + 3/day cap + 4h spacing + quiet hours + kill switch ----
const NOTIF_LOOP_MS = 10 * 60 * 1000;
const NOTIF_CAP_DAY = 3;
const NOTIF_MIN_SPACING_MS = 4 * 3600 * 1000;
const NOTIF_MAX_PER_PASS = 25;
function nowYMD() { return new Date().toISOString().slice(0, 10); }
function inQuiet(s) { const off = Number(s.tz) || 0; const h = (((new Date().getUTCHours()) + off) % 24 + 24) % 24; return h < 9 || h >= 22; }
function notifCan(s, key) {
  if (!s || s.optOut || !s.chatId) return false;
  if (inQuiet(s)) return false;
  if (Date.now() - (s.lastNotifTs || 0) < NOTIF_MIN_SPACING_MS) return false;
  if (s.notifYMD === nowYMD() && (s.notifN || 0) >= NOTIF_CAP_DAY) return false;
  const last = (s.notifLast && s.notifLast[key]) || 0;
  if (Date.now() - last < (NOTIF_COOLDOWN[key] || 24 * 3600e3)) return false;
  return true;
}
function pickTrigger(s) {
  const h = (Date.now() - (s.lastActive || 0)) / 3600000;
  const played = (s.levelsDone || 0) > 0;
  if (h >= 72 && notifCan(s, 'comeback')) return 'comeback';
  if (played && h >= 18 && h < 72 && notifCan(s, 'daily')) return 'daily';
  if (played && h >= 8 && notifCan(s, 'nudge')) return 'nudge';
  return null;
}
async function notifyLoop() {
  if (process.env.NOTIFY_OFF === '1' || !BOT_TOKEN) return;
  let sent = 0;
  for (const [uid, s] of users) {
    if (sent >= NOTIF_MAX_PER_PASS) break;
    try {
      const k = pickTrigger(s); if (!k) continue;
      s.uid = s.uid || uid;
      const r = await sendNotif(s, k);
      if (r && r.ok) {
        const ymd = nowYMD();
        s.notifN = (s.notifYMD === ymd ? (s.notifN || 0) : 0) + 1; s.notifYMD = ymd;
        s.lastNotifTs = Date.now();
        s.notifLast = s.notifLast || {}; s.notifLast[k] = Date.now();
        sent++;
      } else if (r && r.error_code === 403) { s.optOut = true; }
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
  paysupport: { en: 'Purchases in Duckdoku are handled securely by Telegram Stars, right inside the app. If something went wrong, you can refund your most recent purchase within 48 hours: just send /refund here and it reverts automatically. For anything else, write to us in this chat and we will read it.', ru: 'Покупки в Duckdoku проходят безопасно через Telegram Stars, прямо в приложении. Если что то пошло не так, можно вернуть последнюю покупку в течение 48 часов: просто отправь сюда /refund, и она отменится автоматически. По другим вопросам напиши в этот чат, мы прочитаем.' },
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
  if (cmd === 'paysupport') return tg('sendMessage', { chat_id: chat, text: BOTMSG.paysupport[lang] });
  if (cmd === 'refund') {
    const list = payments.filter(x => String(x.uid) === String(uid) && !x.refunded && (Date.now() - x.ts) < 48 * 3600 * 1000);
    if (!list.length) return tg('sendMessage', { chat_id: chat, text: lang === 'ru' ? 'Нет покупок для возврата за последние 48 часов.' : 'No refundable purchase found from the last 48 hours.' });
    const last = list[list.length - 1];
    const r = await tg('refundStarPayment', { user_id: parseInt(uid, 10), telegram_payment_charge_id: last.chargeId });
    if (r && r.ok) { last.refunded = true; return tg('sendMessage', { chat_id: chat, text: lang === 'ru' ? 'Готово. Звёзды за последнюю покупку возвращены.' : 'Done. Your most recent purchase has been refunded.' }); }
    return tg('sendMessage', { chat_id: chat, text: lang === 'ru' ? 'Не удалось вернуть. Напиши нам сюда.' : 'Refund could not be processed. Please message us here.' });
  }
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
  { command: 'paysupport', description: 'Payment help and refunds' },
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
  lbLoad();
  app.listen(PORT, () => console.log(`Duckdoku server on :${PORT} (iap ${BOT_TOKEN ? 'on' : 'off'})`));
  if (BOT_TOKEN) {
    setTimeout(() => { configureBotProfile().catch(() => {}); }, 1500);
    if (process.env.NOTIFY_OFF !== '1') setInterval(() => { notifyLoop().catch(() => {}); }, NOTIF_LOOP_MS);
  }
});
