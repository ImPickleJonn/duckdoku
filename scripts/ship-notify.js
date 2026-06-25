#!/usr/bin/env node
/* DMs Pickle a "task done" summary via the Duckdoku bot.
   Use at the END of EVERY Duckdoku task (any session).

   How: reads the shared secret (dd-secrets/duckdoku-ship-secret.txt) and POSTs the
   message to https://duckdoku.onrender.com/api/ship-notify (secret-guarded). The
   server holds BOT_TOKEN and DMs the owner, so the bot token is never read here.

   Usage (multiline via stdin, preferred):
     node scripts/ship-notify.js <<'EOF'
     TASK DONE!

     * Item 1: completed
     * Item 2: note
     EOF

   Or single arg:  node scripts/ship-notify.js "TASK DONE!\n\n* Item: done"
*/
const fs = require('fs'), https = require('https'), path = require('path');
const SECRET_PATH = path.join(process.env.USERPROFILE || process.env.HOME, 'Desktop', 'dd-secrets', 'duckdoku-ship-secret.txt');
let secret = '';
try { secret = fs.readFileSync(SECRET_PATH, 'utf8').trim(); } catch (e) { console.error('cannot read secret at ' + SECRET_PATH); process.exit(1); }
let text = process.argv[2] ? process.argv.slice(2).join(' ').replace(/\\n/g, '\n') : fs.readFileSync(0, 'utf8');
text = text.trim();
if (!text) { console.error('no message text (pass as arg or pipe via stdin)'); process.exit(1); }
const body = JSON.stringify({ text });
const req = https.request({ host: 'duckdoku.onrender.com', path: '/api/ship-notify', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-ship-key': secret } },
  r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { console.log('HTTP ' + r.statusCode + ' ' + d); process.exit(r.statusCode === 200 ? 0 : 1); }); });
req.on('error', e => { console.error('ERR ' + e.message); process.exit(1); });
req.write(body); req.end();
