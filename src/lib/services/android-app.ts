// The Medora Care Android app (a Trusted Web Activity around /shop).
// Android only shows the shop full screen, without an address bar, when this site lists
// the app's signing certificate in /.well-known/assetlinks.json.

export const ANDROID_PACKAGE = "com.medoracare.shop";

// The upload key made for this app (kept in the project files, not in git).
// Its fingerprint is public by design: it identifies the app, it can't sign anything.
const UPLOAD_KEY_SHA256 = "60:D1:F5:D4:1B:F2:8F:5C:F0:FF:2A:37:08:41:FD:00:B2:8B:DA:90:FC:34:D8:88:47:B1:EE:54:2B:20:98:08";

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
  ];
}
