# Duckdoku, Android native (Capacitor)

The native Android app wraps the same `game.html`. `scripts/build-mobile.js` stages
`www/` (game.html as `index.html` with `API_BASE` hard pinned to the Render API,
plus the duck assets). Capacitor builds the APK/AAB from `www/`.

> The native build runs in local/web mode (localStorage save). Telegram Stars IAP
> only works inside Telegram, so wire Google Play Billing later (see Dumpling Drop's
> NATIVE_GRANTS pattern) if you want native purchases. Mixpanel + flags still work.

## One time setup
```
npm install --include=optional        # pulls @capacitor/* (optionalDependencies)
npm run mobile:build                  # builds www/
npx cap add android                   # creates android/ (gitignored)
npx cap sync android
```

## App identity
- appId `com.duckdoku.game`, name `Duckdoku` (see `capacitor.config.json`).
- Set the launcher icon + splash from the duck hero art (reuse brand/ assets).
- In `android/app/build.gradle` set `versionCode` (must exceed any uploaded) and `versionName`.

## After any game change
```
npm run mobile:sync                   # rebuild www/ + cap sync
npx cap open android                  # open Android Studio to run / build
```

## Build a release AAB (Windows)
```
# JAVA_HOME must point at JDK 17 (not necessarily on PATH), e.g.
export JAVA_HOME=/c/Users/jonnw/jdk-17
cd android && ./gradlew bundleRelease --no-daemon
# AAB at android/app/build/outputs/bundle/release/app-release.aab
```

`www/` and `android/` are gitignored (generated / contains signing).
