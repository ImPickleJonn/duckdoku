// Assign an EXISTING uploaded versionCode to a Play track and commit (no upload/rebuild).
//   node scripts/_ddtrack.js <versionCode> <track> [completed|draft]
// track = internal | alpha (closed) | beta (open) | production
const fs = require('fs'), crypto = require('crypto'), https = require('https');
const PKG = 'com.whaleplayed.duckdoku';
const SA = JSON.parse(fs.readFileSync('C:/Users/jonnw/Desktop/dd-secrets/play-service-account.json', 'utf8'));
const VC = String(process.argv[2] || '');
const TRACK = String(process.argv[3] || '');
const STATUS = process.argv[4] || 'completed';
const NOTE = 'World Cup update: red-card lives and a survival run, a rules guide, and a leaderboard that now shows every player. No ads, ever.';
if (!VC || !TRACK) { console.error('usage: _ddtrack.js <vc> <track> [completed|draft]'); process.exit(1); }
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt() { const now = Math.floor(Date.now() / 1000); const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 }); return u + '.' + crypto.createSign('RSA-SHA256').update(u).sign(SA.private_key).toString('base64url'); }
function req(method, url, body, tok, ctype) {
  return new Promise((res, rej) => { const x = new URL(url); const h = {}; if (ctype) h['Content-Type'] = ctype; if (tok) h['Authorization'] = 'Bearer ' + tok; if (body != null) h['Content-Length'] = Buffer.byteLength(body);
    const r = https.request({ method, hostname: x.hostname, path: x.pathname + x.search, headers: h }, resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ code: resp.statusCode, body: d })); }); r.on('error', rej); if (body != null) r.write(body); r.end(); });
}
const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PKG;
(async () => {
  const t = await req('POST', 'https://oauth2.googleapis.com/token', 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt(), null, 'application/x-www-form-urlencoded');
  const tok = JSON.parse(t.body).access_token; if (!tok) throw new Error('token fail: ' + t.body.slice(0, 200));
  const e = await req('POST', BASE + '/edits', '{}', tok, 'application/json'); const eid = JSON.parse(e.body).id; if (!eid) throw new Error('edit fail: ' + e.body.slice(0, 200));
  const bl = await req('GET', BASE + '/edits/' + eid + '/bundles', null, tok);
  const vcs = (JSON.parse(bl.body).bundles || []).map(b => String(b.versionCode));
  console.log('uploaded bundles: [' + vcs.join(', ') + ']  | assigning vc' + VC + ' -> ' + TRACK + ' (' + STATUS + ')');
  if (!vcs.includes(VC)) throw new Error('versionCode ' + VC + ' is not an uploaded bundle; upload it first.');
  const body = JSON.stringify({ track: TRACK, releases: [{ name: VC, status: STATUS, versionCodes: [VC], releaseNotes: [{ language: 'en-US', text: NOTE }] }] });
  const r = await req('PUT', BASE + '/edits/' + eid + '/tracks/' + TRACK, body, tok, 'application/json');
  console.log('track ' + TRACK + ': HTTP ' + r.code + (r.code >= 300 ? '  ' + r.body.slice(0, 500) : '  OK'));
  if (r.code >= 300) throw new Error('track assign failed');
  const c = await req('POST', BASE + '/edits/' + eid + ':commit', '{}', tok, 'application/json');
  console.log('commit: HTTP ' + c.code + (c.code >= 300 ? '  ' + c.body.slice(0, 700) : '  OK'));
  if (c.code >= 300) throw new Error('commit failed');
  console.log('DONE: vc' + VC + ' on ' + TRACK + '.');
})().catch(e => { console.error('ERROR: ' + (e && e.message || e)); process.exit(1); });
