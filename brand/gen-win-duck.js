// =============================================================
// gen-win-duck.js — CLEAN win-screen trumpet celebration for Duckdoku.
//
// The win screen keys this video at runtime (faceKeyed.win): any vivid-blue
// pixel becomes transparent, and confetti is composited ON TOP in-game
// (confettiRain). So the SOURCE must be the duck + golden trumpet on a flat
// PURE-BLUE chroma background with absolutely NO confetti / stars / sparkles /
// particles / floor / shadow baked in.
//
//   node brand/gen-win-duck.js            # keyframe + video (FAST seedance)
//   node brand/gen-win-duck.js --pro      # PRO seedance (final quality)
//   node brand/gen-win-duck.js --frame    # just regenerate the keyframe
//   node brand/gen-win-duck.js --video    # animate the existing keyframe
//   node brand/gen-win-duck.js --dur 6    # duration (default 5s)
//
// Keys live in brand/.env (FAL_KEY + GOOGLE_API_KEY). Reference character =
// assets/ducks/victory-frame.png (same duck + trumpet). Output overwrites
// assets/ducks/win-duck.mp4 (keyframe -> assets/ducks/win-frame.png).
// =============================================================
const fs = require('fs');
const path = require('path');
function loadEnv(p){ try{ if(!fs.existsSync(p))return; for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){ const m=/^([A-Z_]+)=(.*)$/.exec(l.trim()); if(m&&!process.env[m[1]])process.env[m[1]]=m[2]; } }catch(e){} }
loadEnv(path.join(__dirname,'.env'));
const FAL_KEY = process.env.FAL_KEY, GKEY = process.env.GOOGLE_API_KEY;
if(!FAL_KEY){ console.error('NO FAL_KEY (brand/.env)'); process.exit(1); }
if(!GKEY){ console.error('NO GOOGLE_API_KEY (brand/.env)'); process.exit(1); }

const args = process.argv.slice(2);
const PRO = args.includes('--pro');
const ONLY_FRAME = args.includes('--frame');
const ONLY_VIDEO = args.includes('--video');
const NO_REF = args.includes('--noref');
const durIdx = args.indexOf('--dur');
const DUR = durIdx >= 0 ? args[durIdx+1] : '5';
const MODEL = PRO ? 'bytedance/seedance-2.0/image-to-video' : 'bytedance/seedance-2.0/fast/image-to-video';
const GMODEL = 'gemini-3-pro-image-preview';
const OUT_DIR = path.join(__dirname, '..', 'assets', 'ducks');
const REF = path.join(OUT_DIR, 'victory-frame.png');
const FRAME_OUT = path.join(OUT_DIR, 'win-frame.png');
const VIDEO_OUT = path.join(OUT_DIR, 'win-duck.mp4');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Same chunky 3D toy duckling as the rest of the game.
const DUCK = `one single adorable chunky 3D toy DUCKLING, cute low-poly/claymation toy render, smooth rounded shapes, bright buttery-yellow body, soft orange beak and little feet, two LARGE expressive cartoon eyes (big round white eyeballs with big black pupils and a bright catchlight), rosy pink cheeks, tiny stubby wings. Bright saturated candy colors, soft clean studio lighting, gentle ambient occlusion, wholesome and charming.`;

// The chroma background MUST be a single flat saturated blue so runtime keying
// (b>80 && b>r*1.18 && b>g*1.10 -> transparent) removes it perfectly. The duck
// is warm yellow/orange, so it survives the key.
const CHROMA = `The ENTIRE background is one single FLAT, EVEN, PURE SATURATED CHROMA-KEY BLUE (#1B53FF), edge to edge, perfectly uniform like a green-screen studio. The duckling FLOATS centered and full-body with generous empty blue margin all around.`;

const NEGATIVE = `ABSOLUTELY NO confetti, NO streamers, NO stars, NO sparkles, NO glitter, NO particles, NO bokeh, NO motion lines, NO floor, NO ground, NO platform, NO table, NO drop shadow, NO contact shadow under the duck, NO gradient, NO vignette, NO scenery, NO text, NO logos, NO watermarks, NO UI, NO letters, NO other characters. Nothing but the duck on flat blue.`;

const FRAME_PROMPT = `A single clean keyframe, square 1:1, full-bleed. ${DUCK}\nSCENE: the duckling joyfully celebrating a win, facing the camera front-on, holding a small shiny GOLDEN TRUMPET up to its beak as if blowing a happy victory fanfare, cheeks puffed, little wings raised in triumph, beaming with joy.\n${CHROMA}\n${NEGATIVE}`;

const VIDEO_PROMPT = `The cute duckling blows its little golden trumpet in a happy looping victory fanfare: cheeks puff, it bounces gently up and down with joy, tail wagging, big eyes blinking, wings lifting in celebration. Smooth seamless loop, the camera perfectly still. The background stays a COMPLETELY STATIC, UNCHANGING, FLAT PURE BLUE chroma screen the entire time. ${NEGATIVE} Do not add anything to the scene. No dialogue, no text.`;

async function genKeyframe(){
  let refPart = null;
  try{ if(!NO_REF && fs.existsSync(REF)){ refPart = { inline_data:{ mime_type:'image/png', data:fs.readFileSync(REF).toString('base64') } }; console.log('  using character ref: victory-frame.png'); } }catch(e){}
  if(NO_REF) console.log('  text-only (no reference image)');
  const parts = [{ text: FRAME_PROMPT + (refPart?'\nKeep the SAME duck character and golden trumpet as the reference image, but redraw on the flat pure-blue chroma background with no confetti or particles.':'') }];
  if(refPart) parts.push(refPart);
  const body = { contents:[{ parts }], generationConfig:{ responseModalities:['IMAGE'], imageConfig:{ aspectRatio:'1:1', imageSize:'2K' } } };
  for(let a=1;a<=4;a++){
    try{
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`,
        { method:'POST', headers:{ 'x-goog-api-key':GKEY, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
      if(!res.ok) throw new Error('HTTP '+res.status+': '+(await res.text()).slice(0,300));
      const j = await res.json();
      for(const c of (j.candidates||[])) for(const p of ((c.content&&c.content.parts)||[])){
        const inl = p.inline_data||p.inlineData;
        if(inl&&inl.data){ fs.writeFileSync(FRAME_OUT, Buffer.from(inl.data,'base64')); console.log('  keyframe -> '+FRAME_OUT); return FRAME_OUT; }
      }
      throw new Error('no image: '+JSON.stringify(j).slice(0,200));
    }catch(e){ console.log('  keyframe retry '+a+': '+e.message); if(a<4) await sleep(3000*a); else throw e; }
  }
}
async function falJson(url, opts={}){
  let last; for(let a=1;a<=4;a++){ try{
    const res = await fetch(url, { ...opts, headers:{ Authorization:`Key ${FAL_KEY}`, 'Content-Type':'application/json', ...(opts.headers||{}) } });
    const t = await res.text(); if(!res.ok) throw new Error('HTTP '+res.status+': '+t.slice(0,300)); return JSON.parse(t);
  }catch(e){ last=e; if(a<4) await sleep(3000*a); } } throw last;
}
async function genVideo(frame){
  const dataUri = `data:image/png;base64,${fs.readFileSync(frame).toString('base64')}`;
  const submit = await falJson(`https://queue.fal.run/${MODEL}`, { method:'POST', body:JSON.stringify({ prompt:VIDEO_PROMPT, image_url:dataUri, duration:DUR, resolution:'720p', generate_audio:false }) });
  const statusUrl = submit.status_url || `https://queue.fal.run/${MODEL}/requests/${submit.request_id}/status`;
  const respUrl = submit.response_url || `https://queue.fal.run/${MODEL}/requests/${submit.request_id}`;
  console.log('  queued '+submit.request_id);
  let st=''; for(let i=0;i<300;i++){ await sleep(5000); const r=await falJson(statusUrl); if(r.status!==st){st=r.status; console.log('  '+st);} if(st==='COMPLETED') break; if(st==='FAILED'||st==='ERROR') throw new Error('gen failed: '+JSON.stringify(r).slice(0,200)); }
  if(st!=='COMPLETED') throw new Error('timeout');
  const result = await falJson(respUrl);
  const url = result.video && result.video.url; if(!url) throw new Error('no video url');
  const v = await fetch(url); fs.writeFileSync(VIDEO_OUT, Buffer.from(await v.arrayBuffer()));
  console.log('  DONE -> '+VIDEO_OUT);
}
(async () => {
  console.log('Duckdoku WIN duck (clean, no particles)  ('+(PRO?'PRO':'FAST')+', '+DUR+'s)');
  let frame = FRAME_OUT;
  if(!ONLY_VIDEO){ frame = await genKeyframe(); }
  if(ONLY_FRAME){ console.log('frame-only done'); return; }
  if(!fs.existsSync(frame)){ throw new Error('no keyframe at '+frame+' (run without --video first)'); }
  await genVideo(frame);
  console.log('ALL DONE');
})().catch(e => { console.error('FAILED: '+(e.message||e)); process.exit(1); });
