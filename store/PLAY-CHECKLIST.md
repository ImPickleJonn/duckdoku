# Duckdoku, Google Play setup

Package: com.whaleplayed.duckdoku
Service account has API access (listing + bundle upload automated via scripts/dd-play.js).

## Done by automation
- Signed release AAB built (android/app/build/outputs/bundle/release/app-release.aab), target SDK 35, signed with the shared upload key (dd-secrets/android).
- Store listing pushed via API: title, short + full description, app icon (512), feature graphic (1024x500), 4 phone screenshots (1080x1920).
- AAB uploaded to the internal testing track.

Re-run anytime:
- node scripts/dd-play.js listing                # refresh text + graphics
- node scripts/dd-play.js upload <aab> internal   # upload a new build (bump versionCode first)
- npm run mobile:sync                             # rebuild www after a game change

## You must finish in the Play Console (UI only, cannot be done by API)
1. App content / Policy:
   - Privacy policy URL: https://duckdoku.com/privacy
   - Data safety form (we collect: approximate location and product interaction for analytics via Mixpanel; no data sold; data deletion at https://duckdoku.com/delete-account).
   - Content rating questionnaire (puzzle, no objectionable content -> Everyone).
   - Target audience and content (not primarily for children unless you choose so).
   - Ads declaration: contains no ads.
   - Government apps, financial features, health: no.
   - App access: all features available without special access (no login required).
2. Store settings: category Games > Puzzle, contact email, store listing review.
3. Internal testing: add tester emails, then roll out the uploaded build to the internal track.
4. When ready, promote internal -> closed (alpha) -> open (beta) -> production.

## To bump a new version later
1. Edit android/app/build.gradle versionCode (must increase) + versionName.
2. npm run mobile:sync
3. cd android && JAVA_HOME=/c/Users/jonnw/jdk-17 ./gradlew bundleRelease --no-daemon
4. node scripts/dd-play.js upload android/app/build/outputs/bundle/release/app-release.aab internal
