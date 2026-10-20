import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hotp, otpauthUrl, totp, verifyTotp } from "@/lib/totp";
import { decrypt, encrypt, KeyMismatchError, safeEqual, sha256 } from "@/lib/crypto";
import { can, mfaRequired } from "@/lib/rbac";

// RFC 6238 appendix B, SHA-1 secret "12345678901234567890".
const RFC = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    expect(hotp(RFC, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(hotp(RFC, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(hotp(RFC, Math.floor(1234567890 / 30), 8)).toBe("89005924");
    expect(hotp(RFC, Math.floor(2000000000 / 30), 8)).toBe("69279037");
  });
  it("round-trips base32", () => {
    expect(base32Decode(base32Encode(Buffer.from("medora"))).toString()).toBe("medora");
  });
  it("accepts the current code and one step of drift, rejects older ones", () => {
    const at = 1_800_000_000_000;
    expect(verifyTotp(RFC, totp(RFC, at), at)).toBe(true);
    expect(verifyTotp(RFC, totp(RFC, at - 30_000), at)).toBe(true);
    expect(verifyTotp(RFC, totp(RFC, at - 90_000), at)).toBe(false);
    expect(verifyTotp(RFC, "12345", at)).toBe(false);
    expect(verifyTotp(RFC, "abcdef", at)).toBe(false);
  });
  it("builds an otpauth URL for authenticator apps", () => {
    expect(otpauthUrl("ABC", "rami@medora.example")).toContain("otpauth://totp/Medora%20Care%3Arami%40medora.example?secret=ABC");
  });
});

describe("encryption at rest", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("secret"), b = encrypt("secret");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("secret");
  });
  it("detects tampering", () => {
    const parts = encrypt("secret").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
  it("ignores stray spaces around the key, still reads secrets from before, and names a changed key", () => {
    const original = process.env.APP_ENCRYPTION_KEY!;
    try {
      process.env.APP_ENCRYPTION_KEY = ` ${original}\n`;
      const padded = encrypt("secret");
      expect(decrypt(padded)).toBe("secret");
      process.env.APP_ENCRYPTION_KEY = original;
      expect(decrypt(padded)).toBe("secret"); // same trimmed key
      process.env.APP_ENCRYPTION_KEY = "a-completely-different-key-0123456789abcdef";
      expect(() => decrypt(padded)).toThrow(KeyMismatchError);
    } finally { process.env.APP_ENCRYPTION_KEY = original; }
  });
  it("hashes and compares in constant time", () => {
    expect(sha256("x")).toHaveLength(64);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
  });
});

describe("roles", () => {
  it("grants by role", () => {
    expect(can("OWNER", "data.delete")).toBe(true);
    expect(can("ADMIN", "approvals.decide")).toBe(false);
    expect(can("MANAGER", "team.assign")).toBe(true);
    expect(can("STAFF", "team.view")).toBe(false);
    expect(can("VIEWER", "workspace.use")).toBe(false);
  });
  it("requires two-step sign-in for owner and admins", () => {
    expect(mfaRequired("OWNER")).toBe(true);
    expect(mfaRequired("ADMIN")).toBe(true);
    expect(mfaRequired("STAFF")).toBe(false);
  });
});
