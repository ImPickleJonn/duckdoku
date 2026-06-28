const { chromium } = require('playwright');
const PORT=process.argv[2]; const j=o=>JSON.stringify(o);
(async()=>{
  const b=await chromium.launch();
  const p=await(await b.newContext({viewport:{width:412,height:892},deviceScaleFactor:2})).newPage();
  const fails=[]; p.on('response',r=>{ if(r.status()>=400 && /assets\//.test(r.url())) fails.push(r.status()+' '+r.url().split('/').slice(-2).join('/')); });
  await p.goto('http://127.0.0.1:'+PORT+'/game.html',{waitUntil:'load'}); await p.waitForTimeout(3000);
  await p.evaluate(()=>{ save.levelsDone=14;save.tutorialDone=true;save.country='US';save.name='Pickle';save.avatar='avatar-3';persist();cupClearOverlays&&cupClearOverlays(); });
  // rules popup ball + tilt
  const info=await p.evaluate(async()=>{ closeAll&&closeAll(); show('wc'); openCupInfo(); await new Promise(r=>setTimeout(r,600));
    const ball=document.querySelector('#scrimCupInfo .ciball'); const card=document.querySelector('#scrimCupInfo .cicards svg rect');
    return { ballLoaded: !!(ball&&ball.complete&&ball.naturalWidth>0), ballSrc:(ball&&ball.getAttribute('src'))||'', cardTilt:(card&&card.getAttribute('transform'))||'none', flag:!!document.querySelector('#scrimCupInfo .ciflag') }; });
  console.log('rules popup:',j(info));
  // avatar load (direct) + HUD red card tilt
  const av=await p.evaluate(async()=>{ const im=new Image(); im.src='assets/ducks/avatars/avatar-3.png?v='+(window.DD_VERSION||'1'); await new Promise(r=>{im.onload=r;im.onerror=r;setTimeout(r,1500);});
    beginTourneyRun(7); hearts=2; renderHearts(); const rect=document.querySelector('#hearts svg rect');
    return { avatarLoaded: im.complete&&im.naturalWidth>0, hudCardTilt:(rect&&rect.getAttribute('transform'))||'none', hudCards:document.querySelectorAll('#hearts svg').length }; });
  console.log('avatar+hud:',j(av));
  console.log('asset 4xx:', fails.length?fails.slice(0,8).join(' | '):'none');
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
