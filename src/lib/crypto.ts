import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

// AES-256-GCM for secrets at rest (authenticator secrets, OAuth tokens).
// The key comes only from the server environment, never the database.
// Pasted values often carry a stray space or newline, so the trimmed value is the key. Secrets encrypted
// before that rule (with the untrimmed value) still decrypt.
function keys(): Buffer[] {
  const raw = process.env.APP_ENCRYPTION_KEY ?? "";
  const trimmed = raw.trim();
  if (trimmed.length < 32) throw new Error("APP_ENCRYPTION_KEY is missing or shorter than 32 characters.");
  return [...new Set([trimmed, raw])].map((k) => createHash("sha256").update(k).digest());
}
const key = () => keys()[0];

// For sign-in and the health check: a readable reason instead of a crash when the setting is wrong.
export function encryptionKeyProblem(): string | null {
  const v = (process.env.APP_ENCRYPTION_KEY ?? "").trim();
  return v.length >= 32 ? null : v ? "APP_ENCRYPTION_KEY is shorter than 32 characters." : "APP_ENCRYPTION_KEY is not set.";
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function decrypt(token: string): string {
  const [v, iv, tag, body] = token.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Unrecognised ciphertext.");
  for (const k of keys()) {
    try {
      const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
    } catch {}
  }
  throw new KeyMismatchError();
}

// The secret was encrypted with a different APP_ENCRYPTION_KEY than the server has now.
export class KeyMismatchError extends Error {
  constructor() { super("This secret was encrypted with a different APP_ENCRYPTION_KEY."); }
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
