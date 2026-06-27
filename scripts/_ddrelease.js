// One-shot: upload the AAB ONCE and assign its versionCode to BOTH alpha (closed) and beta
// (open) testing tracks in a single edit, then commit. Reuses dd-secrets service account.
//   node scripts/_ddrelease.js <aab> [track1,track2]
const fs = require('fs'), crypto = require('crypto'), https = require('https'), path = require('path');
const PKG = 'com.whaleplayed.duckdoku';
const SA = JSON.parse(fs.readFileSync('C:/Users/jonnw/Desktop/dd-secrets/play-service-account.json', 'utf8'));
const AAB = process.argv[2];
const TRACKS = (process.argv[3] || 'alpha,beta').split(',');
const STATUS = process.argv[4] || 'completed'; // 'completed' = submit for review/publish to testers; 'draft' = save without submitting
const NOTE = 'New: a friendly step by step tutorial that teaches you to solve, not just tap, plus a Tutorial button in Settings to replay it anytime. Cleaner win and lose screens and lots of polish.';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt() { const now = Math.floor(Date.now() / 1000); const u = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ iss: SA.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3000 }); return u + '.' + crypto.createSign('RSA-SHA256').update(u).sign(SA.private_key).toString('base64url'); }
function req(method, url, body, tok, ctype) {
  return new Promise((res, rej) => { const x = new URL(url); const h = {}; if (ctype) h['Content-Type'] = ctype; if (tok) h['Authorization'] = 'Bearer ' + tok; if (body != null) h['Content-Length'] = Buffer.byteLength(body);
    const r = https.request({ method, hostname: x.hostname, path: x.pathname + x.search, headers: h }, resp => { let d = ''; resp.on('data', c => d += c); resp.on('end', () => res({ code: resp.statusCode, body: d })); }); r.on('error', rej); if (body != null) r.write(body); r.end(); });
}
const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PKG;
const UP = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PKG;
(async () => {
  if (!AAB || !fs.existsSync(AAB)) throw new Error('AAB not found: ' + AAB);
  const t = await req('POST', 'https://oauth2.googleapis.com/token', 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + jwt(), null, 'application/x-www-form-urlencoded');
  const tok = JSON.parse(t.body).access_token; if (!tok) throw new Error('token fail: ' + t.body.slice(0, 200));
  const e = await req('POST', BASE + '/edits', '{}', tok, 'application/json'); const eid = JSON.parse(e.body).id; if (!eid) throw new Error('edit fail: ' + e.body.slice(0, 200));
  console.log('edit', eid);
  const buf = fs.readFileSync(AAB);
  const up = await req('POST', UP + '/edits/' + eid + '/bundles?uploadType=media&ackBundleInstallationWarning=true', buf, tok, 'application/octet-stream');
  if (up.code >= 300) throw new Error('bundle upload failed: ' + up.code + ' ' + up.body.slice(0, 300));
  const vc = JSON.parse(up.body).versionCode; console.log('uploaded bundle versionCode=' + vc);
  for (const track of TRACKS) {
    const body = JSON.stringify({ track, releases: [{ status: STATUS, versionCodes: [String(vc)], releaseNotes: [{ language: 'en-US', text: NOTE }] }] });
    const r = await req('PUT', BASE + '/edits/' + eid + '/tracks/' + track, body, tok, 'application/json');
    console.log('track ' + track + ': HTTP ' + r.code + (r.code >= 300 ? '  ' + r.body.slice(0, 400) : '  OK'));
    if (r.code >= 300) throw new Error('track ' + track + ' assign failed');
  }
  const c = await req('POST', BASE + '/edits/' + eid + ':commit', '{}', tok, 'application/json');
  console.log('commit: HTTP ' + c.code + (c.code >= 300 ? '  ' + c.body.slice(0, 500) : '  OK'));
  if (c.code >= 300) throw new Error('commit failed');
  console.log('DONE: vc' + vc + ' released to ' + TRACKS.join(' + '));
})().catch(e => { console.error('ERROR: ' + (e && e.message || e)); process.exit(1); });
