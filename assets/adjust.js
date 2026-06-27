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
    fbAppId:  '2510536786035302',             // Duckdoku Facebook app (Meta attribution)
    environment: 'production',                 // 'production' or 'sandbox' (test)
    logLevel: 'SUPPRESS',                      // 'VERBOSE' while testing
    events: {                                  // Adjust event tokens (events-7tm4lwjur2f4.csv)
      appOpen:           'gok408',
      gameStarted:       'qm2l24',
      levelComplete:     'uj4ce5',
      levelFailed:       'l95tri',
      boosterUsed:       '7ohulr',
      purchaseCompleted: 'f75xwc',
    },
  };

  function filled(v) { return typeof v === 'string' && v && v.indexOf('__') !== 0; }
  function isNative() { try { return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform()); } catch (e) { return false; } }
  var ready = false;
  // paid/FB install source -> campaign. First-touch in dd.camp (so mxBoot picks it up next session);
  // bridged live to Mixpanel via window._ddOnAttribution (defined in game.html).
  function _onAttribution(at){
    try{
      if(!at) return;
      var net=String(at.network||''), camp=String(at.campaign||'');
      var label=camp||net; if(!label) return;
      var existing=''; try{ existing=localStorage.getItem('dd.camp')||''; }catch(_){}
      if(!existing){ try{ localStorage.setItem('dd.camp',label); }catch(_){} }
      try{ if(typeof global._ddOnAttribution==='function') global._ddOnAttribution(existing||label, net, camp); }catch(_){}
    }catch(e){}
  }

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
        try { var _cb=function(at){ try{ _onAttribution(at); }catch(e){} }; if(cfg.setAttributionCallback) cfg.setAttributionCallback(_cb); else if(cfg.setAttributionCallbackListener) cfg.setAttributionCallbackListener(_cb); } catch (e) {}   // paid/FB install source -> Mixpanel campaign
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
