// =============================================================
// gen-duckface.js — live REACTING duck-head clips for the grid.
// Same pipeline as gen-ducks.js (Gemini 3 Pro Image keyframe ->
// Seedance 2.0 image-to-video on fal.ai), but: extreme close-up of
// just the duck HEAD on a flat CHROMA-BLUE background so the client
// can key it out and composite the head onto any region-colored cell.
//
//   node brand/gen-duckface.js              # all 3, FAST, 4s
//   node brand/gen-duckface.js happy        # one state
//   node brand/gen-duckface.js --pro        # final quality
//
// Blue screen (not green): the duck is yellow/orange, so blue keys
// out cleanly without eating the duck. Output: assets/ducks/face-<id>.mp4
// =============================================================
const fs = require('fs');
const path = require('path');
function loadEnv(p){ try{ if(!fs.existsSync(p))return; for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){ const m=/^([A-Z_]+)=(.*)$/.exec(l.trim()); if(m&&!process.env[m[1]])process.env[m[1]]=m[2]; } }catch(e){} }
loadEnv(path.join(__dirname,'.env'));
const FAL_KEY=process.env.FAL_KEY, GKEY=process.env.GOOGLE_API_KEY;
if(!FAL_KEY){ console.error('NO FAL_KEY'); process.exit(1); }
if(!GKEY){ console.error('NO GOOGLE_API_KEY'); process.exit(1); }

const args=process.argv.slice(2);
const PRO=args.includes('--pro');
const durIdx=args.indexOf('--dur'); const DUR=durIdx>=0?args[durIdx+1]:'4';
const only=args.filter((a,i)=>!a.startsWith('--')&&args[i-1]!=='--dur');
const MODEL=PRO?'bytedance/seedance-2.0/image-to-video':'bytedance/seedance-2.0/fast/image-to-video';
const GMODEL='gemini-3-pro-image-preview';
const OUT_DIR=path.join(__dirname,'..','assets','ducks');
fs.mkdirSync(OUT_DIR,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const STYLE=`STYLE (mandatory): ONE adorable chunky 3D toy DUCKLING HEAD only, EXTREME CLOSE-UP filling the frame, smooth rounded claymation / cute-Pixar-toy render, buttery yellow head, soft orange beak, two big friendly shiny round eyes, rosy pink cheeks, a tiny tuft of feathers on top. Soft clean studio lighting on the head. Head CENTERED with a small even margin all around. The ENTIRE background is a single FLAT perfectly-even VIVID CHROMA-KEY BLUE (#1666FF), no gradient, no scenery, no props, no shadow cast on the background. NO text, NO logos, NO watermarks.`;

const SCENES=[
  { id:'face-idle',
    frame:`A single clean keyframe, square 1:1, full-bleed. ${STYLE}\nEXPRESSION: calm, content, gently smiling, looking forward, relaxed and cute. This is the resting idle pose.`,
    video:`The duckling head sits calmly and blinks its big eyes, tilts its head slightly and glances around curiously, gentle breathing bob. The camera is perfectly LOCKED and still, the head stays centered, the flat blue background never moves. Smooth seamless idle loop. No dialogue, no text.` },

  { id:'face-happy',
    frame:`A single clean keyframe, square 1:1, full-bleed. ${STYLE}\nEXPRESSION: overjoyed, beaming a big happy smile, eyes squinting happily with sparkles, rosy cheeks glowing. Celebration pose.`,
    video:`The duckling head beams with a big joyful smile, eyes sparkle and squint happily, it does an excited little bounce and a proud nod, cheeks glowing. The camera is perfectly LOCKED and still, the head stays centered, the flat blue background never moves. Smooth seamless happy loop. No dialogue, no text.` },

  { id:'face-oops',
    frame:`A single clean keyframe, square 1:1, full-bleed. ${STYLE}\nEXPRESSION: surprised and worried, wide round eyes, raised brows, a tiny sweat drop, an "oops" look. Reaction pose, cute not scary.`,
    video:`The duckling head reacts with wide surprised eyes and raised brows, gives a little worried wobble and shake, a tiny sweat drop appears, an endearing "oops" reaction. The camera is perfectly LOCKED and still, the head stays centered, the flat blue background never moves. Smooth seamless loop. No dialogue, no text.` },

  { id:'face-sad',
    frame:`A single clean keyframe, square 1:1, full-bleed. ${STYLE}\nEXPRESSION: cutely sad and dejected, droopy half-closed eyes with big glossy tears welling up, a small downturned beak, brows tilted up in the middle. Endearing and gentle, never distressing.`,
    video:`The duckling head looks cutely sad, lower lip quivering, big glossy tears well up in its droopy eyes and one tiny tear rolls down, it gives a soft sniffle and a little downward droop. Gentle, sympathetic, cute. The camera is perfectly LOCKED and still, the head stays centered, the flat blue background never moves. Smooth seamless loop. No dialogue, no text.` },
];

async function genKeyframe(s){
  const body={ contents:[{ parts:[{ text:s.frame }] }], generationConfig:{ responseModalities:['IMAGE'], imageConfig:{ aspectRatio:'1:1', imageSize:'2K' } } };
  for(let a=1;a<=4;a++){ try{
    const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`,{ method:'POST', headers:{ 'x-goog-api-key':GKEY, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
    if(!res.ok) throw new Error('HTTP '+res.status+': '+(await res.text()).slice(0,300));
    const j=await res.json();
    for(const c of (j.candidates||[])) for(const p of ((c.content&&c.content.parts)||[])){ const inl=p.inline_data||p.inlineData; if(inl&&inl.data){ const out=path.join(OUT_DIR,s.id+'-frame.png'); fs.writeFileSync(out,Buffer.from(inl.data,'base64')); console.log('  keyframe -> '+out); return out; } }
    throw new Error('no image');
  }catch(e){ console.log('  keyframe retry '+a+': '+e.message); if(a<4) await sleep(3000*a); else throw e; } }
}
async function falJson(url,opts={}){ let last; for(let a=1;a<=4;a++){ try{ const res=await fetch(url,{ ...opts, headers:{ Authorization:`Key ${FAL_KEY}`, 'Content-Type':'application/json', ...(opts.headers||{}) } }); const t=await res.text(); if(!res.ok) throw new Error('HTTP '+res.status+': '+t.slice(0,300)); return JSON.parse(t); }catch(e){ last=e; if(a<4) await sleep(3000*a); } } throw last; }
async function genVideo(s,frame){
  const dataUri=`data:image/png;base64,${fs.readFileSync(frame).toString('base64')}`;
  const submit=await falJson(`https://queue.fal.run/${MODEL}`,{ method:'POST', body:JSON.stringify({ prompt:s.video, image_url:dataUri, duration:DUR, resolution:'720p', generate_audio:false }) });
  const statusUrl=submit.status_url||`https://queue.fal.run/${MODEL}/requests/${submit.request_id}/status`;
  const respUrl=submit.response_url||`https://queue.fal.run/${MODEL}/requests/${submit.request_id}`;
  console.log('  queued '+submit.request_id);
  let st=''; for(let i=0;i<300;i++){ await sleep(5000); const r=await falJson(statusUrl); if(r.status!==st){st=r.status;console.log('  '+st);} if(st==='COMPLETED')break; if(st==='FAILED'||st==='ERROR')throw new Error('gen failed'); }
  if(st!=='COMPLETED') throw new Error('timeout');
  const result=await falJson(respUrl); const url=result.video&&result.video.url; if(!url) throw new Error('no video url');
  const out=path.join(OUT_DIR,s.id+(PRO?'-pro':'')+'.mp4');
  const v=await fetch(url); fs.writeFileSync(out,Buffer.from(await v.arrayBuffer()));
  console.log('  DONE -> '+out);
}
(async()=>{
  const todo=only.length?SCENES.filter(s=>only.includes(s.id)||only.includes(s.id.replace('face-',''))):SCENES;
  console.log('Duckdoku grid faces: '+todo.map(s=>s.id).join(', ')+'  ('+(PRO?'PRO':'FAST')+', '+DUR+'s)');
  for(const s of todo){ console.log('['+s.id+']'); try{ const f=await genKeyframe(s); await genVideo(s,f); }catch(e){ console.error('['+s.id+'] FAILED: '+(e.message||e)); } }
  console.log('ALL DONE');
})();
