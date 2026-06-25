// Capture Play store phone screenshots from the live game (1080x1920, 9:16).
// Run with the preview/dev server up on :3019.
//   NODE_PATH=<a project with playwright>/node_modules node scripts/gen-screenshots.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '..', 'assets', 'store', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.DD_URL || 'http://localhost:3019/game.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: path.join(OUT, n) });
  const wait = (ms) => page.waitForTimeout(ms);

  await page.goto(URL, { waitUntil: 'networkidle' });
  await wait(1500);
  await shot('01-home.png');

  // mid solve: ducks + X notes + one red X
  await page.evaluate(() => {
    save.tutorialDone = true; startLevel('levels', 6);
    for (let r = 0; r < 2; r++) tryGuess(r, puzzle.solCols[r]);
    for (let c = 0; c < N; c++) if (gstate[3][c] === 0) { gstate[3][c] = 1; renderCell(3, c); }
    for (let c = 0; c < N; c++) if (c !== puzzle.solCols[4]) { tryGuess(4, c); break; }
    updateCount();
  });
  await wait(1600); await shot('02-solve.png');

  // rules header + fresh board
  await page.evaluate(() => { startLevel('levels', 3); });
  await wait(1600); await shot('03-board.png');

  // win celebration (happy duck)
  await page.evaluate(() => { startLevel('levels', 2); for (let r = 0; r < N; r++) tryGuess(r, puzzle.solCols[r]); });
  await wait(1800); await shot('04-win.png');

  await browser.close();
  console.log('screenshots ->', OUT);
})().catch(e => { console.error(e); process.exit(1); });
