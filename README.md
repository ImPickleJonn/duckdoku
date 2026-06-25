# Duckdoku

A cozy **duck logic puzzle** for Telegram. A 1:1 take on **Meowdoku** (which is a Queens / Star-Battle logic puzzle, *not* a block puzzle), reskinned with one very cute animated 3D duck. **No ads, ever.** The only money flow is three optional boosters bought with Telegram Stars.

## The game

- An **N x N** board split into **N colored regions**.
- Place **one duck per region**. No two ducks may share a **row** or **column**, and none may **touch, not even diagonally**.
- **Tap a cell** to cycle it: empty, then an **X note** (where no duck can go), then a **duck**, then empty again.
- **3 hearts.** A duck that breaks a rule is a mistake and costs a heart. Lose all three and the puzzle restarts (free).
- Win = a valid duck in every region. The duck plays a trumpet fanfare.

### Modes
- **Adventure** — 40 designed levels, grids grow from 5x5 to 9x9 (deterministic, same puzzle for everyone).
- **Zen** — relaxed, no hearts, endless puzzles that slowly grow.
- **Daily** — one date-seeded puzzle a day.

Every generated puzzle is checked to have **exactly one solution**, so it is always a real deduction, never a guess.

### Boosters (Telegram Stars only)
| id | what it does |
|----|--------------|
| `hint` | highlights a cell to reconsider, or where a duck belongs |
| `undo` | reverts your last move (board + hearts) |
| `placeduck` | "Place a Duck" — drops one correct duck for you |

Packs and bundles + prices live in `server.js` `SKUS`. New players start with a few of each, and earn a free one every 3rd level.

## Files
- `index.html` — the entire game (UI, puzzle generator, logic, i18n EN+RU). Single file.
- `server.js` — Express backend: Telegram Stars IAP (`createInvoiceLink` / XTR), pre-checkout + successful-payment webhook, idempotent Postgres ledger with in-memory fallback, initData HMAC validation, optional cross-device save, `/start` bot welcome, webhook + bot setup endpoints.
- `brand/gen-ducks.js` — duck hero video pipeline (Nano Banana Pro keyframe -> fal.ai Seedance image-to-video).
- `brand/.env` — `FAL_KEY` + `GOOGLE_API_KEY` (gitignore this).
- `assets/ducks/` — generated `hero/victory/defeat/levelup` `.mp4` + `-frame.png` posters.

## Run locally
```
npm install
node server.js 3000          # http://localhost:3000  (IAP off without BOT_TOKEN, game fully playable)
```

## Duck hero videos
Already generated (FAST drafts). To re-roll or make final quality:
```
node brand/gen-ducks.js                 # all 4, FAST model, 5s
node brand/gen-ducks.js victory --pro   # one scene, PRO quality
```
In-cell ducks are simple 2D SVG; only the hero (home, win, lose, level-up) is the 3D video.

## Deploy + Telegram (Render or Railway)
1. Create a bot with @BotFather, get the token.
2. Deploy this repo. Set env: `BOT_TOKEN`, `TELEGRAM_ADMIN_IDS` (your tg id, for the 1-star test SKU), optionally `DATABASE_URL` (Postgres, for cross-device save + restart-proof IAP), `PUBLIC_URL`.
3. Register the webhook + menu button (use the bot token as the setup key):
```
curl -X POST https://<your-url>/api/setup-webhook -H "x-setup-key: <BOT_TOKEN>"
curl -X POST https://<your-url>/api/setup-bot     -H "x-setup-key: <BOT_TOKEN>"
```
4. Open the bot in Telegram, tap Play.

## House rules honored
No emoji glyphs in the UI (kawaii SVG + the duck videos only). No em/en dashes in user-facing copy. No italics.
