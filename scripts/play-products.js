// play-products.js - create + activate the Duckdoku in-app products on Google Play
// via the Play Developer API (mirrors Dumpling Drop / RTW scripts/play-api.js).
// Products are CONSUMABLE one-time products (legacyCompatible so cordova-plugin-
// purchase's classic Billing query sees them). Prices auto-converted to all
// Play regions from a USD anchor.
//   node scripts/play-products.js            # create + activate all
//   node scripts/play-products.js --only gold_small
//   node scripts/play-products.js --dry      # print the plan only
// Keep this list in sync with server.js SKUS (non-admin ones).
const { google } = require('googleapis');
const KEY = process.env.PLAY_SA || 'C:/Users/jonnw/Desktop/dd-secrets/play-service-account.json';
const PKG = 'com.whaleplayed.duckdoku';
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const ONLY = (args.indexOf('--only') >= 0) ? args[args.indexOf('--only') + 1] : null;

// id MUST match server.js SKUS ids; usd is the Play base price (clean point).
const PRODUCTS = [
  { id: 'gold_small',       title: 'Pouch of Gold',    desc: '250 gold coins. Spend on boosters and sticker packs.', usd: '0.99' },
  { id: 'gold_med',         title: 'Sack of Gold',     desc: '800 gold coins. Better value.',                        usd: '1.99' },
  { id: 'gold_large',       title: 'Treasure Chest',   desc: '2000 gold coins. Best value.',                         usd: '4.99' },
  { id: 'starter_bundle',   title: 'Starter Bundle',   desc: '600 gold plus 1 Golden sticker pack.',                 usd: '2.99' },
  { id: 'collector_bundle', title: 'Collector Bundle', desc: '1800 gold plus 3 Golden sticker packs.',               usd: '6.99' },
];

function usdMoney(s) { const n = parseFloat(s); const units = Math.floor(n); const nanos = Math.round((n - units) * 1e9); return { currencyCode: 'USD', units: String(units), nanos }; }

(async () => {
  const auth = new google.auth.GoogleAuth({ keyFile: KEY, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
  const ap = google.androidpublisher({ version: 'v3', auth });
  const OTP = ap.monetization.onetimeproducts;
  let existing = new Set();
  try { existing = new Set(((await OTP.list({ packageName: PKG })).data.oneTimeProducts || []).map(p => p.productId)); } catch (e) { console.log('(list failed, continuing): ' + (e.message || e)); }
  const list = ONLY ? PRODUCTS.filter(p => p.id === ONLY) : PRODUCTS;
  let ok = 0, fail = 0;
  for (const p of list) {
    try {
      const conv = (await ap.monetization.convertRegionPrices({ packageName: PKG, requestBody: { price: usdMoney(p.usd) } })).data;
      const crp = conv.convertedRegionPrices || {};
      const configs = Object.keys(crp).map(rc => ({ regionCode: crp[rc].regionCode || rc, price: crp[rc].price, availability: 'AVAILABLE' }));
      const regionVersion = (conv.regionVersion && (conv.regionVersion.version || conv.regionVersion)) || '2022/02';
      console.log((existing.has(p.id) ? 'UPDATE ' : 'CREATE ') + p.id + '  $' + p.usd + '  (' + configs.length + ' regions)' + (DRY ? '  [dry]' : ''));
      if (DRY) { ok++; continue; }
      await OTP.patch({
        packageName: PKG, productId: p.id, allowMissing: true, 'regionsVersion.version': regionVersion,
        updateMask: 'listings,purchaseOptions',
        requestBody: {
          packageName: PKG, productId: p.id,
          listings: [{ languageCode: 'en-US', title: p.title.slice(0, 55), description: p.desc.slice(0, 200) }],
          purchaseOptions: [{ purchaseOptionId: 'base', buyOption: { legacyCompatible: true }, regionalPricingAndAvailabilityConfigs: configs }],
        },
      });
      await OTP.purchaseOptions.batchUpdateStates({
        packageName: PKG, productId: p.id,
        requestBody: { requests: [{ activatePurchaseOptionRequest: { packageName: PKG, productId: p.id, purchaseOptionId: 'base' } }] },
      });
      console.log('  active ' + p.id);
      ok++;
    } catch (e) {
      const msg = (e.errors && e.errors[0] && e.errors[0].message) || e.message || String(e);
      console.log('  ! FAILED ' + p.id + ': ' + msg);
      fail++;
    }
  }
  console.log('Done. ok=' + ok + ' fail=' + fail);
})().catch(e => { console.error('ERROR: ' + (e.message || e)); process.exit(1); });
