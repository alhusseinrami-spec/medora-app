# Medora Care Android app

A Trusted Web Activity: the app opens `https://medora-app-gamma.vercel.app/shop` full screen in the phone's Chrome.
Products, prices and notifications all come from the website, so the app doesn't need an update when they change.

- Package name: `com.medoracare.shop`
- Website side: `/.well-known/assetlinks.json` (lists the signing keys) and `/privacy` (store listing privacy policy).
  Without a matching key in `assetlinks.json`, the app still works but shows a thin address bar at the top.

## Building

GitHub Actions builds it on every change under `android/` (workflow "Android app"). The download is an
**unsigned** app bundle (`.aab`) and APK in the `medora-android-unsigned` artifact.
Locally, with Android Studio or the Android SDK installed: `cd android && ./gradlew bundleRelease assembleRelease`.

## Signing

The upload key is **not** in git. It's in the project files as `android-app/medora-upload.keystore`, with its password
in `KEYSTORE-PASSWORD.txt`. Keep a copy in a password manager. If it's lost, Google Play support can reset the upload key,
because Google Play App Signing holds the real app signing key.

```sh
# App bundle for Google Play
jarsigner -keystore medora-upload.keystore -sigalg SHA256withRSA -digestalg SHA-256 app-release.aab medora
# APK for installing directly on a phone (needs v2 signing; uber-apk-signer also zip-aligns)
java -jar uber-apk-signer.jar --apks app-release-unsigned.apk --ks medora-upload.keystore --ksAlias medora
```

Or build signed directly by setting `MEDORA_KEYSTORE`, `MEDORA_KEYSTORE_PASSWORD` (and optionally `MEDORA_KEY_ALIAS`).

## After the first upload to Google Play

Play re-signs the app with its own key. Copy the SHA-256 of the **App signing key certificate** from
Play Console > Test and release > App integrity, and put it in the Vercel setting `ANDROID_CERT_SHA256`
(several keys can be separated with commas), then redeploy. The upload key's fingerprint is already built in
(`src/lib/services/android-app.ts`).

## Releasing an update

Only needed for changes to the app itself (name, icon, colours, start page). Raise `versionCode` and `versionName`
in `app/build.gradle`, build, sign the `.aab`, and upload it as a new release.
