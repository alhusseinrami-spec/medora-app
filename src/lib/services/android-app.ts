// The Medora Android apps, each a Trusted Web Activity around part of this site:
// Medora Care around /shop (android/) and Medora Field around /field (android-field/).
// Android only shows an app full screen, without an address bar, when this site lists
// that app's signing certificate in /.well-known/assetlinks.json.

export const ANDROID_PACKAGE = "com.medoracare.shop";

// The upload key made for this app (kept in the project files, not in git).
// Its fingerprint is public by design: it identifies the app, it can't sign anything.
const UPLOAD_KEY_SHA256 = "60:D1:F5:D4:1B:F2:8F:5C:F0:FF:2A:37:08:41:FD:00:B2:8B:DA:90:FC:34:D8:88:47:B1:EE:54:2B:20:98:08";

// Medora Field: installed straight from its APK (not Google Play), so its own key is the only one.
export const FIELD_PACKAGE = "com.medoracare.field";
const FIELD_KEY_SHA256 = "2E:BD:B6:19:F5:F5:01:48:2F:48:1A:B7:AC:2E:4F:3C:8B:51:F8:99:1C:E0:94:C0:8F:9A:11:12:85:4E:97:FA";

const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

// ANDROID_CERT_SHA256 adds more fingerprints, separated by commas: Google Play's
// app signing key (Play Console, Test and release, App integrity) once the app is uploaded.
export function androidFingerprints(extra = process.env.ANDROID_CERT_SHA256 ?? ""): string[] {
  const all = [UPLOAD_KEY_SHA256, ...extra.split(/[,\s]+/)]
    .map((f) => f.trim().toUpperCase())
    .filter((f) => FINGERPRINT.test(f));
  return [...new Set(all)];
}

export function assetLinks(extra?: string) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: androidFingerprints(extra) },
    },
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: FIELD_PACKAGE, sha256_cert_fingerprints: [FIELD_KEY_SHA256] },
    },
  ];
}
