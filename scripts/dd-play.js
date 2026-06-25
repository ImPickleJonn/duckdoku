// Duckdoku Google Play helper (Android Publisher API v3).
// Reuses the service account at dd-secrets/play-service-account.json.
//   node scripts/dd-play.js check                 # test SA access + list tracks
//   node scripts/dd-play.js listing               # push title/desc + icon + feature + screenshots
//   node scripts/dd-play.js upload <aab> <track>  # upload AAB + assign to track (e.g. internal)
//   node scripts/dd-play.js all <aab> <track>     # listing + upload in one edit
const fs = require('fs'), crypto = require('crypto'), https = require('https'), path = require('path');
const ROOT = path.join(__dirname, '..');
const PKG = 'com.whaleplayed.duckdoku';
const SA_PATH = 'C:/Users/jonnw/Desktop/dd-secrets/play-service-account.json';
const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeJwt() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 });
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url');
  return unsigned + '.' + sig;
}
function req(method, url, body, tok, ctype) {
  return new Promise((res, rej) => {
    const u = new URL(url); const headers = {};
    if (ctype) headers['Content-Type'] = ctype;
    if (tok) headers['Authorization'] = 'Bearer ' + tok;
    if (body != null) headers['Content-Length'] = Buffer.byteLength(body);
    const r = https.request({ method, hostname: u.hostname, path: u.pathname + u.search, headers }, (resp) => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ code: resp.statusCode, body: d })); });
    r.on('error', rej); if (body != null) r.write(body); r.end();
  });
}
async function token() {
  const t = await req('POST', 'https://oauth2.googleapis.com/token', 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + makeJwt(), null, 'application/x-www-form-urlencoded');
  const tok = JSON.parse(t.body).access_token; if (!tok) throw new Error('token fail: ' + t.code + ' ' + t.body.slice(0, 300)); return tok;
}
const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PKG;
const UP = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PKG;

const TITLE = 'Duckdoku: Duck Logic Puzzle';
const SHORT = 'A cozy logic puzzle. Find the hidden duck in every colored area. No ads.';
const FULL = [
  'Duckdoku is a cozy logic puzzle starring one very cute duck.',
  '', 'A duck is hiding in one cell of every colored area. Your job is to find them all, using nothing but logic.',
  '', 'The rules are simple.', 'One duck per colored area.', 'One duck per row and per column.', 'No two ducks may touch, not even diagonally.',
  '', 'How to play.', 'Tap a cell once to mark an X where a duck cannot be.', 'Swipe across cells to rule out a whole row or column fast.', 'Double tap to place a duck. Find the hidden one and it locks in. Guess wrong and you leave a red X and lose a heart.',
  '', 'Why you will love it.', 'No ads, ever. Just you, the board, and the ducks.', 'Hundreds of puzzles that grow from gentle to brain bending.', 'A friendly tutorial that teaches you to solve, not just to tap.', 'Adorable animated 3D ducks that cheer you on and pout when things go sideways.', 'Helpful boosters when you are stuck. A Hint, an Undo, and a Place a Duck.',
  '', 'Every level has exactly one solution, so it is always real deduction and never a lucky guess.', '', 'No ads. No pressure. Just ducks and good puzzles.',
].join('\n');

async function newEdit(tok) { const e = await req('POST', BASE + '/edits', '{}', tok, 'application/json'); const id = JSON.parse(e.body).id; if (!id) throw new Error('edit insert failed: ' + e.code + ' ' + e.body.slice(0, 300)); return id; }
async function uploadImage(tok, eid, type, file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  const r = await req('POST', UP + '/edits/' + eid + '/listings/en-US/' + type + '?uploadType=media', buf, tok, 'image/png');
  console.log('  image ' + type + ' <- ' + file + ' : HTTP ' + r.code);
  if (r.code >= 300) console.log('    ' + r.body.slice(0, 200));
}
async function setListing(tok, eid) {
  const r = await req('PUT', BASE + '/edits/' + eid + '/listings/en-US', JSON.stringify({ language: 'en-US', title: TITLE, shortDescription: SHORT, fullDescription: FULL }), tok, 'application/json');
  console.log('  listing text: HTTP ' + r.code); if (r.code >= 300) console.log('    ' + r.body.slice(0, 300));
  await uploadImage(tok, eid, 'icon', 'assets/store/icon-512.png');
  await uploadImage(tok, eid, 'featureGraphic', 'assets/store/feature-1024x500.png');
  const sdir = path.join(ROOT, 'assets/store/screenshots');
  if (fs.existsSync(sdir)) {
    await req('DELETE', BASE + '/edits/' + eid + '/images/en-US/phoneScreenshots', null, tok);
    for (const f of fs.readdirSync(sdir).filter(f => f.endsWith('.png')).sort()) await uploadImage(tok, eid, 'phoneScreenshots', 'assets/store/screenshots/' + f);
  }
}
async function uploadAab(tok, eid, aab, track) {
  const buf = fs.readFileSync(aab);
  const r = await req('POST', UP + '/edits/' + eid + '/bundles?uploadType=media&ackBundleInstallationWarning=true', buf, tok, 'application/octet-stream');
  if (r.code >= 300) throw new Error('bundle upload failed: ' + r.code + ' ' + r.body.slice(0, 300));
  const vc = JSON.parse(r.body).versionCode; console.log('  bundle uploaded versionCode=' + vc);
  const body = JSON.stringify({ track, releases: [{ status: 'completed', versionCodes: [String(vc)] }] });
  const t = await req('PUT', BASE + '/edits/' + eid + '/tracks/' + track, body, tok, 'application/json');
  console.log('  track ' + track + ': HTTP ' + t.code); if (t.code >= 300) console.log('    ' + t.body.slice(0, 300));
  return vc;
}
async function commit(tok, eid) { const c = await req('POST', BASE + '/edits/' + eid + ':commit', '{}', tok, 'application/json'); console.log('commit: HTTP ' + c.code + (c.code >= 300 ? ' ' + c.body.slice(0, 400) : ' OK')); return c.code < 300; }

(async () => {
  const cmd = process.argv[2] || 'check';
  const tok = await token();
  if (cmd === 'check') {
    const e = await req('POST', BASE + '/edits', '{}', tok, 'application/json');
    console.log('edits.insert: HTTP ' + e.code);
    if (e.code >= 300) { console.log(e.body.slice(0, 400)); console.log('\nRESULT: no API access to ' + PKG + ' (app not created, or service account not granted access).'); return; }
    const eid = JSON.parse(e.body).id;
    const tr = await req('GET', BASE + '/edits/' + eid + '/tracks', null, tok);
    console.log('tracks: ' + tr.body.slice(0, 300));
    await req('DELETE', BASE + '/edits/' + eid, null, tok);
    console.log('\nRESULT: API access OK for ' + PKG + '. Ready to push listing + upload AAB.');
    return;
  }
  if (cmd === 'clearshots') {
    const eid = await newEdit(tok);
    const d = await req('DELETE', BASE + '/edits/' + eid + '/images/en-US/phoneScreenshots', null, tok);
    console.log('delete phoneScreenshots: HTTP ' + d.code + ' ' + d.body.slice(0, 150));
    await commit(tok, eid); return;
  }
  const eid = await newEdit(tok);
  if (cmd === 'listing' || cmd === 'all') await setListing(tok, eid);
  if (cmd === 'upload' || cmd === 'all') { const aab = process.argv[3], track = process.argv[4] || 'internal'; await uploadAab(tok, eid, aab, track); }
  await commit(tok, eid);
})().catch(e => { console.error('ERROR: ' + (e && e.message || e)); process.exit(1); });
