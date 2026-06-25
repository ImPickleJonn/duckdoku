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
    const duck = document.querySelector('.ddh-duck');
    const face = document.querySelector('.ddh-face');
    const fb = document.querySelector('.ddh-fallback');
    let alphaPx = 0;
    try { const c = face.getContext('2d'); const d = c.getImageData(0,0,face.width,face.height).data; for (let i=3;i<d.length;i+=4){ if (d[i]>10) alphaPx++; } } catch(e) { alphaPx = 'err:'+e.message; }
    return {
      stamped: document.querySelectorAll('.ddh-x.ddh-stamp').length,
      duckOpacity: duck ? getComputedStyle(duck).opacity : 'n/a',
      duckClass: duck ? duck.className : 'n/a',
      faceOpacity: face ? getComputedStyle(face).opacity : 'n/a',
      fbOpacity: fb ? getComputedStyle(fb).opacity : 'n/a',
      faceAlphaPx: alphaPx,
    };
  });

  // capture the home across one loop: elimination -> placement -> celebrate
  const marks = [900, 1500, 2100, 2700, 3000, 3500];
  let prev = 0;
  for (const t of marks) {
    await page.waitForTimeout(t - prev); prev = t;
    await page.screenshot({ path: path.join(OUT, 'home-' + t + 'ms.png') });
    console.log(t + 'ms', JSON.stringify(await probe()));
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
