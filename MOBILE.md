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
- appId `com.whaleplayed.duckdoku`, name `Duckdoku` (see `capacitor.config.json`).
- Set the launcher icon + splash from the duck hero art (reuse brand/ assets).
- In `android/app/build.gradle` set `versionCode` (must exceed any uploaded) and `versionName`.

## Local build prerequisites (gitignored, set once per machine)
- `android/local.properties` must point at the Android SDK, e.g. `sdk.dir=C\:\\Users\\jonnw\\android-sdk` (the SDK lives at `C:\Users\jonnw\android-sdk`). Without it gradle fails with "SDK location not found".
- `JAVA_HOME` must be JDK 17 (`/c/Users/jonnw/jdk-17`), not necessarily on PATH.

## Firebase Cloud Messaging (push)
- Firebase project `duckdoku-299f3`. FCM powers native Android push.
- `android/app/google-services.json` is the client config (gitignored with the rest of `android/`). A backup lives at `dd-secrets/duckdoku-google-services.json`; restore it after `npx cap add android` on a fresh clone (`cp dd-secrets/duckdoku-google-services.json android/app/`).
- Gradle wiring is already in place: classpath `com.google.gms:google-services` in `android/build.gradle` + a conditional `apply plugin` in `android/app/build.gradle` that activates once `google-services.json` exists.
- Plugin: `@capacitor/push-notifications` (v6, matches Capacitor 6). The client registers in `fcmInit()` in game.html (native only, guarded by `Capacitor.isNativePlatform`); on success it POSTs the device token to `/api/fcm-register`, which the server stores in the `fcmTokens` map.
- NOT wired yet: server-side SENDING. That needs a Firebase Admin service account JSON (Firebase console, Project settings, Service accounts). Add it as env `FIREBASE_SA` and implement `fcmSend()` in server.js (currently a safe no-op).

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
