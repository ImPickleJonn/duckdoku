const { chromium } = require('playwright');
const PORT = process.argv[2]; const j = o => JSON.stringify(o);
(async () => {
  const b = await chromium.launch();  // default policy: muted videos may autoplay (realistic WebView)
  const p = await (await b.newContext({ viewport: { width: 412, height: 892 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message.slice(0, 140)));
  const v404 = []; p.on('response', r => { if (r.status() >= 400 && /soccer-/.test(r.url())) v404.push(r.status() + ' ' + r.url().split('/').pop()); });
  await p.goto('http://127.0.0.1:' + PORT + '/game.html', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  await p.evaluate(() => { save.tutorialDone = true; save.levelsDone = 14; save.country = 'US'; save.name = 'Pickle'; save.avatar = 'avatar-3'; persist(); cupClearOverlays && cupClearOverlays(); });
  // champion result -> victory clip
  await p.evaluate(() => { beginTourneyRun(5); const board = [{ rank: 1, name: 'Pickle', country: 'US', score: 9, me: true }, { rank: 2, name: 'Coco', country: 'FR', score: 7 }, { rank: 3, name: 'Dax', country: 'JP', score: 5 }, { rank: 4, name: 'Olive', country: 'BR', score: 3 }]; resolveCupResult({ board, myRank: 1, goals: 3, prize: { gold: 100, sticker: true } }); });
  await p.waitForTimeout(2200);
  const win = await p.evaluate(() => { const v = document.getElementById('tResVid'); return { src: (v.currentSrc || v.src || '').split('/').pop(), paused: v.paused, muted: v.muted, autoplay: v.hasAttribute('autoplay'), readyState: v.readyState, currentTime: +v.currentTime.toFixed(2), playOverlayRisk: v.paused && v.readyState < 2 }; });
  console.log('victory:', j(win));
  // defeat result -> defeat clip (rank 4)
  await p.evaluate(() => { const board = [{ rank: 1, name: 'A', country: 'FR', score: 9 }, { rank: 2, name: 'B', country: 'DE', score: 7 }, { rank: 3, name: 'C', country: 'JP', score: 5 }, { rank: 4, name: 'Pickle', country: 'US', score: 2, me: true }]; resolveCupResult({ board, myRank: 4, goals: 0, prize: {} }); });
  await p.waitForTimeout(2200);
  const lose = await p.evaluate(() => { const v = document.getElementById('tResVid'); return { src: (v.currentSrc || v.src || '').split('/').pop(), paused: v.paused, currentTime: +v.currentTime.toFixed(2) }; });
  console.log('defeat:', j(lose));
  console.log('soccer 4xx:', v404.length ? v404.join(' | ') : 'none');
  console.log('pageerrors:', errs.length ? errs.slice(0, 3).join(' | ') : 'none');
  await b.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
