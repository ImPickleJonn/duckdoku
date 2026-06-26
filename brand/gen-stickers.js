// =============================================================
// gen-stickers.js — collectible DUCK STICKERS for the Duck Album.
// 3 evergreen sets x 8 stickers = 24 cute claymation duck collectibles,
// each a full-body duckling in a themed costume on a soft pastel card.
//   node brand/gen-stickers.js            (all missing)
//   node brand/gen-stickers.js --force    (regenerate everything)
//   node brand/gen-stickers.js pond3 trip7 (only these ids)
// Output: assets/stickers/<id>.png
// Catalog (ids + rarity + names) MUST stay in sync with STICKERS in game.html.
// =============================================================
const fs = require('fs'), path = require('path');
function loadEnv(p){try{if(!fs.existsSync(p))return;for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=/^([A-Z_]+)=(.*)$/.exec(l.trim());if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}}catch(e){}}
loadEnv(path.join(__dirname, '.env'));
const GKEY = process.env.GOOGLE_API_KEY; if (!GKEY) { console.error('NO GOOGLE_API_KEY'); process.exit(1); }
const GMODEL = 'gemini-3-pro-image-preview';
const OUT = path.join(__dirname, '..', 'assets', 'stickers'); fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Shared look: matches the cute claymation duck-hero style. Full BODY (not a
// head crop), centered, generous margin, sitting on a soft pastel collectible
// card with a subtle white die-cut sticker border.
const STYLE = `RENDER STYLE: soft matte CLAYMATION / cute-Pixar 3D toy. Smooth rounded clay-like surfaces, gentle soft studio lighting, wholesome, cuddly, premium mobile-game collectible.`;
const BASE = `ONE adorable chubby cartoon DUCKLING, FULL BODY, buttery-yellow body, soft orange beak and feet, two LARGE round expressive eyes (white eyeball, big black pupil, bright catchlight), rosy pink cheeks. Friendly and joyful.`;
const FRAMING = `FRAMING (critical): the WHOLE duckling and its props are FULLY visible and CENTERED with generous empty margin on every side; nothing is cropped at any edge. Subject fills ~64 percent of the frame. Square 1:1.`;
const CARD = `BACKGROUND: a soft pastel RADIAL gradient card (gentle, low-saturation), with a clean subtle WHITE rounded die-cut sticker border framing the scene. No text, no logos, no watermark, no extra characters.`;

// rarity only affects the in-app frame; we still hint richness for higher tiers.
const RARITY_HINT = { common: '', rare: '', epic: ' A few small sparkles around it.', legendary: ' Radiant golden glow and shimmering star sparkles, clearly the rarest prize.' };

const STICKERS = [
  // ---- Pond Pals (cozy everyday) ----
  { id:'pond1', rarity:'common',    art:'splashing happily in a little puddle of water, droplets flying.' },
  { id:'pond2', rarity:'common',    art:'a classic glossy rubber-duck pose, sitting plainly and cute.' },
  { id:'pond3', rarity:'common',    art:'sleepy and yawning, a tiny pastel sleep cap on its head.' },
  { id:'pond4', rarity:'common',    art:'holding a tiny slice of bread, mid happy nibble.' },
  { id:'pond5', rarity:'rare',      art:'wearing a tiny yellow raincoat and holding a small umbrella, gentle rain.' },
  { id:'pond6', rarity:'rare',      art:'floating inside a cute pink swim ring, relaxed.' },
  { id:'pond7', rarity:'epic',      art:'a gentle mama duck with two tiny baby ducklings tucked beside her.' },
  { id:'pond8', rarity:'legendary', art:'a shimmering solid-GOLD duckling on a calm reflective pond, regal.' },
  // ---- Jetset Ducks (travel + occupations) ----
  { id:'trip1', rarity:'common',    art:'a tourist with heart sunglasses and a little camera around its neck.' },
  { id:'trip2', rarity:'common',    art:'a sailor with a white sailor hat and a small life ring.' },
  { id:'trip3', rarity:'common',    art:'a pilot with brown aviator goggles and a flowing scarf.' },
  { id:'trip4', rarity:'common',    art:'a happy camper with a tiny backpack and a small tent behind it.' },
  { id:'trip5', rarity:'rare',      art:'a scuba diver with a diving mask and snorkel, a bubble or two.' },
  { id:'trip6', rarity:'rare',      art:'an astronaut in a cute white space helmet and suit, tiny stars.' },
  { id:'trip7', rarity:'epic',      art:'riding in the basket of a tiny colorful hot-air balloon.' },
  { id:'trip8', rarity:'legendary', art:'a golden rocket captain in a shiny suit blasting off, radiant.' },
  // ---- Duck Dreams (fantasy + magical) ----
  { id:'dream1', rarity:'common',    art:'a little wizard with a starry pointed hat and a tiny star wand.' },
  { id:'dream2', rarity:'common',    art:'a brave knight with a small shiny helmet and a tiny shield.' },
  { id:'dream3', rarity:'common',    art:'a pirate with an eyepatch and a red bandana.' },
  { id:'dream4', rarity:'common',    art:'a chef with a tall white chef hat holding a tiny wooden spoon.' },
  { id:'dream5', rarity:'rare',      art:'a fairy with translucent sparkly wings and a sprinkle of glitter.' },
  { id:'dream6', rarity:'rare',      art:'wearing a cozy green dragon onesie with tiny felt wings.' },
  { id:'dream7', rarity:'epic',      art:'a unicorn duck with a pastel spiral horn and a soft rainbow mane.' },
  { id:'dream8', rarity:'legendary', art:'a celestial STAR duckling glowing with starlight and a galaxy aura, the rarest of all.' },
];

async function gen(s){
  const prompt = `A single clean collectible sticker, square 1:1, full-bleed. ${STYLE}\n${BASE} The duckling is ${s.art}${RARITY_HINT[s.rarity]||''}\n${FRAMING}\n${CARD}`;
  const body = { contents:[{parts:[{text:prompt}]}], generationConfig:{ responseModalities:['IMAGE'], imageConfig:{ aspectRatio:'1:1', imageSize:'1K' } } };
  for (let a=1; a<=4; a++) { try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`, { method:'POST', headers:{'x-goog-api-key':GKEY,'Content-Type':'application/json'}, body:JSON.stringify(body) });
    if (!res.ok) throw new Error('HTTP '+res.status+': '+(await res.text()).slice(0,160));
    const j = await res.json();
    for (const c of (j.candidates||[])) for (const p of ((c.content&&c.content.parts)||[])) { const inl=p.inline_data||p.inlineData; if (inl&&inl.data) { const o=path.join(OUT,s.id+'.png'); fs.writeFileSync(o,Buffer.from(inl.data,'base64')); console.log('  ok  '+s.id); return o; } }
    throw new Error('no image in response');
  } catch(e){ console.log('  ..  '+s.id+' retry '+a+': '+e.message); if(a<4) await sleep(3500*a); else console.error('  XX  '+s.id+' FAILED'); } }
}

// limited-concurrency pool so we do not hammer the API
async function pool(items, n, fn){ const q=items.slice(); const work=Array.from({length:Math.min(n,q.length)},async()=>{ while(q.length){ await fn(q.shift()); } }); await Promise.all(work); }

(async () => {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const only = args.filter(a => !a.startsWith('--'));
  let list = STICKERS;
  if (only.length) list = STICKERS.filter(s => only.includes(s.id));
  else if (!force) list = STICKERS.filter(s => !fs.existsSync(path.join(OUT, s.id+'.png')));
  if (!list.length) { console.log('Nothing to generate (all present; use --force to redo).'); return; }
  console.log('Generating '+list.length+' duck stickers -> '+OUT);
  await pool(list, 4, gen);
  const done = STICKERS.filter(s => fs.existsSync(path.join(OUT, s.id+'.png'))).length;
  console.log('DONE. '+done+'/'+STICKERS.length+' stickers present.');
})();
