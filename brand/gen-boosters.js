// =============================================================
// gen-boosters.js — live 3D booster icons (hint + undo), same
// pipeline + blue-screen keying as the duck faces. Output:
// assets/ducks/bst-hint.mp4, bst-undo.mp4  (warm colors so the
// blue chroma keys out cleanly).
//   node brand/gen-boosters.js            # both, FAST, 4s
//   node brand/gen-boosters.js bst-hint   # one
//   node brand/gen-boosters.js --pro
// =============================================================
const fs=require('fs'),path=require('path');
function loadEnv(p){try{if(!fs.existsSync(p))return;for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=/^([A-Z_]+)=(.*)$/.exec(l.trim());if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}}catch(e){}}
loadEnv(path.join(__dirname,'.env'));
const FAL_KEY=process.env.FAL_KEY,GKEY=process.env.GOOGLE_API_KEY;
if(!FAL_KEY||!GKEY){console.error('missing keys');process.exit(1);}
const args=process.argv.slice(2);const PRO=args.includes('--pro');
const durIdx=args.indexOf('--dur');const DUR=durIdx>=0?args[durIdx+1]:'4';
const only=args.filter((a,i)=>!a.startsWith('--')&&args[i-1]!=='--dur');
const MODEL=PRO?'bytedance/seedance-2.0/image-to-video':'bytedance/seedance-2.0/fast/image-to-video';
const GMODEL='gemini-3-pro-image-preview';
const OUT=path.join(__dirname,'..','assets','ducks');fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const BG=`The ENTIRE background is a single FLAT perfectly-even VIVID CHROMA-KEY BLUE (#1666FF), no gradient, no scenery, no shadow on the background. The object is CENTERED and fills most of the frame with an even margin. Soft clean studio lighting. NO text, NO logos.`;

const SCENES=[
  { id:'bst-hint',
    frame:`A single clean keyframe, square 1:1. A cute chunky 3D toy LIGHTBULB: glossy rounded glass bulb with a warm GOLDEN glowing filament inside, a little brass screw base at the bottom, cheerful and friendly, claymation / cute-Pixar-toy style, warm yellow and gold tones (NO blue tint on the bulb). ${BG}`,
    video:`The toy lightbulb pulses its warm golden glow gently brighter and softer, a couple of little sparkle glints twinkle around it, a tiny springy bob. The camera is perfectly LOCKED and still, the object stays centered, the flat blue background never moves. Smooth seamless loop. No dialogue, no text.` },
  { id:'bst-undo',
    frame:`A single clean keyframe, square 1:1. A cute chunky 3D toy UNDO ARROW: a glossy rounded arrow curving counter-clockwise into a back / rewind loop, warm ORANGE and gold, smooth claymation / cute-Pixar-toy style, friendly and bouncy (NO blue on the arrow). ${BG}`,
    video:`The curved orange undo arrow gently rotates a little counter-clockwise and bounces back with a springy wobble, a soft shine sweeps across its glossy surface. The camera is perfectly LOCKED and still, the object stays centered, the flat blue background never moves. Smooth seamless loop. No dialogue, no text.` },
];
async function genKeyframe(s){const body={contents:[{parts:[{text:s.frame}]}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'2K'}}};
  for(let a=1;a<=4;a++){try{const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`,{method:'POST',headers:{'x-goog-api-key':GKEY,'Content-Type':'application/json'},body:JSON.stringify(body)});if(!res.ok)throw new Error('HTTP '+res.status+': '+(await res.text()).slice(0,200));const j=await res.json();for(const c of(j.candidates||[]))for(const p of((c.content&&c.content.parts)||[])){const inl=p.inline_data||p.inlineData;if(inl&&inl.data){const o=path.join(OUT,s.id+'-frame.png');fs.writeFileSync(o,Buffer.from(inl.data,'base64'));console.log('  keyframe -> '+o);return o;}}throw new Error('no image');}catch(e){console.log('  retry '+a+': '+e.message);if(a<4)await sleep(3000*a);else throw e;}}}
async function falJson(url,opts={}){let last;for(let a=1;a<=4;a++){try{const res=await fetch(url,{...opts,headers:{Authorization:`Key ${FAL_KEY}`,'Content-Type':'application/json',...(opts.headers||{})}});const t=await res.text();if(!res.ok)throw new Error('HTTP '+res.status+': '+t.slice(0,200));return JSON.parse(t);}catch(e){last=e;if(a<4)await sleep(3000*a);}}throw last;}
async function genVideo(s,frame){const dataUri=`data:image/png;base64,${fs.readFileSync(frame).toString('base64')}`;
  const submit=await falJson(`https://queue.fal.run/${MODEL}`,{method:'POST',body:JSON.stringify({prompt:s.video,image_url:dataUri,duration:DUR,resolution:'720p',generate_audio:false})});
  const statusUrl=submit.status_url||`https://queue.fal.run/${MODEL}/requests/${submit.request_id}/status`;
  const respUrl=submit.response_url||`https://queue.fal.run/${MODEL}/requests/${submit.request_id}`;
  console.log('  queued '+submit.request_id);
  let st='';for(let i=0;i<300;i++){await sleep(5000);const r=await falJson(statusUrl);if(r.status!==st){st=r.status;console.log('  '+st);}if(st==='COMPLETED')break;if(st==='FAILED'||st==='ERROR')throw new Error('gen failed');}
  if(st!=='COMPLETED')throw new Error('timeout');
  const result=await falJson(respUrl);const url=result.video&&result.video.url;if(!url)throw new Error('no url');
  const o=path.join(OUT,s.id+(PRO?'-pro':'')+'.mp4');const v=await fetch(url);fs.writeFileSync(o,Buffer.from(await v.arrayBuffer()));console.log('  DONE -> '+o);}
(async()=>{const todo=only.length?SCENES.filter(s=>only.includes(s.id)):SCENES;console.log('booster icons: '+todo.map(s=>s.id).join(', ')+' ('+(PRO?'PRO':'FAST')+', '+DUR+'s)');
  for(const s of todo){console.log('['+s.id+']');try{const f=await genKeyframe(s);await genVideo(s,f);}catch(e){console.error('['+s.id+'] FAILED: '+(e.message||e));}}console.log('ALL DONE');})();
