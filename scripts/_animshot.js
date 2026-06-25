// Verify the home idle animation by capturing it at several timestamps.
// Playwright pages are visible (document.hidden=false) so the choreographer runs,
// unlike the headless preview tab. Run with playwright from a sibling project:
//   NODE_PATH=C:/Users/jonnw/Desktop/dumpling-drop-project/node_modules node scripts/_animshot.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '..', '_animshots');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.DD_URL || 'http://localhost:4055/game.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', e.message));
  await page.goto(URL, { waitUntil: 'networkidle' });

  const probe = () => page.evaluate(() => {
    const grid = document.getElementById('ddhGrid');
    const cells = Array.prototype.slice.call(grid.children);
    const N = Math.round(Math.sqrt(cells.length));
    let sig = '';
    for (let r = 0; r < N; r++) { for (let c = 0; c < N; c++) { const el = cells[r*N+c]; const x = el.querySelector('.ddh-x'); const host = el.classList.contains('ddh-host'); sig += host ? 'D' : (x && x.classList.contains('ddh-stamp')) ? 'X' : '.'; } sig += '/'; }
    return { stamped: document.querySelectorAll('.ddh-x.ddh-stamp').length, sig };
  });

  // dense sweep over ~8s; the sig (5 rows of D/X/.) identifies which rule is showing
  let frame = 0;
  for (let t = 800; t <= 8200; t += 550) {
    await page.waitForTimeout(550);
    const p = await probe();
    const name = 'f' + String(frame).padStart(2,'0') + '-' + t + 'ms';
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log(name, p.stamped, p.sig);
    frame++;
  }

  const state = await page.evaluate(() => ({
    hidden: document.hidden,
    faceReady: !!document.querySelector('.ddh-face.ready'),
    faceVideosReady: (typeof faceVideosReady !== 'undefined') ? faceVideosReady : 'undef',
    duckExists: !!document.querySelector('.ddh-duck'),
    xCount: document.querySelectorAll('.ddh-x').length,
  }));
  console.log('STATE:', JSON.stringify(state));
  console.log('shots ->', OUT);
  await browser.close();
})().catch(e => { console.error('ERR', e); process.exit(1); });
