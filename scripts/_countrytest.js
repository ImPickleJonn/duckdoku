const express=require('express'); const {register}=require('../tourney');
function guestUid(gid){let h=0;const s=String(gid);for(let i=0;i<s.length;i++)h=(Math.imul(h,131)+s.charCodeAt(i))>>>0;return 9000000000000+h;}
const PICKLE=String(guestUid('anon-pickle'));
const dbPool={ query: async(sql)=>{
  if(/FROM tourney_runs[\s\S]*GROUP BY tg_id/.test(sql)){
    return { rows:[ {tg_id:'1',name:'TopDuck',goals:300}, {tg_id:'2',name:'SecondDuck',goals:200}, {tg_id:PICKLE,name:'Pickle',goals:5} ] };
  }
  return { rows:[] };
}};
const app=express(); app.use(express.json());
register(app,{dbPool, validateInitData:()=>null, users:new Map(), noteUser:()=>{}});
const srv=app.listen(8811, async()=>{
  const f=(p,o)=>fetch('http://127.0.0.1:8811'+p,o).then(r=>r.json());
  const co=await f('/api/tourney/country',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cc:'US',guestId:'anon-pickle'})});
  console.log('POST me:',JSON.stringify(co.me));
  const flagged=co.players.filter(p=>p.me);
  console.log('POST flagged:',flagged.length, flagged.map(p=>'#'+p.rank+' '+p.name+'('+p.goals+')').join(','));
  console.log('POST players:',co.players.length,'| top3:',co.players.slice(0,3).map(p=>p.rank+'.'+p.name).join(', '));
  const cg=await f('/api/tourney/country?cc=US');
  console.log('legacy GET me:',JSON.stringify(cg.me),'| players:',cg.players.length,'| flagged:',cg.players.filter(p=>p.me).length);
  // a caller who never scored -> found:false (so client shows "play to rank")
  const cn=await f('/api/tourney/country',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({cc:'US',guestId:'anon-nobody'})});
  console.log('never-scored me:',JSON.stringify(cn.me));
  srv.close();
});
