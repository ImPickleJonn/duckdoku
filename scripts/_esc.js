const { chromium } = require('playwright');
const PORT=process.argv[2];
(async()=>{
  const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
  const p=await(await b.newContext({viewport:{width:412,height:892},deviceScaleFactor:2})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
  await p.goto('http://127.0.0.1:'+PORT+'/game.html',{waitUntil:'load'}); await p.waitForTimeout(3500);
  // escalation + N=12 generation timing
  const esc=await p.evaluate(()=>{ save.levelsDone=12;save.tutorialDone=true;save.country='BR';save.name='P';save.avatar='avatar-3';if(typeof ftue!=='undefined')ftue=null;cupClearOverlays();persist(); beginTourneyRun(123456);
    const out={}; [0,1,4,8,9].forEach(k=>{ const t0=Date.now(); wcLoadBoard(k); out['k'+k]={N, ok:(puzzle&&puzzle.solCols&&puzzle.solCols.length===N&&Array.isArray(puzzle.region)), ms:Date.now()-t0}; }); return out; });
  console.log('escalation:',JSON.stringify(esc));
  // back-confirm: in a run, btnBack opens the confirm (not exit)
  const bk=await p.evaluate(()=>{ beginTourneyRun(123456); tryGuess(0,puzzle.solCols[0]);
    document.getElementById('btnBack').click();
    return {confirmOpen:document.getElementById('scrimCupQuit').classList.contains('on'), stillActive:TOURNEY.active, onGame:document.getElementById('game').classList.contains('on')}; });
  console.log('back-confirm:',JSON.stringify(bk));
  const stay=await p.evaluate(()=>{ document.getElementById('cqStay').click(); return {closed:!document.getElementById('scrimCupQuit').classList.contains('on'), active:TOURNEY.active}; });
  console.log('keep-playing:',JSON.stringify(stay));
  const leave=await p.evaluate(()=>{ document.getElementById('btnBack').click(); document.getElementById('cqLeave').click(); return {home:document.getElementById('home').classList.contains('on'), active:TOURNEY.active}; });
  console.log('leave:',JSON.stringify(leave));
  // settings restart hidden in a run
  const setr=await p.evaluate(()=>{ beginTourneyRun(123456); document.getElementById('btnGear').click(); const r=getComputedStyle(document.getElementById('setRestart')).display; const open=document.getElementById('scrimSet').classList.contains('on'); return {setOpen:open, restartHidden:r==='none'}; });
  console.log('settings:',JSON.stringify(setr));
  console.log('pageerrors:',errs.length?errs.slice(0,4).join(' | '):'none');
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
