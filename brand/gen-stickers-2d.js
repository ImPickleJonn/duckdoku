// =============================================================
// gen-stickers-2d.js — FLAT 2D sticker redo of the Duck Album, strictly
// consistent. Every scene is anchored to ONE master reference image so the
// duck design, line weight, colors, square white border, and SIZE stay
// identical across all 40. Style: flat 2D vector cartoon, colorful, NOT 3D.
//
//   node brand/gen-stickers-2d.js ref     -> (re)make the master reference from the hero duck
//   node brand/gen-stickers-2d.js         -> generate all 40 scenes (needs the ref)
//   node brand/gen-stickers-2d.js --force -> regenerate all
//   node brand/gen-stickers-2d.js pond3 oops7  -> only these ids
// Output: assets/stickers2/<id>.png  (staging; NOT the live assets/stickers)
// Master ref: brand/_ref2d.png
// =============================================================
const fs=require('fs'),path=require('path');
function loadEnv(p){try{if(!fs.existsSync(p))return;for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=/^([A-Z_]+)=(.*)$/.exec(l.trim());if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}}catch(e){}}
loadEnv(path.join(__dirname,'.env'));
const GKEY=process.env.GOOGLE_API_KEY; if(!GKEY){console.error('NO GOOGLE_API_KEY');process.exit(1);}
const GMODEL='gemini-3-pro-image-preview';
const OUT=path.join(__dirname,'..','assets','stickers2'); fs.mkdirSync(OUT,{recursive:true});
const REF=path.join(__dirname,'_ref2d.png');
const HERO=path.join(__dirname,'..','assets','ducks','hero-frame.png');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// ---- the immutable style contract, identical in every prompt ----
const DUCK=`THE DUCK (keep EXACTLY on-model every time): a plump round baby DUCKLING, bright buttery-yellow body, a soft orange duck bill, orange webbed feet, tiny stubby wing-arms, TWO big round eyes (white with a large black pupil and one small white highlight), two round pink blush cheeks, and a tiny tuft of 2 to 3 feathers on top of the head. Always the same proportions and the same colors.`;
const STYLE=`ART STYLE (must be IDENTICAL on every sticker): FLAT 2D CARTOON VECTOR illustration. Clean bold even dark outline, FLAT cel-shaded fills with at most one soft shadow tone, bright and colorful, cute kawaii mobile-sticker look. ABSOLUTELY NO 3D, no clay, no realistic lighting, no glossy plastic, no photoreal rendering, no soft 3D gradients on the body.`;
const FRAME=`FORMAT (must be IDENTICAL on every sticker): a ROUNDED SQUARE sticker tile with a THICK CLEAN WHITE BORDER STROKE around the square edge. Inside is a SIMPLE FLAT pastel background (you MAY pick a different gentle background COLOR that suits the scene, but keep it a plain flat fill with no busy scenery). The duck is FULL BODY, CENTERED, facing forward, at the SAME size and the SAME generous even margin every time (the duck fills about 60 percent of the tile, never cropped). Square 1:1. No text, no logos, no watermark.`;

const STICKERS=[
  {id:'pond1',rarity:'common',   scene:'splashing happily in a little puddle, a few water droplets around.'},
  {id:'pond2',rarity:'common',   scene:'a simple cute rubber-duck pose, sitting plainly and smiling.'},
  {id:'pond3',rarity:'common',   scene:'sleepy and yawning, wearing a tiny pastel nightcap.'},
  {id:'pond4',rarity:'common',   scene:'holding a tiny slice of bread, mid happy nibble.'},
  {id:'pond5',rarity:'rare',     scene:'wearing a little yellow raincoat and holding a small umbrella, a few raindrops.'},
  {id:'pond6',rarity:'rare',     scene:'floating inside a cute pink swim ring.'},
  {id:'pond7',rarity:'epic',     scene:'a gentle mama duck with two tiny baby ducklings beside her.'},
  {id:'pond8',rarity:'legendary',scene:'a shiny GOLDEN duckling on calm water with a few sparkles, regal.'},
  {id:'trip1',rarity:'common',   scene:'a tourist with heart-shaped sunglasses and a little camera around the neck.'},
  {id:'trip2',rarity:'common',   scene:'a sailor with a white sailor hat and a small life ring.'},
  {id:'trip3',rarity:'common',   scene:'a pilot with brown aviator goggles and a flowing scarf.'},
  {id:'trip4',rarity:'common',   scene:'a happy camper with a tiny backpack and a small tent behind it.'},
  {id:'trip5',rarity:'rare',     scene:'a scuba diver with a diving mask and snorkel, a couple of bubbles.'},
  {id:'trip6',rarity:'rare',     scene:'an astronaut in a cute white space helmet and suit, tiny stars.'},
  {id:'trip7',rarity:'epic',     scene:'riding in the basket of a tiny colorful hot-air balloon.'},
  {id:'trip8',rarity:'legendary',scene:'a GOLDEN rocket captain in a shiny suit blasting off with sparkles.'},
  {id:'dream1',rarity:'common',   scene:'a little wizard with a starry pointed hat and a tiny star wand.'},
  {id:'dream2',rarity:'common',   scene:'a brave knight with a small shiny helmet and a tiny shield.'},
  {id:'dream3',rarity:'common',   scene:'a pirate with an eyepatch and a red bandana.'},
  {id:'dream4',rarity:'common',   scene:'a chef with a tall white chef hat holding a tiny wooden spoon.'},
  {id:'dream5',rarity:'rare',     scene:'a fairy with translucent sparkly wings and a little glitter.'},
  {id:'dream6',rarity:'rare',     scene:'wearing a cozy green dragon onesie with tiny felt wings.'},
  {id:'dream7',rarity:'epic',     scene:'a unicorn duck with a pastel spiral horn and a soft rainbow mane.'},
  {id:'dream8',rarity:'legendary',scene:'a celestial STAR duckling glowing with starlight and a galaxy aura.'},
  {id:'snack1',rarity:'common',   scene:'hugging a giant slice of pepperoni pizza with a blissful wink.'},
  {id:'snack2',rarity:'common',   scene:'getting brain freeze from a giant ice cream cone, one eye squeezed shut, tiny snowflakes.'},
  {id:'snack3',rarity:'common',   scene:'happily tangled in spaghetti, one noodle on its head, a little sauce on the cheeks.'},
  {id:'snack4',rarity:'common',   scene:'wildly over-caffeinated, wide jittery eyes, clutching a steaming coffee cup.'},
  {id:'snack5',rarity:'rare',     scene:'lounging inside a giant pink sprinkled donut ring, tiny sunglasses, smug.'},
  {id:'snack6',rarity:'rare',     scene:'red-faced after a tiny chili pepper, watery eyes, a small steam puff from its head.'},
  {id:'snack7',rarity:'epic',     scene:'nervously balancing a wobbly giant cheeseburger on its head, one sweat drop.'},
  {id:'snack8',rarity:'legendary',scene:'proudly on top of a giant GOLDEN cupcake with a tiny gold crown, sparkles.'},
  {id:'oops1',rarity:'common',   scene:'mid-slip on a banana peel, little wings flailing, wide surprised eyes.'},
  {id:'oops2',rarity:'common',   scene:'dizzy with swirly spiral eyes, a little bump on its head, tiny stars circling.'},
  {id:'oops3',rarity:'common',   scene:'buried in bath bubbles, only beak and two wide eyes peeking out, a tiny rubber duck on top.'},
  {id:'oops4',rarity:'common',   scene:'completely tangled in a ball of pastel yarn, sheepish smile.'},
  {id:'oops5',rarity:'rare',     scene:'a cool surfer riding a slice of golden toast, tiny sunglasses, confident grin.'},
  {id:'oops6',rarity:'rare',     scene:'peeking out of a cardboard box like a periscope, only eyes showing, mischievous.'},
  {id:'oops7',rarity:'epic',     scene:'a tiny DJ wearing big headphones at little turntables, colorful disco lights.'},
  {id:'oops8',rarity:'legendary',scene:'a glowing superstar on a tiny spotlit stage holding a GOLDEN microphone, confetti.'},
];

// NBP returns JPEG bytes (even saved as .png), so detect the real mime from
// magic bytes when re-feeding an image as input, or the API rejects it.
function mimeOf(buf){if(buf[0]===0xFF&&buf[1]===0xD8)return 'image/jpeg';if(buf[0]===0x89&&buf[1]===0x50)return 'image/png';if(buf[0]===0x52&&buf[1]===0x49)return 'image/webp';return 'image/png';}
function imgPart(p){const buf=fs.readFileSync(p);return {inline_data:{mime_type:mimeOf(buf),data:buf.toString('base64')}};}
async function call(parts){
  const body={contents:[{parts}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'1K'}}};
  const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`,{method:'POST',headers:{'x-goog-api-key':GKEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok)throw new Error('HTTP '+res.status+': '+(await res.text()).slice(0,180));
  const j=await res.json();
  for(const c of(j.candidates||[]))for(const p of((c.content&&c.content.parts)||[])){const inl=p.inline_data||p.inlineData;if(inl&&inl.data)return Buffer.from(inl.data,'base64');}
  throw new Error('no image in response');
}

async function makeRef(){
  const prompt=`Redraw the duckling in the attached image as a FLAT 2D CARTOON STICKER (this is a clean character reference sheet). ${DUCK}\n${STYLE}\nPose: standing in a simple friendly neutral pose, facing forward, one wing gently waving.\n${FRAME}`;
  for(let a=1;a<=4;a++){try{
    const buf=await call([{text:prompt},imgPart(HERO)]);
    fs.writeFileSync(REF,buf);console.log('  master reference -> '+REF);return;
  }catch(e){console.log('  ref retry '+a+': '+e.message);if(a<4)await sleep(3500*a);else{console.error('  REF FAILED');process.exit(1);}}}
}

async function gen(s,refPart){
  const prompt=`Create a NEW collectible sticker that is PERFECTLY CONSISTENT with the attached reference image. Copy it EXACTLY for: the duckling design and colors, the flat 2D vector art style, the outline weight, the ROUNDED SQUARE white border, and crucially the SAME duck SIZE, centering and margin. The ONLY things that may change are what the duck is DOING and the flat background COLOR (pick a soft pastel that fits the scene). Do NOT change the art style, the duck, the border, or the framing.\n${DUCK}\n${STYLE}\n${FRAME}\nThe duck is now: ${s.scene}`;
  for(let a=1;a<=4;a++){try{
    const buf=await call([{text:prompt},refPart]);
    fs.writeFileSync(path.join(OUT,s.id+'.png'),buf);console.log('  ok  '+s.id);return;
  }catch(e){console.log('  ..  '+s.id+' retry '+a+': '+e.message);if(a<4)await sleep(3500*a);else console.error('  XX  '+s.id+' FAILED');}}
}
async function pool(items,n,fn){const q=items.slice();const w=Array.from({length:Math.min(n,q.length)},async()=>{while(q.length)await fn(q.shift());});await Promise.all(w);}

(async()=>{
  const args=process.argv.slice(2);
  if(args[0]==='ref'){console.log('Making master 2D reference from the hero duck...');await makeRef();console.log('DONE ref. Review brand/_ref2d.png, then run without args.');return;}
  if(!fs.existsSync(REF)){console.log('No master ref yet. Run: node brand/gen-stickers-2d.js ref');process.exit(1);}
  const refPart=imgPart(REF);
  const force=args.includes('--force');
  const only=args.filter(a=>!a.startsWith('--'));
  let list=STICKERS;
  if(only.length)list=STICKERS.filter(s=>only.includes(s.id));
  else if(!force)list=STICKERS.filter(s=>!fs.existsSync(path.join(OUT,s.id+'.png')));
  if(!list.length){console.log('Nothing to generate (use --force to redo).');return;}
  console.log('Generating '+list.length+' flat-2D stickers (anchored to master ref) -> '+OUT);
  await pool(list,4,s=>gen(s,refPart));
  const done=STICKERS.filter(s=>fs.existsSync(path.join(OUT,s.id+'.png'))).length;
  console.log('DONE. '+done+'/'+STICKERS.length+' present in '+OUT);
})();
