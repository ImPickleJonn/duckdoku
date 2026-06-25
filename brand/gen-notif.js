// =============================================================
// gen-notif.js — cute duck banner art for Telegram push notifications.
// Image only (Gemini 3 Pro Image / Nano Banana Pro), wide 16:9, no text.
// Output PNGs land in ../assets/notif/<id>.png so the bot can attach them.
//   node brand/gen-notif.js            # all banners
//   node brand/gen-notif.js comeback   # just one
// Keys live in brand/.env (GOOGLE_API_KEY).
// =============================================================
const fs = require('fs');
const path = require('path');
function loadEnv(p) { try { if (!fs.existsSync(p)) return; for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; } } catch (e) {} }
loadEnv(path.join(__dirname, '.env'));
const GKEY = process.env.GOOGLE_API_KEY;
if (!GKEY) { console.error('NO GOOGLE_API_KEY (brand/.env)'); process.exit(1); }
const GMODEL = 'gemini-3-pro-image-preview';
const OUT_DIR = path.join(__dirname, '..', 'assets', 'notif');
fs.mkdirSync(OUT_DIR, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const only = process.argv.slice(2).filter(a => !a.startsWith('--'));

const STYLE = `STYLE (mandatory): one single adorable chunky 3D toy DUCKLING, cute low-poly/claymation toy render, smooth rounded shapes, bright buttery-yellow body, soft orange beak and little feet, two LARGE expressive cartoon eyes (big round white eyeball, big round black pupil, bright catchlight), rosy pink cheeks, tiny stubby wings. Bright saturated candy colors, soft clean studio lighting, gentle ambient occlusion, wholesome and charming. Warm honey-cream background (#ECD48A blending to #FBF6E9), the duckling clearly the hero with generous breathing room, soft round contact shadow. Cohesive with a cozy duck logic-puzzle game. NO text, NO words, NO letters, NO numbers, NO logos, NO watermarks, NO UI, NO other characters.`;

const BANNERS = [
  { id: 'comeback', prompt: `Wide 16:9 banner. ${STYLE}\nSCENE: the duckling sits cozily by a round window at soft golden dusk, gazing out hopefully with big gentle eyes, a warm little lamp glow beside it, calm and wistful and inviting, like it is waiting for a friend to return.` },
  { id: 'daily', prompt: `Wide 16:9 banner. ${STYLE}\nSCENE: the duckling cheerfully greets a soft pastel sunrise, wings up in a happy morning stretch, a few rounded glossy candy-colored puzzle tiles (coral, teal, lilac, butter-yellow) float gently around it, fresh bright new-day feeling.` },
  { id: 'nudge', prompt: `Wide 16:9 banner. ${STYLE}\nSCENE: the duckling peeks playfully out from behind one big rounded glossy colorful puzzle tile, only half of it visible, one eye giving a cute friendly wink, inviting you to a quick game.` },
  { id: 'newlevels', prompt: `Wide 16:9 banner. ${STYLE}\nSCENE: the proud duckling presents a small neat stack of bright new rounded colorful puzzle boards, excited and celebratory, wings raised, a couple of little gold sparkle stars popping around it.` },
];

async function genBanner(b) {
  const body = { contents: [{ parts: [{ text: b.prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9', imageSize: '2K' } } };
  for (let a = 1; a <= 4; a++) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GMODEL}:generateContent`,
        { method: 'POST', headers: { 'x-goog-api-key': GKEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + (await res.text()).slice(0, 300));
      const j = await res.json();
      for (const c of (j.candidates || [])) for (const p of ((c.content && c.content.parts) || [])) {
        const inl = p.inline_data || p.inlineData;
        if (inl && inl.data) { const out = path.join(OUT_DIR, b.id + '.png'); fs.writeFileSync(out, Buffer.from(inl.data, 'base64')); console.log('  banner -> ' + out + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB)'); return out; }
      }
      throw new Error('no image: ' + JSON.stringify(j).slice(0, 200));
    } catch (e) { console.log('  ' + b.id + ' retry ' + a + ': ' + e.message); if (a < 4) await sleep(3000 * a); else console.log('  ' + b.id + ' FAILED'); }
  }
}

(async () => {
  const list = only.length ? BANNERS.filter(b => only.includes(b.id)) : BANNERS;
  for (const b of list) { console.log('generating ' + b.id + '...'); await genBanner(b); }
  console.log('done ->', OUT_DIR);
})();
