const { chromium } = require('playwright');
const PORT=process.argv[2];
const j=o=>JSON.stringify(o);
(async()=>{
  const b=await chromium.launch();
  const p=await(await b.newContext({viewport:{width:412,height:892},deviceScaleFactor:2})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
  await p.goto('http://127.0.0.1:'+PORT+'/game.html',{waitUntil:'load'}); await p.waitForTimeout(3200);
  await p.evaluate(()=>{ save.levelsDone=12;save.tutorialDone=true;save.country='BR';save.name='Pickle';save.avatar='avatar-3'; window._myCupGoals=undefined; persist(); cupClearOverlays&&cupClearOverlays(); });

  // A) History empty vs populated
  const histEmpty=await p.evaluate(()=>{ save.cupHistory=[]; persist(); openCupHist(); return {title:$('thistTitle').textContent, sub:$('thistSub').textContent, subShown:getComputedStyle($('thistSub')).display!=='none', listEmpty:$('thistList').innerHTML.trim()===''}; });
  console.log('A history-empty:',j(histEmpty));
  const histFull=await p.evaluate(()=>{ save.cupHistory=[{seed:1,score:7,rank:1,goals:3,board:[{rank:1,name:'Pickle',country:'BR',score:7,me:true}],ts:1700000000000}]; persist(); openCupHist(); return {subHidden:getComputedStyle($('thistSub')).display==='none', rows:$('thistList').querySelectorAll('.thist').length}; });
  console.log('A history-full:',j(histFull));

  // B) wcMe goals chip (no edit)
  const wcme=await p.evaluate(()=>{ closeAll&&closeAll(); show('wc'); updWcScreen(); const m=$('wcMe'); return {hasGoals:!!m.querySelector('.wcmegoals'), hasEdit:!!m.querySelector('.wcmeedit'), txt:(m.querySelector('.wcmegoals')||{}).textContent||''}; });
  console.log('B wcMe:',j(wcme));

  // C) Podium run mode (champion -> sticker), #rank, goals under rank, single button
  const champ=await p.evaluate(()=>{ const board=[{rank:1,name:'Pickle',country:'BR',score:9,me:true},{rank:2,name:'Coco',country:'FR',score:7},{rank:3,name:'Dax',country:'JP',score:5},{rank:4,name:'Olive',country:'US',score:3}];
    resolveCupResult({board,myRank:1,goals:3,prize:{gold:100,sticker:true}});
    const pod1=document.querySelector('.pod.p1'); const rankEl=pod1.querySelector('.podrank'); const sc=pod1.querySelector('.podbar .podsc'); const flagInWrap=!!pod1.querySelector('.podavwrap .podflag');
    return { rank1Text:rankEl.textContent, goalsUnderRank:!!sc, scText:(sc||{}).textContent||'', flagBadgeOnAv:flagInWrap, stickerShown:getComputedStyle($('cupSticker')).display!=='none', resAgainExists:!!document.getElementById('tResAgain'), closeText:$('tResClose').textContent, closeShown:getComputedStyle($('tResClose')).display!=='none' }; });
  console.log('C champion:',j(champ));

  // D) renderCupExtra rank + flag-on-avatar
  const extra=await p.evaluate(()=>{ const ce=$('cupExtra'); const row=ce.querySelector('.cupyou'); return { extraRows:ce.querySelectorAll('.cupyou').length, rankText:(row&&row.querySelector('.trank').textContent)||'', flagInCyav:!!(row&&row.querySelector('.cyav .tfg')) }; });
  console.log('D extra:',j(extra));

  // E) Only #1 gets sticker (rank 2 -> no sticker)
  const rank2=await p.evaluate(()=>{ const board=[{rank:1,name:'Coco',country:'FR',score:9},{rank:2,name:'Pickle',country:'BR',score:7,me:true},{rank:3,name:'Dax',country:'JP',score:5}];
    resolveCupResult({board,myRank:2,goals:2,prize:{gold:50}});
    return { stickerShown:getComputedStyle($('cupSticker')).display!=='none', closeText:$('tResClose').textContent }; });
  console.log('E rank2-no-sticker:',j(rank2));

  // F) Single button nav -> WC country leaderboard
  const nav=await p.evaluate(()=>{ _cupResMode='run'; $('tResClose').click(); return { resClosed:!$('scrimCupRes').classList.contains('on'), wcShown:$('wc').classList.contains('on') }; });
  console.log('F nav-letsgo:',j(nav));

  // G) my-country leaderboard uses server me (no false "play to rank")
  const lb=await p.evaluate(async()=>{ window._tapi=(path,body)=> Promise.resolve(path.indexOf('country')>=0 ? {players:[{rank:1,name:'TopDuck',goals:300,me:false},{rank:2,name:'SecondDuck',goals:200,me:false}], me:{found:true,rank:53,goals:5}} : null);
    setTwcTab('mine'); await new Promise(r=>setTimeout(r,250)); const h=$('twcList').innerHTML;
    return { hasYou:/You|Ты/.test(h), has5goals:/5 /.test(h)&&/53/.test(h), noPlayToRank:!/play to rank|сыграй/.test(h), wcMeGoals:($('wcMeGoals')||{}).textContent||'' }; });
  console.log('G my-country(rank53):',j(lb));
  const lb2=await p.evaluate(async()=>{ window._tapi=(path,body)=> Promise.resolve(path.indexOf('country')>=0 ? {players:[{rank:1,name:'TopDuck',goals:300,me:false},{rank:2,name:'Pickle',goals:200,me:true}], me:{found:true,rank:2,goals:200}} : null);
    setTwcTab('mine'); await new Promise(r=>setTimeout(r,250)); const rows=$('twcList').querySelectorAll('.lcrow.me'); return { meRows:rows.length, meText:(rows[0]||{}).textContent||'' }; });
  console.log('G my-country(top2):',j(lb2));

  console.log('pageerrors:',errs.length?errs.slice(0,5).join(' | '):'none');
  await b.close();
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
