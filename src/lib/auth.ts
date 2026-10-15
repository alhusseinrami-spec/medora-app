import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, Session, User } from "@prisma/client";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { can, mfaRequired, type Permission } from "./rbac";

export const SESSION_COOKIE = "medora_session";
const SESSION_DAYS = 7;
const LOCK_FAILS = 5;
const LOCK_MINUTES = 15;

export const hashPassword = (pw: string) => hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

export function passwordProblem(pw: string): string | null {
  if (pw.length < 12) return "Use at least 12 characters.";
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return "Use letters and at least one number.";
  return null;
}

export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function isLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);
  const recent = await db.loginAttempt.findMany({ where: { email, at: { gte: since } }, orderBy: { at: "desc" }, take: LOCK_FAILS });
  return recent.length >= LOCK_FAILS && recent.every((a) => !a.ok);
}

export async function createSession(userId: string, mfaPassed: boolean) {
  const token = randomToken();
  const { ip, userAgent } = await clientInfo();
  const session = await db.session.create({
    data: { tokenHash: sha256(token), userId, mfaPassed, ip, userAgent, expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" && !process.env.ALLOW_INSECURE_COOKIES,
    expires: session.expiresAt,
  });
  return session;
}

export type AuthContext = { user: User; session: Session };

export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.revokedAt || session.expiresAt < new Date() || session.user.disabledAt) return null;
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60_000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 864e5) } });
  }
  const { user, ...s } = session;
  return { user, session: s };
}

// Use in every protected page, action and route.
export async function requireAuth(opts: { permission?: Permission; allowMfaSetup?: boolean } = {}): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const { user, session } = auth;
  if (user.mfaEnabled && !session.mfaPassed) redirect("/login/verify");
  if (mfaRequired(user.role) && !user.mfaEnabled && !opts.allowMfaSetup) redirect("/setup/mfa");
  if (opts.permission && !can(user.role, opts.permission)) redirect("/?denied=1");
  return auth;
}

// For route handlers: returns null instead of redirecting.
export async function apiAuth(permission?: Permission): Promise<AuthContext | null> {
  const auth = await getAuth();
  if (!auth) return null;
  const { user, session } = auth;
  if (user.mfaEnabled && !session.mfaPassed) return null;
  if (mfaRequired(user.role) && !user.mfaEnabled) return null;
  if (permission && !can(user.role, permission)) return null;
  return auth;
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
  jar.delete(SESSION_COOKIE);
}

export const hasRole = (u: { role: Role }, ...roles: Role[]) => roles.includes(u.role);
