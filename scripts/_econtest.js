// Verify the gold economy + sticker album end to end in a real browser.
//   NODE_PATH=C:/Users/jonnw/Desktop/dumpling-drop-project/node_modules node scripts/_econtest.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '..', '_econshots'); fs.mkdirSync(OUT, { recursive: true });
const URL = process.env.DD_URL || 'http://localhost:4055/game.html';
const fails = []; const ok = []; function check(name, cond){ (cond?ok:fails).push(name); console.log((cond?'PASS':'FAIL')+' '+name); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR:', e.message); });
  page.on('console', m => { if (m.type()==='error') console.log('CONSOLE.error:', m.text()); });
  await page.addInitScript(() => { try{ localStorage.clear(); }catch(e){} });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  // --- boot / default economy ---
  const boot = await page.evaluate(() => ({
    gold: save.gold, migrated: save._goldMigrated, bcost: BOOSTER_COST,
    homeGold: (document.querySelector('#homeGold .goldval')||{}).textContent,
    stickers: Object.keys(save.stickers||{}).length,
  }));
  check('default gold = 120', boot.gold === 120);
  check('home gold pill shows 120', boot.homeGold === '120');
  check('booster costs set', boot.bcost && boot.bcost.hint===100 && boot.bcost.undo===40 && boot.bcost.placeduck===200);
  await page.screenshot({ path: path.join(OUT,'1-home.png') });

  // --- open album ---
  await page.click('#btnAlbum'); await page.waitForTimeout(400);
  const alb = await page.evaluate(() => ({
    on: document.getElementById('album').classList.contains('on'),
    packs: document.querySelectorAll('#packRow .packbtn').length,
    sets: document.querySelectorAll('#albumSets .setblock').length,
    slots: document.querySelectorAll('#albumSets .stslot').length,
    locked: document.querySelectorAll('#albumSets .stslot.locked').length,
    gold: (document.querySelector('#albumGold .goldval')||{}).textContent,
  }));
  check('album screen shows', alb.on);
  check('2 pack buttons', alb.packs === 2);
  check('3 sets rendered', alb.sets === 3);
  check('24 sticker slots', alb.slots === 24);
  check('all slots locked initially', alb.locked === 24);
  await page.screenshot({ path: path.join(OUT,'2-album-empty.png') });

  // --- give gold, open a basic pack ---
  await page.evaluate(() => { save.gold = 1000; updateGoldHud(); });
  await page.click('#packRow .packbtn[data-pack="basic"]'); await page.waitForTimeout(700);
  const pk = await page.evaluate(() => ({
    scrim: document.getElementById('scrimPack').classList.contains('on'),
    cards: document.querySelectorAll('#packReveal .revcard').length,
    owned: Object.values(save.stickers||{}).reduce((a,b)=>a+b,0),
    goldAfter: save.gold,
  }));
  check('pack reveal scrim shows', pk.scrim);
  check('basic pack reveals 3 cards', pk.cards === 3);
  check('3 stickers granted', pk.owned === 3);
  check('basic pack cost 150 gold', pk.goldAfter === 850);
  await page.screenshot({ path: path.join(OUT,'3-pack-reveal.png') });
  await page.click('#packOk'); await page.waitForTimeout(300);

  // --- sticker image actually loads (real art) ---
  await page.evaluate(() => { // grant one specific sticker to inspect its img
    save.stickers['pond8'] = 1; persist(); renderAlbum();
  });
  await page.waitForTimeout(400);
  const imgOk = await page.evaluate(async () => {
    const el = document.querySelector('.stslot[data-ava="pond8"] .stimg');
    if (!el) return 'no-el';
    if (el.classList.contains('noimg')) return 'noimg';
    return el.complete && el.naturalWidth > 0 ? 'loaded' : 'pending';
  });
  check('real sticker art loads (pond8)', imgOk === 'loaded');

  // --- complete a set -> claim chest ---
  const claim = await page.evaluate(() => {
    ['pond1','pond2','pond3','pond4','pond5','pond6','pond7','pond8'].forEach(id => save.stickers[id]=1);
    persist(); renderAlbum();
    const btn = document.querySelector('.claimbtn[data-claim="pond"]');
    const before = save.gold; if (btn) btn.click();
    return { hadBtn: !!btn, gained: save.gold - before, claimed: !!(save.setsClaimed&&save.setsClaimed.pond) };
  });
  check('completed set shows claim button', claim.hadBtn);
  check('claim grants 300 gold', claim.gained === 300);
  check('set marked claimed', claim.claimed);
  await page.screenshot({ path: path.join(OUT,'4-album-progress.png') });

  // --- set avatar -> home badge ---
  await page.evaluate(() => setAvatar('pond8'));
  await page.click('#albumBack'); await page.waitForTimeout(300);
  const ava = await page.evaluate(() => ({
    set: save.avatarSticker,
    shown: !document.getElementById('homeAvaWrap').classList.contains('hidden'),
  }));
  check('avatar stored', ava.set === 'pond8');
  check('home avatar badge shown', ava.shown);

  // --- gold-for-win helper sanity ---
  const winGold = await page.evaluate(() => ({ s5: goldForWin(5), s9: goldForWin(9), daily: dailyWinBonus() }));
  check('win gold scales by size', winGold.s5===10 && winGold.s9===40);

  await page.screenshot({ path: path.join(OUT,'5-home-avatar.png') });

  console.log('\\n=== '+ok.length+' passed, '+fails.length+' failed; pageerrors='+errors.length+' ===');
  if (fails.length) console.log('FAILED: '+fails.join(', '));
  if (errors.length) console.log('PAGEERRORS: '+errors.join(' | '));
  await browser.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
