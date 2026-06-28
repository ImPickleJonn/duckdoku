const { chromium } = require('playwright');
const PORT=process.argv[2]; const j=o=>JSON.stringify(o);
(async()=>{
  const b=await chromium.launch();
  const p=await(await b.newContext({viewport:{width:412,height:892},deviceScaleFactor:2})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
  await p.goto('http://127.0.0.1:'+PORT+'/game.html',{waitUntil:'load'}); await p.waitForTimeout(3200);
  await p.evaluate(()=>{ save.levelsDone=14;save.tutorialDone=true;save.country='BR';save.name='Pickle';save.avatar='avatar-3'; persist(); cupClearOverlays&&cupClearOverlays(); });

  // A) Red cards fill up in WC
  const cards=await p.evaluate(()=>{ beginTourneyRun(999); const read=()=>{const h=document.getElementById('hearts');const svgs=[...h.children];const filled=svgs.filter(s=>/#E0322B/.test(s.innerHTML)).length;return {cls:h.classList.contains('cards'),total:svgs.length,filled};};
    const out={}; hearts=3;renderHearts();out.full=read(); hearts=2;renderHearts();out.one=read(); hearts=1;renderHearts();out.two=read(); hearts=0;renderHearts();out.out=read(); return out; });
  console.log('A redcards:',j(cards));

  // B) Info popup
  const info=await p.evaluate(()=>{ closeAll&&closeAll(); show('wc'); openCupInfo(); const s=document.getElementById('scrimCupInfo'); const rows=s.querySelectorAll('.cirow'); const txt=s.querySelector('#ciRows').textContent;
    return { open:s.classList.contains('on'), rows:rows.length, hasBall:!!s.querySelector('.ciball'), hasFlag:!!s.querySelector('.ciflag'), cards:s.querySelectorAll('.cicards svg').length, ducks:s.querySelectorAll('.cigrp svg').length,
      emoji:/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(txt), dash:/[–—]/.test(txt), title:document.getElementById('ciTitle').textContent }; });
  console.log('B info:',j(info));

  // C) Leaderboard renders my own row (highlight + appended placement)
  const lb=await p.evaluate(async()=>{ const real=window.fetch; window.fetch=(u,o)=>{ if(String(u).indexOf('/api/leaderboard')>=0){ return Promise.resolve({json:()=>Promise.resolve({top:[{rank:1,name:'TopDuck',level:80,me:false},{rank:2,name:'Two',level:60,me:false}], me:{found:true,rank:42,level:15}})}); } return real(u,o); };
    openLeaderboard(); await new Promise(r=>setTimeout(r,250)); const el=document.getElementById('lbList');
    return { rows:el.querySelectorAll('.lbrow').length, meRows:el.querySelectorAll('.lbrow.me').length, hasSep:!!el.querySelector('.lbsep'), youText:(el.querySelector('.lbrow.me')||{}).textContent||'' }; });
  console.log('C leaderboard:',j(lb));
  // C2) me in top -> flagged, no appended row
  const lb2=await p.evaluate(async()=>{ window.fetch=(u,o)=> (String(u).indexOf('/api/leaderboard')>=0)? Promise.resolve({json:()=>Promise.resolve({top:[{rank:1,name:'TopDuck',level:80,me:false},{rank:2,name:'Pickle',level:60,me:true}], me:{found:true,rank:2,level:60}})}) : Promise.reject();
    openLeaderboard(); await new Promise(r=>setTimeout(r,250)); const el=document.getElementById('lbList'); return { meRows:el.querySelectorAll('.lbrow.me').length, hasSep:!!el.querySelector('.lbsep') }; });
  console.log('C2 leaderboard(top):',j(lb2));

  console.log('pageerrors:',errs.length?errs.slice(0,5).join(' | '):'none');
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
