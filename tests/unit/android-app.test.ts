import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ANDROID_PACKAGE, androidFingerprints, assetLinks } from "@/lib/services/android-app";
import { proxy } from "@/proxy";

const PLAY = "aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99";

describe("Android app links", () => {
  it("lists the upload key by default", () => {
    const [link] = assetLinks("");
    expect(link.target.package_name).toBe(ANDROID_PACKAGE);
    expect(link.target.sha256_cert_fingerprints).toHaveLength(1);
  });
  it("adds Play's signing key from the setting, uppercased, and ignores junk and repeats", () => {
    const f = androidFingerprints(`${PLAY}, not-a-key ,${PLAY.toUpperCase()}`);
    expect(f).toHaveLength(2);
    expect(f[1]).toBe(PLAY.toUpperCase());
  });
  it("serves the links file and the privacy page without signing in", () => {
    for (const p of ["/.well-known/assetlinks.json", "/privacy"]) {
      const res = proxy(new NextRequest(`https://shop.example${p}`));
      expect(res.headers.get("location")).toBeNull();
      expect(res.status).toBe(200);
    }
  });
});
