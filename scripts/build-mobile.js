#!/usr/bin/env node
/* Build www/ for the Capacitor (Android/iOS) native wrapper.
   The native app loads game.html directly (no shell). In a Capacitor webview
   location.hostname is "localhost", so we hard-pin API_BASE to the Render API
   (otherwise relative /api calls would hit the local app and fail). Telegram
   Stars IAP only applies inside Telegram; the native build runs in local/web
   mode (localStorage save) until native store IAP is wired. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const API = process.env.DD_API || 'https://duckdoku.onrender.com';

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

let html = fs.readFileSync(path.join(ROOT, 'game.html'), 'utf8');
const before = html;
html = html.replace(/const API_BASE=\(function\(\)\{[\s\S]*?\}\)\(\);/, "const API_BASE='" + API + "';");
if (html === before) console.warn('WARN: API_BASE pattern not found, native build may call relative /api');
// stamp the REAL build version (from android/app/build.gradle) into the settings display so it can never go stale
try {
  const gradle = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
  const vn = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1];
  const vc = (gradle.match(/versionCode\s+(\d+)/) || [])[1];
  if (vn) html = html.replace(/const DD_VERSION='[^']*';/, "const DD_VERSION='" + vn + "';");
  if (vc) html = html.replace(/let DD_BUILD='[^']*';/, "let DD_BUILD='" + vc + "';");
  console.log('stamped version', vn, '(' + vc + ')');
} catch (e) { console.warn('WARN: could not stamp version:', e.message); }
fs.writeFileSync(path.join(WWW, 'index.html'), html);

// asset dirs the native app never loads at runtime, so shipping them just bloats
// the APK/AAB: notif = Telegram DM media the SERVER sends; store = Play Store
// listing graphics; stickers2 = an unused duplicate of stickers/; variations =
// duck-gen source art.
const SKIP_DIRS = new Set(['variations', 'notif', 'store', 'stickers2']);
function cp(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (f.startsWith('_') || f.endsWith('-frame.png')) continue; // skip montages + video posters not needed natively
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) { if (SKIP_DIRS.has(f)) continue; cp(s, d); }
    else fs.copyFileSync(s, d);
  }
}
cp(path.join(ROOT, 'assets'), path.join(WWW, 'assets'));
console.log('www built ->', WWW, '(API ' + API + ')');
