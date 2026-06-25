// Generates Google Play store graphics for Duckdoku via Nano Banana (Gemini
// 3 Pro Image). Outputs raw PNGs to assets/store/; resize to exact Play sizes
// with ffmpeg afterwards (icon 512x512, feature 1024x500).
//   node brand/gen-store-assets.js
const fs=require('fs'),path=require('path');
function loadEnv(p){try{if(!fs.existsSync(p))return;for(const l of fs.readFileSync(p,'utf8').split(/\r?\n/)){const m=/^([A-Z_]+)=(.*)$/.exec(l.trim());if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}}catch(e){}}
loadEnv(path.join(__dirname,'.env'));
const GKEY=process.env.GOOGLE_API_KEY; if(!GKEY){console.error('NO GOOGLE_API_KEY');process.exit(1);}
const GMODEL='gemini-3-pro-image-preview';
const OUT=path.join(__dirname,'..','assets','store'); fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SCENES=[
  { id:'icon', ar:'1:1', prompt:`A clean premium mobile APP ICON, square 1:1, full-bleed (the art fills the whole square). ONE adorable chunky 3D toy duckling HEAD: buttery yellow, soft orange beak, two LARGE round white eyes with big black pupils and bright catchlights, rosy pink cheeks, a tiny tuft on top. The head is centered and large. Background is a soft warm gradient from cream at the top to gentle orange at the bottom, with a subtle soft glow behind the duck. Glossy, cute, app store quality. NO text, NO letters, NO logos.` },
  { id:'feature', ar:'16:9', prompt:`A horizontal mobile game store FEATURE BANNER, wide 16:9, full-bleed. On the LEFT, a cute chunky 3D toy duckling (buttery yellow, big white eyes with black pupils, orange beak, rosy cheeks) smiling happily. Next to it, a small friendly 3D puzzle grid of rounded candy-colored tiles (coral, purple, teal, blue) with a couple of little white X marks, suggesting a logic puzzle. Soft cream background with a few gentle confetti dots and sparkles. Warm, cheerful, premium. Keep the composition clean with calm empty space toward the right. NO text, NO letters, NO logos.` },
];
async function gen(s){
  const body={contents:[{parts:[{text:s.prompt}]}],generationConfig:{responseModalities:['IMAGE'],imageConfig:{aspectRatio:s.ar,imageSize:'2K'}}};
  for(let a=1;a<=4;a++){try{
    const res=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`,{method:'POST',headers:{'x-goog-api-key':GKEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!res.ok)throw new Error('HTTP '+res.status+': '+(await res.text()).slice(0,200));
    const j=await res.json();
    for(const c of(j.candidates||[]))for(const p of((c.content&&c.content.parts)||[])){const inl=p.inline_data||p.inlineData;if(inl&&inl.data){const o=path.join(OUT,s.id+'-raw.png');fs.writeFileSync(o,Buffer.from(inl.data,'base64'));console.log('  '+s.id+' -> '+o);return;}}
    throw new Error('no image');
  }catch(e){console.log('  '+s.id+' retry '+a+': '+e.message);if(a<4)await sleep(3000*a);else console.error('  '+s.id+' FAILED');}}
}
(async()=>{ console.log('Generating Play store art...'); await Promise.all(SCENES.map(gen)); console.log('DONE -> '+OUT); })();
