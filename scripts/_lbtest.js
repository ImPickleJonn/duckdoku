const express=require('express');
// in-memory players store mock
const store=new Map();   // tg_id -> save(object)
function guestUid(gid){let h=0;const s=String(gid);for(let i=0;i<s.length;i++)h=(Math.imul(h,131)+s.charCodeAt(i))>>>0;return 9000000000000+h;}
// seed 60 TG players levels 13..72 (all above the gate, so the guest at L14 lands low)
for(let i=0;i<60;i++){ store.set(String(1000+i), {levelsDone: 12 + (60-i), name:'Star'+i}); }   // i=0 -> L72 ... i=59 -> L13
const dbPool={ query: async(sql,params)=>{
  if(/SELECT save FROM players WHERE tg_id/.test(sql)){ const s=store.get(String(params[0])); return { rows: s?[{save:s}]:[] }; }
  if(/INSERT INTO players/.test(sql)){ store.set(String(params[0]), JSON.parse(params[3])); return {rows:[]}; }
  if(/SELECT tg_id, first_name, username, save FROM players/.test(sql)){ return { rows: [...store.entries()].map(([tg_id,save])=>({tg_id, first_name:null, username:null, save})) }; }
  return {rows:[]};
}};
// build a minimal app wiring server's leaderboard logic by requiring server is heavy; instead replicate via a tiny harness:
// We import the real handlers by spinning the real server is complex (it boots bot). So we re-implement the exact same code path is risky.
// Instead: require the real server module functions are not exported. Use a route copy is not DRY. So test through the real server by setting env to skip bot.
process.env.NO_BOT='1';
console.log('NOTE: validating leaderboard logic via direct DB-shape simulation');
// Simulate computeLeaderboard + selfRegister exactly as server.js does:
const LEVEL_GATE=13;
async function computeLeaderboard(){ const byUid=new Map();
  const q=await dbPool.query('SELECT tg_id, first_name, username, save FROM players');
  for(const row of q.rows){ let sv=row.save; const done=Number(sv&&sv.levelsDone)||0; byUid.set(String(row.tg_id), {name:(sv&&sv.name)||'Duck', done, avatar:null}); }
  const arr=[]; for(const [uid,v] of byUid){ if(v.done>=LEVEL_GATE-1) arr.push({uid:String(uid), name:v.name, level:v.done+1, avatar:null}); }
  arr.sort((a,b)=>b.level-a.level); return arr;
}
async function selfRegister(uid, body){ const lvls=Math.max(0,Math.min(9999,Math.floor(Number(body.levelsDone)||0))); if(lvls<=0)return;
  const ex=await dbPool.query('SELECT save FROM players WHERE tg_id=$1',[String(uid)]); let sv=ex.rows[0]&&ex.rows[0].save; sv=sv||{};
  sv.levelsDone=Math.max(Number(sv.levelsDone)||0,lvls); if(body.name)sv.name=String(body.name).slice(0,24);
  await dbPool.query('INSERT INTO players',[String(uid),null,null,JSON.stringify(sv)]);
}
(async()=>{
  // pre-set Pickle with an existing rich save to verify MERGE (foo preserved)
  const PICKLE=String(guestUid('anon-pickle')); store.set(PICKLE,{levelsDone:5, foo:'bar'});
  await selfRegister(PICKLE, {levelsDone:14, name:'Pickle'});
  console.log('merge check (foo preserved, level maxed):', JSON.stringify(store.get(PICKLE)));
  const arr=await computeLeaderboard();
  const cid=PICKLE; const top=arr.slice(0,50).map((r,i)=>({rank:i+1,name:r.name,level:r.level,me:r.uid===cid}));
  const idx=arr.findIndex(r=>r.uid===cid); const me=idx>=0?{found:true,rank:idx+1,level:arr[idx].level}:{found:false};
  console.log('total ranked:',arr.length,'| top size:',top.length,'| top flagged:',top.filter(t=>t.me).length);
  console.log('me:',JSON.stringify(me));
  console.log('me beyond top50?', me.rank>top.length, '-> client appends placement row');
  // a TG player in the top
  const cid2='1000'; const idx2=arr.findIndex(r=>r.uid===cid2); console.log('top player Star0 rank:', idx2+1, 'level', arr[idx2].level);
})();
