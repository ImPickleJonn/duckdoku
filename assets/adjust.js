/* ===========================================================================
   adjust.js - Adjust mobile attribution for Duckdoku (Facebook / Meta UA).
   NATIVE ONLY (Android/iOS via the com.adjust.sdk Cordova plugin). On web and
   inside Telegram the SDK globals are absent and every call is a safe no-op, so
   this file is harmless to load everywhere. Mirrors the Dumpling Drop setup.

   HOW IT POWERS FACEBOOK ADS:
   Adjust attributes installs + in-app events and forwards them to Meta using the
   Facebook App ID set via setFbAppId. In the Adjust dashboard you link the Meta
   partner once; then Facebook Ads can optimize toward these events.

   ====> YOU MUST FILL IN 3 THINGS (from your own dashboards), then rebuild: <====
   1) ADJUST_CONFIG.appToken   - Adjust dashboard: your Duckdoku app token.
   2) ADJUST_CONFIG.fbAppId    - Facebook developers: your Duckdoku app's App ID.
   3) ADJUST_CONFIG.events.*   - Adjust dashboard: one event token per action.
   Until appToken is filled the SDK stays disabled (logged, never crashes).
   =========================================================================== */
(function (global) {
  var ADJUST_CONFIG = {
    appToken: '7tm4lwjur2f4',                 // Duckdoku (Adjust) — Android + iOS
    fbAppId:  '__FACEBOOK_APP_ID__',          // <- paste from Facebook
    environment: 'production',                 // 'production' or 'sandbox' (test)
    logLevel: 'SUPPRESS',                      // 'VERBOSE' while testing
    events: {                                  // <- paste each token from Adjust
      appOpen:           '__TOK_APP_OPEN__',
      gameStarted:       '__TOK_GAME_STARTED__',
      levelComplete:     '__TOK_LEVEL_COMPLETE__',
      levelFailed:       '__TOK_LEVEL_FAILED__',
      boosterUsed:       '__TOK_BOOSTER_USED__',
      purchaseCompleted: '__TOK_PURCHASE_COMPLETED__',
    },
  };

  function filled(v) { return typeof v === 'string' && v && v.indexOf('__') !== 0; }
  function isNative() { try { return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  var ready = false;

  var DuckAdjust = {
    init: function () {
      if (ready) return;
      if (!isNative()) return;                       // web / Telegram: skip
      var A = global.Adjust, Cfg = global.AdjustConfig;
      if (!A || !Cfg || !A.initSdk) { return; }      // plugin not present in this build
      if (!filled(ADJUST_CONFIG.appToken)) { try { console.log('[adjust] disabled: app token not set'); } catch (e) {} return; }
      try {
        var env = (ADJUST_CONFIG.environment === 'production') ? Cfg.EnvironmentProduction : Cfg.EnvironmentSandbox;
        var cfg = new Cfg(ADJUST_CONFIG.appToken, env);
        try { if (cfg.setLogLevel && Cfg['LogLevel' + ADJUST_CONFIG.logLevel] !== undefined) cfg.setLogLevel(Cfg['LogLevel' + ADJUST_CONFIG.logLevel]); } catch (e) {}
        // Facebook / Meta attribution link.
        try { if (cfg.setFbAppId && filled(ADJUST_CONFIG.fbAppId)) cfg.setFbAppId(ADJUST_CONFIG.fbAppId); } catch (e) {}
        A.initSdk(cfg);
        ready = true;
        // iOS 14.5+: ask for App Tracking so IDFA attribution can run (no-op on Android).
        try { if (A.requestAppTrackingAuthorization) A.requestAppTrackingAuthorization(function () {}); } catch (e) {}
      } catch (e) { try { console.log('[adjust] init failed', e); } catch (_) {} }
    },
    // Fire an Adjust event by config key. amount + currency are optional (revenue).
    fire: function (key, amount, currency) {
      if (!ready) return;
      var A = global.Adjust, Ev = global.AdjustEvent;
      var token = (ADJUST_CONFIG.events || {})[key];
      if (!A || !Ev || !filled(token)) return;
      try {
        var ev = new Ev(token);
        if (typeof amount === 'number' && amount > 0 && ev.setRevenue) ev.setRevenue(amount, currency || 'USD');
        A.trackEvent(ev);
      } catch (e) {}
    },
  };

  global.DuckAdjust = DuckAdjust;
})(typeof window !== 'undefined' ? window : this);
