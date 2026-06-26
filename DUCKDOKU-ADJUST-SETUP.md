# Duckdoku - Adjust marketing setup

Mirrors the Rail the Way / Dumpling Drop suite: **Adjust (native iOS/Android) -> Facebook partner forwarding + install server callback**. Web and Telegram are a no-op for Adjust (native only); every call is a safe no-op there.

The client wrapper is `assets/adjust.js` (global `window.DuckAdjust`, loaded non-defer in game.html `<head>`). Environment: Production.

## 0. App token (do this first)
In `assets/adjust.js` set `ADJUST_CONFIG.appToken` to your Duckdoku Adjust app token. Until it is filled the SDK stays disabled (logged, never crashes). Install + session tracking start the moment the SDK initializes (no event token needed).

## 1. Events  (duckdoku-adjust-events.csv -- Adjust bulk-import format: token,name,unique)
In Adjust: **Data management -> Events -> Import from CSV** -> upload `duckdoku-adjust-events.csv`.
Then mark **Purchase Completed (purcmp)** as a *revenue* event in the dashboard (USD).

Each event already fires in-game today via `DuckAdjust.fire(key)`, so wiring is just pasting the dashboard token into the `events` map in `assets/adjust.js`. Send the tokens back (or confirm these on import) and they go in one pass.

| Token  | Event              | DuckAdjust key      | Fires when                        | Revenue |
|--------|--------------------|---------------------|-----------------------------------|---------|
| appopn | App Open           | appOpen             | app boots                         | no      |
| gamest | Game Started       | gameStarted         | a level starts                    | no      |
| lvlcmp | Level Complete     | levelComplete       | a level is won                    | no      |
| lvlfal | Level Failed       | levelFailed         | out of hearts (level lost)        | no      |
| booste | Booster Used       | boosterUsed         | a booster is paid/used            | no      |
| purcmp | Purchase Completed | purchaseCompleted   | a gold/bundle purchase succeeds   | YES (USD) |

After import, paste each dashboard token into `assets/adjust.js`:
```js
events: {
  appOpen:           '<token>',
  gameStarted:       '<token>',
  levelComplete:     '<token>',
  levelFailed:       '<token>',
  boosterUsed:       '<token>',
  purchaseCompleted: '<token>',   // mark revenue in the dashboard
}
```
Then rebuild the native app (`npm run mobile:sync` + a fresh AAB/APK).

## 2. Server callback  (install attribution)
Endpoint is LIVE at: `https://duckdoku.onrender.com/api/adjust-callback` (added to server.js, returns 200, logs `[adjust-cb]`, keeps a small in-memory ring of recent attributed installs). The Express API lives on Render; the static game on Cloudflare (duckdoku.com) does NOT host this route.

In Adjust: **Data management -> Server callbacks -> New callback -> Activity type = Install** -> paste this URL:

```
https://duckdoku.onrender.com/api/adjust-callback?event=install&adid={adid}&network={network_name}&campaign={campaign_name}&adgroup={adgroup_name}&creative={creative_name}&store={store}&os={os_name}&country={country}&app_version={app_version_short}
```

Optional: add the SAME callback on the **Purchase Completed** event (Activity type = Event -> pick that event) to also get revenue server-side:

```
https://duckdoku.onrender.com/api/adjust-callback?event=purchase&adid={adid}&network={network_name}&campaign={campaign_name}&store={store}&os={os_name}&country={country}&revenue={revenue}&currency={currency}&app_version={app_version_short}
```

(Those `{...}` are Adjust placeholders; Adjust fills them at send time. The endpoint is open, exactly like RTW / DD; say the word to add a secret token.)

NOTE: Render free plan spins down when idle, so the first callback after a quiet period hits a cold start. Adjust retries on non-2xx, and the endpoint returns 200 once the server is up, so installs are not lost.

## 3. Facebook
Create a Duckdoku **Facebook App** and put its App ID in `ADJUST_CONFIG.fbAppId` (`assets/adjust.js`, currently the `__FACEBOOK_APP_ID__` placeholder). Once set, Adjust's Facebook partner forwards the events above to Meta for ad optimization (same as RTW / DD; there is NO separate Facebook Conversions API). Then in Adjust: **Partner setup -> Facebook -> link the events**.
