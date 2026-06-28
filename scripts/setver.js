// Bump the app version in ONE place: android/app/build.gradle (versionName + versionCode++) AND game.html DD_VERSION.
// build-mobile.js then stamps the gradle version+build into the native settings display automatically.
//   node scripts/setver.js 0.7.9
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const ver = process.argv[2];
if (!ver || !/^\d+\.\d+\.\d+$/.test(ver)) { console.error('usage: node scripts/setver.js <x.y.z>'); process.exit(1); }
const gradlePath = path.join(ROOT, 'android', 'app', 'build.gradle');
let g = fs.readFileSync(gradlePath, 'utf8');
const curVc = parseInt((g.match(/versionCode\s+(\d+)/) || [])[1] || '0', 10);
const newVc = curVc + 1;
g = g.replace(/versionCode\s+\d+/, 'versionCode ' + newVc).replace(/versionName\s+"[^"]+"/, 'versionName "' + ver + '"');
fs.writeFileSync(gradlePath, g);
const ghPath = path.join(ROOT, 'game.html');
let h = fs.readFileSync(ghPath, 'utf8');
h = h.replace(/const DD_VERSION='[^']*';/, "const DD_VERSION='" + ver + "';");
fs.writeFileSync(ghPath, h);
console.log('version set to ' + ver + ' (versionCode ' + newVc + ')');
