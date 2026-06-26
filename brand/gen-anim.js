// =============================================================
// gen-anim.js <set> [--pro] [id...]   set = defeat | victory2 | faces
// Same anchored pipeline as gen-victory.js: master duck (assets/ducks/duck-master.png)
// -> Gemini 3 Pro Image keyframe -> clean-duck-bg.py (flat #006BFF) -> FAL Seedance.
//   node brand/gen-anim.js defeat
//   node brand/gen-anim.js victory2 --frames
//   node brand/gen-anim.js faces f_sad
// Output: Desktop/duckdoku-review/<set>/.  Keys: brand/.env.
// =============================================================
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
function loadEnv(p){try{if(!fs.existsSync(p))return;for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=/^([A-Z_]+)=(.*)$/.exec(l.trim());if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}}catch(e){}}
loadEnv(path.join(__dirname,'.env'));
const FAL_KEY=process.env.FAL_KEY, GKEY=process.env.GOOGLE_API_KEY;
if(!FAL_KEY||!GKEY){console.error('NO FAL_KEY / GOOGLE_API_KEY (brand/.env)');process.exit(1);}
const args=process.argv.slice(2);
const SET=args[0];
const PRO=args.includes('--pro');
const FRAMES_ONLY=args.includes('--frames');
const only=args.slice(1).filter(a=>!a.startsWith('--'));
const MODEL=PRO?'bytedance/seedance-2.0/image-to-video':'bytedance/seedance-2.0/fast/image-to-video';
const GMODEL='gemini-3-pro-image-preview';
const REF=path.join(__dirname,'..','assets','ducks','duck-master.png');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const KEYBG=`BACKGROUND: a perfectly FLAT SOLID bright azure blue, exactly RGB(0,107,255) / #006BFF, totally uniform — NO gradient, NO grid, NO pattern, NO white outline, NO border, NO vignette, NO background shadow. ABSOLUTELY NO particles, NO confetti, NO sparkles, NO glitter, NO stars, NO motion lines, NO text, NO words, NO logos.`;
const DUCK=`the SAME duck character as the master reference image: BRIGHT SATURATED golden-yellow body, chunky rounded head, two LARGE dark expressive eyes (glossy dark brown-black, two bright white catchlights), coral rosy-pink oval cheeks, bright orange duck beak with two tiny nostril dots, small swept 3-feather yellow hair tuft, glossy soft-3D claymation toy look. Copy ONLY the duck from the reference — NOT its grid/orange/X-marks/white border.`;
const BODY=`Render ${DUCK} as a FULL BODY duck (chunky round body, small stubby wings, little orange webbed feet), the clear hero CENTERED with the WHOLE body comfortably in frame. ${KEYBG}`;
const HEAD=`Render ${DUCK} as a HEAD-AND-SHOULDERS close-up exactly like a game avatar: the big round duck HEAD fills most of the square frame, centered, chin near the bottom edge, top of head near the top, looking straight at the camera. ${KEYBG}`;

const SETS={
  // 5 funny DEFEAT fails (full body). Comedic, not grim. For the lose screen.
  defeat:{ dur:'5', scenes:[
    { id:'d_banana', frame:`SCENE: the duck mid-slip on a yellow banana peel under one foot, both feet shooting up, wings flailing, wide surprised eyes and open beak, comically falling backward.`,
      video:`The duck steps on the banana peel, its feet fly up and it slips and tumbles backward with a comic flail of wings, surprised goofy expression, then sits up dazed. The background stays a perfectly flat solid blue, camera still, duck centered. Funny loop. No particles, no text.` },
    { id:'d_trip', frame:`SCENE: the duck tripping over its own feet, pitching forward, wings out to catch itself, eyes wide, beak open in an "oops".`,
      video:`The duck trips over its own feet and stumbles forward in a clumsy comic tumble, wings windmilling, then flops and pops back up wobbly. The background stays a perfectly flat solid blue, camera still, duck centered. Funny loop. No particles, no text.` },
    { id:'d_dizzy', frame:`SCENE: the duck wobbling dizzily, swirly dazed eyes, little stars-free wobble, tilting to one side about to topple.`,
      video:`The duck wobbles and sways dizzily with dazed swirly eyes, staggers in a circle, then plops down sitting with a dazed expression. The background stays a perfectly flat solid blue, camera still, duck centered. Funny loop. No particles, no text.` },
    { id:'d_deflate', frame:`SCENE: the duck sagging and slumping sadly, shoulders down, droopy teary eyes, little wings hanging, a big disappointed sigh.`,
      video:`The duck lets out a big disappointed sigh and slowly deflates and slumps down sadly, shoulders sagging, droopy eyes, a tiny sniffle. The background stays a perfectly flat solid blue, camera still, duck centered. Sad-but-cute loop. No particles, no text.` },
    { id:'d_facepalm', frame:`SCENE: the duck doing a facepalm, one little wing slapped over its eyes/beak, head tilted down, comically defeated.`,
      video:`The duck slaps a wing over its face in a facepalm, shakes its head slowly in comic disbelief, then peeks out with a sheepish look. The background stays a perfectly flat solid blue, camera still, duck centered. Funny loop. No particles, no text.` },
  ]},
  // 5 MORE victory, funnier, with HELD/WORN props (so the bg cleaner keeps them).
  victory2:{ dur:'5', scenes:[
    { id:'v2_trophy', frame:`SCENE: the full-body duck proudly holding up a big shiny GOLD TROPHY cup in both wings (the trophy touches its wings/body), beaming, standing tall.`,
      video:`The duck proudly hoists a big gold trophy overhead in both wings, gives it a happy little shake and a triumphant wiggle, beaming. The background stays a perfectly flat solid blue, camera still, duck centered. Joyful loop. No particles, no text.` },
    { id:'v2_crown', frame:`SCENE: the full-body duck wearing a tiny shiny GOLD CROWN on its head, chest puffed out in a proud royal pose, wings on hips.`,
      video:`The duck struts proudly wearing its little gold crown, chest puffed, doing a regal little catwalk strut and a satisfied nod. The background stays a perfectly flat solid blue, camera still, duck centered. Proud funny loop. No particles, no text.` },
    { id:'v2_medal', frame:`SCENE: the full-body duck wearing a big GOLD MEDAL on a ribbon around its neck (medal resting on its chest), pointing proudly at it with one wing, huge grin.`,
      video:`The duck shows off the big gold medal on its chest, polishing it with a wing and pointing at it proudly with a huge grin, bouncing happily. The background stays a perfectly flat solid blue, camera still, duck centered. Proud loop. No particles, no text.` },
    { id:'v2_partyhat', frame:`SCENE: the full-body duck wearing a striped PARTY HAT on its head and holding a little party noisemaker horn to its beak, mid celebration.`,
      video:`The duck in its party hat blows the little party horn (cheeks puffing), bounces and wiggles in celebration, the horn unrolling. The background stays a perfectly flat solid blue, camera still, duck centered. Party loop. No particles, no text.` },
    { id:'v2_breakdance', frame:`SCENE: the full-body duck doing a silly breakdance move, one wing planted on the floor, body tilted, little legs kicked up mid spin, goofy cool expression.`,
      video:`The duck does a goofy breakdance: spins on the floor on one wing, kicks its little legs, freezes in a silly cool pose, completely over the top and funny. The background stays a perfectly flat solid blue, camera still, duck centered. Funny loop. No particles, no text.` },
  ]},
  // 4 recreated FACE expressions (head close-up) to match the master duck. Subtle game-avatar loops.
  faces:{ dur:'4', head:true, scenes:[
    { id:'f_idle', frame:`SCENE: calm friendly neutral expression, both big round eyes open looking at the camera, soft closed-beak smile.`,
      video:`The duck's head bobs very gently and it gives a slow natural blink, calm and friendly, idle. The background stays a perfectly flat solid blue, camera perfectly still, head centered and filling the frame. Gentle subtle seamless loop. No particles, no text.` },
    { id:'f_happy', frame:`SCENE: very happy expression, both eyes squeezed into joyful upward curved closed-eye smiles (^ ^), beak open in a big delighted grin.`,
      video:`The duck beams with a big joyful grin, eyes in happy closed curves, head doing a small happy bounce. The background stays a perfectly flat solid blue, camera perfectly still, head centered and filling the frame. Cheerful subtle seamless loop. No particles, no text.` },
    { id:'f_oops', frame:`SCENE: a surprised worried "oops" expression, both eyes wide, eyebrows up, beak open in a small worried gasp, slight head tilt.`,
      video:`The duck makes a worried surprised "oops" face, eyes wide, gives a tiny nervous shake of the head. The background stays a perfectly flat solid blue, camera perfectly still, head centered and filling the frame. Subtle seamless loop. No particles, no text.` },
    { id:'f_sad', frame:`SCENE: a sad crying expression, big watery teary eyes, downturned worried brows, beak in a small frown, one shiny tear welling at the corner of an eye.`,
      video:`The duck looks sad and teary, a single shiny tear rolls down and it gives a little sniffle, droopy. The background stays a perfectly flat solid blue, camera perfectly still, head centered and filling the frame. Subtle sad seamless loop. No particles, no text.` },
  ]},
};

const FACEREF=path.join(__dirname,'..','assets','ducks','face-idle-frame.png'); // clean head framing on plain blue, no grid
const MASTERFACE=path.join(__dirname,'..','assets','ducks','duck-master-face.png'); // master's bright face, cropped grid-free (color ref)
function styleFor(set){return SETS[set].head?HEAD:BODY;}
function b64(p){return fs.readFileSync(p).toString('base64');}
async function genKeyframe(set,s,OUT){
  let parts;
  if(SETS[set].head){ // FACES: anchor to our clean head frame (correct framing + isolation, no grid). Brightness via post-pop.
    parts=[
      {inline_data:{mime_type:'image/png',data:b64(FACEREF)}},
      {text:`The attached image is our duck game-avatar head. Generate a NEW head close-up of THIS SAME duck with the SAME framing and zoom (the round duck head centered, filling most of the square frame with a little blue margin around it, looking straight at the camera) and the SAME isolation (a completely empty PLAIN flat blue background, NO grid, NO border). Match the duck's exact design (eyes, beak, cheeks, hair tuft) but render it crisp, glossy and vivid. Do NOT zoom in more than the reference. ${HEAD}\n${s.frame}`}
    ];
  } else { // BODY sets: master ref only
    parts=[
      {inline_data:{mime_type:'image/png',data:b64(REF)}},
      {text:`Use the attached image ONLY as the design reference for the DUCK CHARACTER — copy its exact face, eyes, beak, cheeks, hair tuft, BRIGHT golden-yellow color and glossy 3D toy material. Generate a BRAND-NEW, fully ISOLATED render of this ONE duck on a COMPLETELY EMPTY flat uniform bright-blue studio background (chroma-key blue, RGB 0,107,255). CRITICAL: the reference's background is NOT part of the character — NO grid, NO blue/orange split, NO white X shapes, NO white sticker border. Square 1:1 keyframe. ${styleFor(set)}\n${s.frame}`}
    ];
  }
  const body={contents:[{parts}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'2K'}}};
  for(let a=1;a<=4;a++){try{
    const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`,{method:'POST',headers:{'x-goog-api-key':GKEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!res.ok)throw new Error('HTTP '+res.status+': '+(await res.text()).slice(0,160));
    const j=await res.json();
    for(const c of(j.candidates||[]))for(const p of((c.content&&c.content.parts)||[])){const inl=p.inline_data||p.inlineData;if(inl&&inl.data){const out=path.join(OUT,s.id+'-frame.png');fs.writeFileSync(out,Buffer.from(inl.data,'base64'));return out;}}
    throw new Error('no image');
  }catch(e){console.log('  '+s.id+' keyframe retry '+a+': '+e.message);if(a<4)await sleep(3000*a);else throw e;}}
}
async function falJson(url,opts={}){let last;for(let a=1;a<=4;a++){try{
  const res=await fetch(url,{...opts,headers:{Authorization:`Key ${FAL_KEY}`,'Content-Type':'application/json',...(opts.headers||{})}});
  const t=await res.text();if(!res.ok)throw new Error('HTTP '+res.status+': '+t.slice(0,160));return JSON.parse(t);
}catch(e){last=e;if(a<4)await sleep(3000*a);}}throw last;}
async function genVideo(s,frame,OUT,dur){
  const dataUri=`data:image/png;base64,${fs.readFileSync(frame).toString('base64')}`;
  const submit=await falJson(`https://queue.fal.run/${MODEL}`,{method:'POST',body:JSON.stringify({prompt:s.video,image_url:dataUri,duration:dur,resolution:PRO?'1080p':'720p',generate_audio:false})});
  const statusUrl=submit.status_url||`https://queue.fal.run/${MODEL}/requests/${submit.request_id}/status`;
  const respUrl=submit.response_url||`https://queue.fal.run/${MODEL}/requests/${submit.request_id}`;
  let st='';for(let i=0;i<300;i++){await sleep(5000);const r=await falJson(statusUrl);if(r.status!==st)st=r.status;if(st==='COMPLETED')break;if(st==='FAILED'||st==='ERROR')throw new Error('gen failed');}
  if(st!=='COMPLETED')throw new Error('timeout');
  const result=await falJson(respUrl);const url=result.video&&result.video.url;if(!url)throw new Error('no video url');
  const out=path.join(OUT,s.id+'.mp4');const v=await fetch(url);fs.writeFileSync(out,Buffer.from(await v.arrayBuffer()));
  console.log('  DONE -> '+s.id+'.mp4 ('+Math.round(fs.statSync(out).size/1024)+'KB)');
}
function cleanBg(f,strict){try{const a=[path.join(__dirname,'clean-duck-bg.py'),f,f];if(strict){a.push('strict','pop');}execFileSync('python',a,{stdio:'inherit'});}catch(e){console.log('  clean-bg skipped: '+(e.message||e));}}
async function one(set,s,OUT,dur){console.log('['+set+'/'+s.id+']');try{
  const fp=path.join(OUT,s.id+'-frame.png');
  const reuse=fs.existsSync(fp); const f=reuse?fp:await genKeyframe(set,s,OUT);
  console.log('  keyframe '+(reuse?'(reused) ':'ok ')+'-> '+path.basename(f));
  cleanBg(f,!!SETS[set].head); // faces (head) = strict clean (no props); body sets keep props
  if(FRAMES_ONLY)return;await genVideo(s,f,OUT,dur);
}catch(e){console.error('['+set+'/'+s.id+'] FAILED: '+(e.message||e));}}
async function pool(items,n,fn){const q=items.slice();const w=Array.from({length:Math.min(n,q.length)},async()=>{while(q.length)await fn(q.shift());});await Promise.all(w);}
(async()=>{
  if(!SETS[SET]){console.error('usage: gen-anim.js <defeat|victory2|faces> [--pro] [--frames] [id...]');process.exit(1);}
  const cfg=SETS[SET], OUT=path.join(os.homedir(),'Desktop','duckdoku-review',SET); fs.mkdirSync(OUT,{recursive:true});
  let todo=only.length?cfg.scenes.filter(s=>only.includes(s.id)):cfg.scenes;
  if(!todo.length){console.log('no matching scenes');return;}
  console.log(SET+' ('+(PRO?'PRO':'FAST')+', '+cfg.dur+'s'+(FRAMES_ONLY?', frames only':'')+') -> '+OUT+'\n  '+todo.map(s=>s.id).join(', '));
  await pool(todo,3,(s)=>one(SET,s,OUT,cfg.dur));
  console.log('ALL DONE ('+SET+') -> '+OUT);
})();
