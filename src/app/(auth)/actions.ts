"use server";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { clientInfo, createSession, endSession, getAuth, hashPassword, isLockedOut, passwordProblem, verifyPassword } from "@/lib/auth";
import { decrypt, encrypt } from "@/lib/crypto";
import { newTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";

// `values` refills fields after a failed attempt (React resets forms once an action finishes).
export type FormState = { error?: string; ok?: string; values?: Record<string, string> } | undefined;
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// First run only: creates the owner account. Disabled as soon as any user exists.
export async function setupOwner(_: FormState, f: FormData): Promise<FormState> {
  if ((await db.user.count()) > 0) redirect("/login");
  const name = str(f, "name"), email = str(f, "email").toLowerCase(), pw = String(f.get("password") ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter your name and a valid email.", values: { name, email } };
  const bad = passwordProblem(pw);
  if (bad) return { error: bad, values: { name, email } };
  if (pw !== String(f.get("confirm") ?? "")) return { error: "The passwords don't match.", values: { name, email } };
  const user = await db.user.create({ data: { name, email, role: "OWNER", passwordHash: await hashPassword(pw) } });
  await audit({ actorId: user.id, action: "user.setup_owner", entity: "user", entityId: user.id, ip: (await clientInfo()).ip });
  await createSession(user.id, false);
  redirect("/setup/mfa");
}

export async function login(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email").toLowerCase(), pw = String(f.get("password") ?? "");
  const { ip } = await clientInfo();
  if (await isLockedOut(email)) return { error: "Too many failed attempts. Try again in 15 minutes.", values: { email } };
  const user = await db.user.findUnique({ where: { email } });
  const ok = !!user && !user.disabledAt && (await verifyPassword(user.passwordHash, pw));
  await db.loginAttempt.create({ data: { email, ip, ok } });
  if (!ok || !user) {
    await audit({ action: "auth.login_failed", entity: "user", entityId: user?.id ?? null, ip, meta: { email } });
    return { error: "That email and password don't match.", values: { email } };
  }
  await createSession(user.id, !user.mfaEnabled);
  await audit({ actorId: user.id, action: "auth.login", entity: "user", entityId: user.id, ip });
  redirect(user.mfaEnabled ? "/login/verify" : "/");
}

export async function verifyMfa(_: FormState, f: FormData): Promise<FormState> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const { user, session } = auth;
  if (!user.mfaEnabled || !user.mfaSecretEnc) redirect("/");
  const email = `mfa:${user.email}`;
  if (await isLockedOut(email)) return { error: "Too many wrong codes. Try again in 15 minutes." };
  const ok = verifyTotp(decrypt(user.mfaSecretEnc), str(f, "code"));
  await db.loginAttempt.create({ data: { email, ip: (await clientInfo()).ip, ok } });
  if (!ok) return { error: "That code isn't right. Use the current code from your authenticator app." };
  await db.session.update({ where: { id: session.id }, data: { mfaPassed: true } });
  await audit({ actorId: user.id, action: "auth.mfa_passed", entity: "user", entityId: user.id });
  redirect("/");
}

// Prepares (or reuses) a not-yet-confirmed secret and returns what the enrolment screen shows.
export async function mfaEnrolment() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const { user } = auth;
  if (user.mfaEnabled) return null;
  let secret = user.mfaSecretEnc ? decrypt(user.mfaSecretEnc) : null;
  if (!secret) {
    secret = newTotpSecret();
    await db.user.update({ where: { id: user.id }, data: { mfaSecretEnc: encrypt(secret) } });
  }
  const url = otpauthUrl(secret, user.email);
  return { secret, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
}

export async function confirmMfa(_: FormState, f: FormData): Promise<FormState> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const { user, session } = auth;
  if (!user.mfaSecretEnc) return { error: "Reload the page to get a new code." };
  if (!verifyTotp(decrypt(user.mfaSecretEnc), str(f, "code"))) return { error: "That code isn't right. Check the time on your phone and try the newest code." };
  await db.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
  await db.session.update({ where: { id: session.id }, data: { mfaPassed: true } });
  await audit({ actorId: user.id, action: "auth.mfa_enabled", entity: "user", entityId: user.id });
  redirect("/");
}

export async function logout() {
  const auth = await getAuth();
  if (auth) await audit({ actorId: auth.user.id, action: "auth.logout", entity: "user", entityId: auth.user.id });
  await endSession();
  redirect("/login");
}
