// =============================================================
// gen-ducks.js — animated 3D duck hero clips for Duckdoku.
// Pipeline (mirrors Rail the Way / Dumpling Drop brand/): Gemini 3 Pro
// Image keyframe -> Seedance 2.0 image-to-video on fal.ai.
//
//   node brand/gen-ducks.js              # FAST model (cheap drafts), all scenes
//   node brand/gen-ducks.js --pro        # PRO model (final quality)
//   node brand/gen-ducks.js victory      # just one scene by id
//   node brand/gen-ducks.js --dur 10     # override duration (default 5s)
//
// Keys live in brand/.env (FAL_KEY + GOOGLE_API_KEY). Output mp4s land in
// ../assets/ducks/ so index.html can reference assets/ducks/<id>.mp4.
// =============================================================
const fs = require('fs');
const path = require('path');
function loadEnv(p) { try { if (!fs.existsSync(p)) return; for (const l of fs.readFileSync(p,'utf8').split(/\r?\n/)) { const m=/^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m && !process.env[m[1]]) process.env[m[1]]=m[2]; } } catch(e){} }
loadEnv(path.join(__dirname,'.env'));
const FAL_KEY = process.env.FAL_KEY, GKEY = process.env.GOOGLE_API_KEY;
if (!FAL_KEY) { console.error('NO FAL_KEY (brand/.env)'); process.exit(1); }
if (!GKEY) { console.error('NO GOOGLE_API_KEY (brand/.env)'); process.exit(1); }

const args = process.argv.slice(2);
const PRO = args.includes('--pro');
const durIdx = args.indexOf('--dur');
const DUR = durIdx >= 0 ? args[durIdx+1] : '5';
const only = args.filter((a,i) => !a.startsWith('--') && args[i-1] !== '--dur');
const MODEL = PRO ? 'bytedance/seedance-2.0/image-to-video' : 'bytedance/seedance-2.0/fast/image-to-video';
const GMODEL = 'gemini-3-pro-image-preview';
const OUT_DIR = path.join(__dirname, '..', 'assets', 'ducks');
fs.mkdirSync(OUT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Clean, simple, "clean-2D-game" friendly: the duck is the ONLY rich element,
// rendered on a flat seamless pastel backdrop so it crops cleanly into a card.
const STYLE = `STYLE (mandatory): one single adorable chunky 3D toy DUCKLING, cute low-poly/claymation toy render, smooth rounded shapes, bright buttery-yellow body, soft orange beak and little feet, two LARGE expressive cartoon eyes, each a big round WHITE eyeball with a big round BLACK pupil and a bright catchlight (clearly visible oversized whites and pupils for a very cute expressive look), rosy pink cheeks, tiny stubby wings. Bright saturated candy colors, soft clean studio lighting, gentle ambient occlusion, wholesome and charming. FLAT seamless solid pastel-cream background (#FBF6E9), the duck CENTERED and FULL-BODY with generous empty margin all around, a soft round contact shadow under it. NO text, NO logos, NO watermarks, NO UI, NO letters, NO other characters.`;

const SCENES = [
  { id:'hero',
    frame:`A single clean keyframe, square 1:1, full-bleed. ${STYLE}\nSCENE: the happy duckling standing front-on, smiling warmly, one little wing raised in a friendly wave. Calm and inviting, like a game mascot on a title screen.`,
    video:`The cute duckling bobs gently up and down breathing, blinks its big eyes, and waves its little wing in a slow friendly hello, tiny tail wiggle. Smooth gentle loop, the camera perfectly still. Soft cheerful toy music, a tiny happy quack. No dialogue, no text.` },

  { id:'victory',
    frame:`A single clean keyframe, square 1:1, full-bleed. ${STYLE}\nSCENE: the duckling joyfully celebrating, holding a small shiny GOLDEN TRUMPET up to its beak as if about to play a victory fanfare, colorful confetti and a few little gold stars frozen mid-air around it, arms/wings up in triumph. Pure celebration.`,
    video:`The duckling blows the little golden trumpet in a happy victory fanfare, cheeks puffing, while colorful confetti rains down and gold stars sparkle and pop around it, bouncing up and down with joy, tail wagging. Loopable celebration. Triumphant cheerful toy-fanfare music, a bright trumpet toot and a happy quack. No dialogue, no text.` },

  { id:'defeat',
    frame:`A single clean keyframe, square 1:1, full-bleed. ${STYLE}\nSCENE: the duckling looking cutely sad and dejected, shoulders/wings drooping, big watery puppy eyes, a tiny little grey rain cloud hovering just above its head with one small raindrop. Endearing and gentle, never scary or distressing.`,
    video:`The little duckling slumps with droopy wings and a quivering lip, big watery eyes blinking sadly, the tiny grey cloud above drizzles one or two small raindrops, it gives a soft sigh and a little shiver. Gentle, cute, sympathetic. Soft slow sad-but-sweet toy music, a tiny dejected quack. No dialogue, no text.` },

  { id:'levelup',
    frame:`A single clean keyframe, square 1:1, full-bleed. ${STYLE}\nSCENE: the duckling proudly wearing a tiny shiny gold crown, a soft golden glow and a couple of sparkles around it, beaming with pride. Reward / level-up moment.`,
    video:`A tiny gold crown gently drops onto the duckling's head, it beams proudly and does a happy little hop, soft golden sparkles twinkling around it. Smooth short loop. Warm rewarding chime music and a proud little quack. No dialogue, no text.` },
];

async function genKeyframe(s) {
  const body = { contents:[{ parts:[{ text:s.frame }] }],
    generationConfig:{ responseModalities:['IMAGE'], imageConfig:{ aspectRatio:'1:1', imageSize:'2K' } } };
  for (let a=1;a<=4;a++){
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`,
        { method:'POST', headers:{ 'x-goog-api-key':GKEY, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
      if (!res.ok) throw new Error('HTTP '+res.status+': '+(await res.text()).slice(0,300));
      const j = await res.json();
      for (const c of (j.candidates||[])) for (const p of ((c.content&&c.content.parts)||[])) {
        const inl = p.inline_data||p.inlineData;
        if (inl&&inl.data){ const out=path.join(OUT_DIR, s.id+'-frame.png'); fs.writeFileSync(out, Buffer.from(inl.data,'base64')); console.log('  keyframe -> '+out); return out; }
      }
      throw new Error('no image: '+JSON.stringify(j).slice(0,200));
    } catch(e){ console.log('  keyframe retry '+a+': '+e.message); if(a<4) await sleep(3000*a); else throw e; }
  }
}
async function falJson(url, opts={}) {
  let last; for (let a=1;a<=4;a++){ try {
    const res = await fetch(url, { ...opts, headers:{ Authorization:`Key ${FAL_KEY}`, 'Content-Type':'application/json', ...(opts.headers||{}) } });
    const t = await res.text(); if (!res.ok) throw new Error('HTTP '+res.status+': '+t.slice(0,300)); return JSON.parse(t);
  } catch(e){ last=e; if(a<4) await sleep(3000*a); } } throw last;
}
async function genVideo(s, frame) {
  const dataUri = `data:image/png;base64,${fs.readFileSync(frame).toString('base64')}`;
  const submit = await falJson(`https://queue.fal.run/${MODEL}`, { method:'POST', body:JSON.stringify({ prompt:s.video, image_url:dataUri, duration:DUR, resolution:'720p', generate_audio:true }) });
  const statusUrl = submit.status_url || `https://queue.fal.run/${MODEL}/requests/${submit.request_id}/status`;
  const respUrl = submit.response_url || `https://queue.fal.run/${MODEL}/requests/${submit.request_id}`;
  console.log('  queued '+submit.request_id);
  let st=''; for (let i=0;i<300;i++){ await sleep(5000); const r=await falJson(statusUrl); if(r.status!==st){st=r.status; console.log('  '+st);} if(st==='COMPLETED') break; if(st==='FAILED'||st==='ERROR') throw new Error('gen failed: '+JSON.stringify(r).slice(0,200)); }
  if (st!=='COMPLETED') throw new Error('timeout');
  const result = await falJson(respUrl);
  const url = result.video && result.video.url; if(!url) throw new Error('no video url');
  const out = path.join(OUT_DIR, s.id+(PRO?'-pro':'')+'.mp4');
  const v = await fetch(url); fs.writeFileSync(out, Buffer.from(await v.arrayBuffer()));
  console.log('  DONE -> '+out);
}
(async () => {
  const todo = only.length ? SCENES.filter(s=>only.includes(s.id)) : SCENES;
  console.log('Duckdoku duck videos: '+todo.map(s=>s.id).join(', ')+'  ('+(PRO?'PRO':'FAST')+', '+DUR+'s)');
  for (const s of todo) {
    console.log('['+s.id+']');
    try { const f = await genKeyframe(s); await genVideo(s, f); }
    catch(e){ console.error('['+s.id+'] FAILED: '+(e.message||e)); }
  }
  console.log('ALL DONE');
})();
