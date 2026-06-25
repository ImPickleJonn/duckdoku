// =============================================================
// gen-duck-variations.js — 4 DIFFERENT base duck-head designs in
// distinct ART STYLES, fully centered (nothing cropped), on a flat
// chroma-blue background. For Pickle to pick a favorite; then we
// build the full expression set in the chosen style.
//   node brand/gen-duck-variations.js
// Output: assets/ducks/variations/duck-style-N.png
// =============================================================
const fs=require('fs'),path=require('path');
function loadEnv(p){try{if(!fs.existsSync(p))return;for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=/^([A-Z_]+)=(.*)$/.exec(l.trim());if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}}catch(e){}}
loadEnv(path.join(__dirname,'.env'));
const GKEY=process.env.GOOGLE_API_KEY; if(!GKEY){console.error('NO GOOGLE_API_KEY');process.exit(1);}
const GMODEL='gemini-3-pro-image-preview';
const OUT=path.join(__dirname,'..','assets','ducks','variations'); fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Shared rules: cute duck, BIG expressive eyes, and CRITICAL framing so the
// head is never cropped (the previous set was cut off at the bottom).
const SUBJECT=`ONE adorable cute DUCKLING HEAD: buttery-yellow head, soft orange duck beak, two LARGE expressive eyes (each a big round WHITE eyeball with a big round BLACK pupil and a bright catchlight), rosy pink cheeks, a tiny tuft of feathers on top. Calm, content, gently smiling (a neutral idle pose).`;
const FRAMING=`FRAMING (critical): the duckling's WHOLE head is FULLY visible and perfectly CENTERED, with generous EMPTY margin on every side. The head fills roughly 62 percent of the frame and NEVER touches or is cropped at ANY edge, especially the BOTTOM (leave clear empty space below the chin). Do not zoom in too far. Square 1:1 composition.`;
const BG=`BACKGROUND: a single FLAT perfectly even VIVID CHROMA-KEY BLUE (#1666FF), no gradient, no scenery, no props, no shadow cast on the background. NO text, NO logos, NO watermarks.`;

const STYLES=[
  { id:'duck-style-1', style:`RENDER STYLE: soft matte CLAYMATION / cute-Pixar 3D toy. Smooth rounded clay-like surfaces, gentle soft studio lighting, wholesome and cuddly.` },
  { id:'duck-style-2', style:`RENDER STYLE: glossy VINYL collectible bath-toy figurine. Shiny smooth plastic with bright crisp specular highlights, designer-toy look, slightly waxy sheen.` },
  { id:'duck-style-3', style:`RENDER STYLE: soft PLUSH FELT handmade toy. Fuzzy fabric / knitted-felt texture, visible little stitches and seams, cozy hand-sewn craft look.` },
  { id:'duck-style-4', style:`RENDER STYLE: stylized LOW-POLY 3D. Clean geometric facets and triangles, crisp flat-shaded faceted surfaces, modern minimalist game-art look.` },
];

async function gen(s){
  const prompt=`A single clean character keyframe, square 1:1, full-bleed. ${s.style}\n${SUBJECT}\n${FRAMING}\n${BG}`;
  const body={contents:[{parts:[{text:prompt}]}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:'1:1',imageSize:'2K'}}};
  for(let a=1;a<=4;a++){try{
    const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`,{method:'POST',headers:{'x-goog-api-key':GKEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!res.ok)throw new Error('HTTP '+res.status+': '+(await res.text()).slice(0,200));
    const j=await res.json();
    for(const c of(j.candidates||[]))for(const p of((c.content&&c.content.parts)||[])){const inl=p.inline_data||p.inlineData;if(inl&&inl.data){const o=path.join(OUT,s.id+'.png');fs.writeFileSync(o,Buffer.from(inl.data,'base64'));console.log('  '+s.id+' -> '+o);return o;}}
    throw new Error('no image');
  }catch(e){console.log('  '+s.id+' retry '+a+': '+e.message);if(a<4)await sleep(3000*a);else console.error('  '+s.id+' FAILED');}}
}
(async()=>{
  console.log('Generating 4 duck-head style variations (centered, blue bg)...');
  await Promise.all(STYLES.map(gen));
  console.log('ALL DONE -> '+OUT);
})();
