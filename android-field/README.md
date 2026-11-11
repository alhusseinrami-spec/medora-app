# Medora Field Android app

A Trusted Web Activity: the app opens `https://medora-app-gamma.vercel.app/field` full screen in the phone's Chrome,
for salespeople, drivers and anyone else using the field app. Everything comes from the website, so the app only needs
an update when its name, icon, colours or start page change. It is a separate app from the customer shop app (`android/`).

- Package name: `com.medoracare.field`
- Website side: `/.well-known/assetlinks.json` lists this app's signing key next to the shop app's
  (`src/lib/services/android-app.ts`). Without a matching key the app still works but shows a thin address bar at the top.

## Building

GitHub Actions builds it on every change under `android-field/` (workflow "Field Android app"). The download is an
**unsigned** APK and app bundle in the `medora-field-android-unsigned` artifact.
Locally, with the Android SDK installed: `cd android-field && ./gradlew assembleRelease bundleRelease`.

## Signing

The signing key is **not** in git. It is in the project files as `android-field/medora-field-upload.keystore`
(alias `medora`), with its password in `KEYSTORE-PASSWORD.txt` next to it. Keep a copy in a password manager:
installed phones only accept updates signed with this same key.

```sh
java -jar uber-apk-signer.jar --apks app-release-unsigned.apk --ks medora-field-upload.keystore --ksAlias medora
```

Or build signed directly by setting `MEDORA_FIELD_KEYSTORE` and `MEDORA_FIELD_KEYSTORE_PASSWORD`.

## Releasing an update

Raise `versionCode` and `versionName` in `app/build.gradle`, build, sign with the same key, and install the new APK
over the old one.
