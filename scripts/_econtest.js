// Verify the gold economy, sticker album, prizes, and reveal in a real browser.
//   NODE_PATH=C:/Users/jonnw/Desktop/dumpling-drop-project/node_modules node scripts/_econtest.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '..', '_econshots'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.DD_URL || 'http://localhost:4077/game.html';
const fails = []; const ok = []; function check(name, cond){ (cond?ok:fails).push(name); console.log((cond?'PASS':'FAIL')+' '+name); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR:', e.message); });
  await page.addInitScript(() => { try{ localStorage.clear(); }catch(e){} });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // --- home top bar: gold pill lives in the homebar (top), not below the menu ---
  const home = await page.evaluate(() => ({
    gold: save.gold,
    goldInBar: !!document.querySelector('#home .homebar #homeGold'),
    barHasGear: !!document.querySelector('#home .homebar #btnHomeGear'),
    homeGoldText: (document.querySelector('#homeGold .goldval')||{}).textContent,
  }));
  check('default gold = 120', home.gold === 120);
  check('home gold pill is in the top bar', home.goldInBar);
  check('gear also in top bar', home.barHasGear);
  await page.screenshot({ path: path.join(OUT,'1-home.png') });

  // --- album ---
  await page.click('#btnAlbum'); await page.waitForTimeout(400);
  const alb = await page.evaluate(() => ({
    sets: document.querySelectorAll('#albumSets .setblock').length,
    slots: document.querySelectorAll('#albumSets .stslot').length,
    packs: document.querySelectorAll('#packRow .packbtn').length,
  }));
  check('5 sets rendered', alb.sets === 5);
  check('40 sticker slots', alb.slots === 40);
  check('2 pack buttons', alb.packs === 2);

  // --- juicy reveal: flip cards (rc-inner) appear ---
  await page.evaluate(() => { save.gold = 3000; updateGoldHud(); });
  await page.click('#packRow .packbtn[data-pack="golden"]'); await page.waitForTimeout(500);
  const rev = await page.evaluate(() => ({
    scrim: document.getElementById('scrimPack').classList.contains('on'),
    cards: document.querySelectorAll('#packReveal .revcard').length,
    flips: document.querySelectorAll('#packReveal .rc-inner').length,
    backs: document.querySelectorAll('#packReveal .rc-back').length,
    owned: Object.values(save.stickers||{}).reduce((a,b)=>a+b,0),
  }));
  check('reveal scrim shows', rev.scrim);
  check('golden pack reveals 5 flip cards', rev.cards === 5 && rev.flips === 5);
  check('cards have face-down backs (flip)', rev.backs === 5);
  check('5 stickers granted', rev.owned === 5);
  await page.waitForTimeout(1100);
  await page.screenshot({ path: path.join(OUT,'2-reveal.png') });
  await page.click('#packOk'); await page.waitForTimeout(300);

  // --- set completion: free-booster prize + reward modal ---
  const setClaim = await page.evaluate(() => {
    ['pond1','pond2','pond3','pond4','pond5','pond6','pond7','pond8'].forEach(id => save.stickers[id]=1);
    persist(); renderAlbum();
    const btn = document.querySelector('.claimbtn[data-claim="pond"]');
    const gBefore = save.gold, fbBefore = save.freeBoosters.hint;
    if (btn) btn.click();
    return { hadBtn: !!btn, goldGain: save.gold - gBefore, hintGain: save.freeBoosters.hint - fbBefore,
             modal: document.getElementById('scrimReward').classList.contains('on'),
             items: document.querySelectorAll('#rwdItems .rwd-item').length,
             claimed: !!(save.setsClaimed&&save.setsClaimed.pond) };
  });
  check('set shows claim button', setClaim.hadBtn);
  check('set prize grants gold (200)', setClaim.goldGain === 200);
  check('set prize grants free boosters (+2 hint)', setClaim.hintGain === 2);
  check('reward modal opens with items', setClaim.modal && setClaim.items >= 2);
  check('set marked claimed', setClaim.claimed);
  await page.screenshot({ path: path.join(OUT,'3-reward.png') });
  await page.click('#rwdOk'); await page.waitForTimeout(200);

  // --- free booster is spent before gold ---
  const pay = await page.evaluate(() => {
    save.freeBoosters.hint = 1; const g0 = save.gold;
    const r1 = payBooster('hint');           // should use the free credit
    const usedFree = save.freeBoosters.hint === 0 && save.gold === g0 && r1;
    const r2 = payBooster('hint');           // now should spend gold
    const spentGold = save.gold === g0 - BOOSTER_COST.hint && r2;
    return { usedFree, spentGold };
  });
  check('free booster consumed before gold', pay.usedFree);
  check('gold charged once free credits run out', pay.spentGold);

  // --- grand prize: all 40 -> claim ---
  const grand = await page.evaluate(() => {
    STICKERS.forEach(s => save.stickers[s.id] = save.stickers[s.id] || 1);
    persist(); renderAlbum();
    const btn = document.querySelector('.grandbtn[data-grand]');
    const g0 = save.gold, u0 = save.freeBoosters.undo;
    if (btn) btn.click();
    return { hadBtn: !!btn, goldGain: save.gold - g0, undoGain: save.freeBoosters.undo - u0,
             claimed: !!save.grandClaimed, grandModal: document.getElementById('scrimReward').classList.contains('grand') };
  });
  check('grand prize button shows when album complete', grand.hadBtn);
  check('grand prize grants big gold (2000)', grand.goldGain === 2000);
  check('grand prize grants big boosters (+10 undo)', grand.undoGain === 10);
  check('grand prize marked claimed', grand.claimed);
  check('grand reward modal styled grand', grand.grandModal);
  await page.screenshot({ path: path.join(OUT,'4-grand.png') });

  console.log('\\n=== '+ok.length+' passed, '+fails.length+' failed; pageerrors='+errors.length+' ===');
  if (fails.length) console.log('FAILED: '+fails.join(', '));
  if (errors.length) console.log('PAGEERRORS: '+errors.join(' | '));
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
