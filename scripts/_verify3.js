// Verify the 3 native-issue fixes did not break web behavior:
//  - no JS errors after the faceLoop/initFaces rewrite
//  - duck faces still key + render (video-pause reconciler + smaller key canvas)
//  - swipe-paint still marks cells (touch-action change is browser-level; here we
//    just regression-check the JS handler via real pointer input)
//  - only a small number of video decoders are live during play
//   NODE_PATH=C:/Users/jonnw/Desktop/dumpling-drop-project/node_modules node scripts/_verify3.js
const { chromium } = require('playwright');
const URL = process.env.DD_URL || 'http://localhost:4055/game.html';

const sample = `() => {
  // average alpha over a canvas to confirm a keyed duck was drawn (non-empty)
  function alpha(cv){ if(!cv) return -1; try{ const x=cv.getContext('2d'); const d=x.getImageData(0,0,cv.width,cv.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>20) n++; return Math.round(n/(d.length/4)*1000)/10; }catch(e){ return -2; } }
  return { alpha };
}`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'no-preference', hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // HOME: keyed duck face present?
  const home = await page.evaluate(() => {
    const f = document.querySelector('.ddh-face');
    const cv = f && f.tagName === 'CANVAS' ? f : (f && f.querySelector ? f.querySelector('canvas') : null);
    function alpha(c){ if(!c) return -1; try{ const x=c.getContext('2d'); const d=x.getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=4) if(d[i]>20) n++; return Math.round(n/(d.length/4)*1000)/10; }catch(e){ return -2; } }
    return { faceVideosReady: typeof faceVideosReady!=='undefined'?faceVideosReady:'undef', ready: !!document.querySelector('.ddh-face.ready'), faceAlphaPct: alpha(cv), playing: (typeof _playing!=='undefined')?Array.from(_playing):'undef' };
  });
  console.log('HOME:', JSON.stringify(home));

  // start a normal (non-tutorial) level so FTUE doesn't lock input
  await page.evaluate(() => { try{ save.tutorialDone = true; }catch(e){} startLevel('levels', 2); });
  await page.waitForTimeout(900);

  // find two adjacent EMPTY cells in the same row and swipe across them
  const swipe = await page.evaluate(async () => {
    const cells = Array.from(document.querySelectorAll('#grid .qcell'));
    const empties = cells.filter(el => { const r=+el.dataset.r,c=+el.dataset.c; return gstate[r][c]===0; });
    // pick a cell and its right neighbour
    let a=null,b=null;
    for (const el of empties){ const r=+el.dataset.r,c=+el.dataset.c; const nb=cells.find(e=>+e.dataset.r===r&&+e.dataset.c===c+1&&gstate[r][c+1]===0); if(nb){a=el;b=nb;break;} }
    if(!a||!b) return { ok:false, reason:'no adjacent empties' };
    const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
    return { ok:true, a:[+a.dataset.r,+a.dataset.c], b:[+b.dataset.r,+b.dataset.c],
      ax:ra.left+ra.width/2, ay:ra.top+ra.height/2, bx:rb.left+rb.width/2, by:rb.top+rb.height/2 };
  });
  console.log('SWIPE TARGET:', JSON.stringify(swipe));
  if (swipe.ok) {
    await page.mouse.move(swipe.ax, swipe.ay);
    await page.mouse.down();
    await page.mouse.move((swipe.ax+swipe.bx)/2, (swipe.ay+swipe.by)/2, { steps: 3 });
    await page.mouse.move(swipe.bx, swipe.by, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const marked = await page.evaluate((sw) => ({ aMark: gstate[sw.a[0]][sw.a[1]], bMark: gstate[sw.b[0]][sw.b[1]] }), swipe);
    console.log('AFTER SWIPE (1=MARK):', JSON.stringify(marked));
  }

  // place a duck (double-tap) and confirm its in-grid face keys + draws
  const duck = await page.evaluate(async () => {
    const cells = Array.from(document.querySelectorAll('#grid .qcell'));
    const el = cells.find(e=>gstate[+e.dataset.r][+e.dataset.c]===0);
    if(!el) return { ok:false };
    const r=+el.dataset.r,c=+el.dataset.c;
    if(typeof onCellTap==='function'){ onCellTap(r,c); onCellTap(r,c); } // single=X, double=duck
    return { ok:true, r, c, state: gstate[r][c] };
  });
  await page.waitForTimeout(700);
  const duckFace = await page.evaluate((d) => {
    if(!d.ok) return { ok:false };
    const cells = Array.from(document.querySelectorAll('#grid .qcell'));
    const el = cells.find(e=>+e.dataset.r===d.r&&+e.dataset.c===d.c);
    const cv = el && el.querySelector('canvas.duckface');
    function alpha(c){ if(!c) return -1; try{ const x=c.getContext('2d'); const dd=x.getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<dd.length;i+=4) if(dd[i]>20) n++; return Math.round(n/(dd.length/4)*1000)/10; }catch(e){ return -2; } }
    return { ok:true, state:d.state, hasCanvas:!!cv, faceAlphaPct: alpha(cv), playing:(typeof _playing!=='undefined')?Array.from(_playing):'undef' };
  }, duck);
  console.log('IN-GRID DUCK FACE:', JSON.stringify(duckFace));

  console.log('ERRORS:', errors.length ? JSON.stringify(errors.slice(0,8)) : 'none');
  await browser.close();
  if (errors.length) process.exit(2);
})().catch(e => { console.error('ERR', e); process.exit(1); });
