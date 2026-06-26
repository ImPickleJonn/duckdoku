// =============================================================
// gen-victory.js — 5 funny VICTORY-CELEBRATION duck clips for the win screen.
// Unlike gen-notif-anims.js (text-only duck -> generic), this ANCHORS to our REAL
// duck: it passes assets/ducks/face-idle-frame.png as an image reference to NBP
// (Gemini 3 Pro Image) so the generated duck IS our duck, then FAL Seedance
// image-to-video animates it. CLEAN for chroma-key: full-body duck on a perfectly
// flat solid azure-blue (#006BFF, the same key color the in-game faces use),
// and ABSOLUTELY NO particles/confetti/sparkles (the game adds its own confetti).
//   node brand/gen-victory.js            # all 5 (FAST)
//   node brand/gen-victory.js --pro      # final quality
//   node brand/gen-victory.js v_dance    # one by id
// Keys: brand/.env (FAL_KEY + GOOGLE_API_KEY). Output: Desktop/duckdoku-victory/.
// =============================================================
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
function loadEnv(p){try{if(!fs.existsSync(p))return;for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=/^([A-Z_]+)=(.*)$/.exec(l.trim());if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}}catch(e){}}
loadEnv(path.join(__dirname,'.env'));
const FAL_KEY=process.env.FAL_KEY, GKEY=process.env.GOOGLE_API_KEY;
if(!FAL_KEY){console.error('NO FAL_KEY (brand/.env)');process.exit(1);}
if(!GKEY){console.error('NO GOOGLE_API_KEY (brand/.env)');process.exit(1);}
const args=process.argv.slice(2);
const PRO=args.includes('--pro');
const DUR=(args.indexOf('--dur')>=0)?args[args.indexOf('--dur')+1]:'5';
const FRAMES_ONLY=args.includes('--frames');
const only=args.filter((a,i)=>!a.startsWith('--')&&args[i-1]!=='--dur');
const MODEL=PRO?'bytedance/seedance-2.0/image-to-video':'bytedance/seedance-2.0/fast/image-to-video';
const GMODEL='gemini-3-pro-image-preview';
const REF=path.join(__dirname,'..','assets','ducks','duck-master.png'); // MASTER = the official Duckdoku app-icon duck (bright saturated yellow)
const OUT=path.join(os.homedir(),'Desktop','duckdoku-victory'); fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const STYLE=`STYLE (MANDATORY — match the MASTER reference image EXACTLY; it is our official Duckdoku app-icon duck): the SAME duck character with the SAME BRIGHT SATURATED golden-yellow body (vivid warm yellow, NOT pale, NOT buttery). Keep its face IDENTICAL to the reference: a chunky rounded head, two LARGE dark expressive eyes (rounded, glossy dark brown-black, with two bright white catchlights), coral rosy-pink oval cheeks, a bright orange duck beak with an OPEN happy smile (little red tongue) and two tiny nostril dots, and a small swept 3-feather yellow hair tuft on top. Same glossy smooth soft-3D claymation toy look and soft studio lighting. IMPORTANT: copy ONLY THE DUCK from the reference — do NOT reproduce the reference's blue/orange grid background, its white X marks, or its rounded white sticker outline/border. Render the duck FULL BODY: chunky round body, two small stubby wings, little orange webbed feet. The duck is the clear hero, CENTERED, the WHOLE body comfortably in frame with margin. BACKGROUND: a perfectly FLAT SOLID bright azure blue, exactly RGB(0,107,255) / #006BFF, totally uniform — NO gradient, NO grid, NO pattern, NO white outline, NO border, NO vignette, NO background shadow. ABSOLUTELY NO particles, NO confetti, NO sparkles, NO glitter, NO stars, NO motion lines, NO text, NO words, NO logos, NO props, NO extra objects — ONLY the single duck on the flat blue.`;

// 5 funny celebrations. frame = NBP keyframe pose; video = FAL motion (silent, loopable).
const SCENES=[
  { id:'v_dance', frame:`SCENE: the full-body duck mid happy little dance, leaning to one side with both little wings out and one orange foot lifted in a step, big joyful open smile.`,
    video:`The duck does a silly cute happy dance: sways side to side, little wings waving, hips and tail wiggling, feet doing tiny tap-steps, head bobbing to a beat, beaming the whole time. The background stays a perfectly flat solid azure blue, camera perfectly still, the duck stays centered. Smooth seamless loop. Absolutely no particles, no confetti, no sparkles, no text.` },
  { id:'v_jump', frame:`SCENE: the full-body duck caught mid joyful jump, both little feet off the ground, both stubby wings thrown straight up, huge excited open smile.`,
    video:`The duck crouches then springs up into a big joyful jump with wings up, lands softly and immediately bounces up again, giddy with excitement. The background stays a perfectly flat solid azure blue, camera perfectly still, the duck stays centered. Energetic seamless loop. Absolutely no particles, no confetti, no sparkles, no text.` },
  { id:'v_spin', frame:`SCENE: the full-body duck doing a happy twirl, body turned partway around, both little wings out wide, one foot lifted, delighted expression.`,
    video:`The duck spins around in a happy little pirouette on one foot with wings out wide, then plants both feet and strikes a cute proud pose, beaming. The background stays a perfectly flat solid azure blue, camera perfectly still, the duck stays centered. Playful seamless loop. Absolutely no particles, no confetti, no sparkles, no text.` },
  { id:'v_cheer', frame:`SCENE: the full-body duck throwing both little wings straight up in triumph, head tilted back, beak open in a big victorious cheer, standing tall on its little feet.`,
    video:`The duck throws both wings up in triumph and cheers with its whole body, hopping happily on the spot and wiggling with pride, beak open in joy. The background stays a perfectly flat solid azure blue, camera perfectly still, the duck stays centered. Triumphant seamless loop. Absolutely no particles, no confetti, no sparkles, no text.` },
  { id:'v_wiggle', frame:`SCENE: the full-body duck doing a goofy funny dance, little butt and tail sticking out to one side mid-wiggle, stubby wings doing a silly flapping motion, cheeky playful grin.`,
    video:`The duck does a goofy comedic wiggle dance: shakes its little tail and butt side to side, stubby wings flapping in a silly rhythm, doing a cheeky boogie, having the time of its life. The background stays a perfectly flat solid azure blue, camera perfectly still, the duck stays centered. Funny seamless loop. Absolutely no particles, no confetti, no sparkles, no text.` },
];

async function genKeyframe(s){
  const refData=fs.readFileSync(REF).toString('base64');
  const body={contents:[{parts:[
    {inline_data:{mime_type:'image/png',data:refData}},
    {text:`Use the attached image ONLY as the design reference for the DUCK CHARACTER — copy its exact face, eyes, beak, cheeks, hair tuft, BRIGHT golden-yellow color and glossy 3D toy material. Generate a BRAND-NEW, fully ISOLATED render of just this ONE duck, alone, floating on a COMPLETELY EMPTY flat uniform bright-blue studio cyclorama (chroma-key blue, RGB 0,107,255). CRITICAL: the reference's BACKGROUND is NOT part of the character and must be 100% ABSENT from your output — NO grid lines, NO blue/orange split, NO white X or cross shapes, NO white rounded sticker border/outline, nothing but the single duck on flat blue. Square 1:1 keyframe. ${STYLE}\n${s.frame}`}
  ]}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'2K'}}};
  for(let a=1;a<=4;a++){try{
    const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`,{method:'POST',headers:{'x-goog-api-key':GKEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!res.ok)throw new Error('HTTP '+res.status+': '+(await res.text()).slice(0,200));
    const j=await res.json();
    for(const c of(j.candidates||[]))for(const p of((c.content&&c.content.parts)||[])){const inl=p.inline_data||p.inlineData;if(inl&&inl.data){const out=path.join(OUT,s.id+'-frame.png');fs.writeFileSync(out,Buffer.from(inl.data,'base64'));return out;}}
    throw new Error('no image');
  }catch(e){console.log('  '+s.id+' keyframe retry '+a+': '+e.message);if(a<4)await sleep(3000*a);else throw e;}}
}
async function falJson(url,opts={}){let last;for(let a=1;a<=4;a++){try{
  const res=await fetch(url,{...opts,headers:{Authorization:`Key ${FAL_KEY}`,'Content-Type':'application/json',...(opts.headers||{})}});
  const t=await res.text();if(!res.ok)throw new Error('HTTP '+res.status+': '+t.slice(0,200));return JSON.parse(t);
}catch(e){last=e;if(a<4)await sleep(3000*a);}}throw last;}
async function genVideo(s,frame){
  const dataUri=`data:image/png;base64,${fs.readFileSync(frame).toString('base64')}`;
  const submit=await falJson(`https://queue.fal.run/${MODEL}`,{method:'POST',body:JSON.stringify({prompt:s.video,image_url:dataUri,duration:DUR,resolution:PRO?'1080p':'720p',generate_audio:false})});
  const statusUrl=submit.status_url||`https://queue.fal.run/${MODEL}/requests/${submit.request_id}/status`;
  const respUrl=submit.response_url||`https://queue.fal.run/${MODEL}/requests/${submit.request_id}`;
  let st='';for(let i=0;i<300;i++){await sleep(5000);const r=await falJson(statusUrl);if(r.status!==st){st=r.status;}if(st==='COMPLETED')break;if(st==='FAILED'||st==='ERROR')throw new Error('gen failed');}
  if(st!=='COMPLETED')throw new Error('timeout');
  const result=await falJson(respUrl);const url=result.video&&result.video.url;if(!url)throw new Error('no video url');
  const out=path.join(OUT,s.id+'.mp4');const v=await fetch(url);fs.writeFileSync(out,Buffer.from(await v.arrayBuffer()));
  console.log('  DONE -> '+s.id+'.mp4 ('+Math.round(fs.statSync(out).size/1024)+'KB)');
}
function cleanBg(f){try{execFileSync('python',[path.join(__dirname,'clean-duck-bg.py'),f,f],{stdio:'inherit'});}catch(e){console.log('  clean-bg skipped: '+(e.message||e));}}
async function one(s){console.log('['+s.id+']');try{
  const fp=path.join(OUT,s.id+'-frame.png');
  const reuse=fs.existsSync(fp); const f=reuse?fp:await genKeyframe(s);
  console.log('  keyframe '+(reuse?'(reused) ':'ok ')+'-> '+path.basename(f));
  cleanBg(f); // force a perfectly flat #006BFF key bg (drop any stray X/grid the ref bled in)
  if(FRAMES_ONLY)return;await genVideo(s,f);
}catch(e){console.error('['+s.id+'] FAILED: '+(e.message||e));}}
async function pool(items,n,fn){const q=items.slice();const w=Array.from({length:Math.min(n,q.length)},async()=>{while(q.length)await fn(q.shift());});await Promise.all(w);}
(async()=>{
  let todo=only.length?SCENES.filter(s=>only.includes(s.id)):SCENES;
  if(!todo.length){console.log('no matching scenes');return;}
  console.log('Victory celebrations ('+(PRO?'PRO':'FAST')+', '+DUR+'s) -> '+OUT+'\n  '+todo.map(s=>s.id).join(', '));
  await pool(todo,3,one); // 3 concurrent FAL jobs
  const done=SCENES.filter(s=>fs.existsSync(path.join(OUT,s.id+'.mp4'))).length;
  console.log('ALL DONE. '+done+'/'+SCENES.length+' -> '+OUT);
})();
