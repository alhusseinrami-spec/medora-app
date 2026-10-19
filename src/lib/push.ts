// Web Push to phones and browsers (iPhone needs Medora added to the Home Screen, iOS 16.4+).
// VAPID keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when set. Otherwise they are generated
// once and kept in the settings table, with the private key encrypted by APP_ENCRYPTION_KEY.
import webpush from "web-push";
import { db } from "./db";
import { decrypt, encrypt } from "./crypto";
import { log } from "./log";

const VAPID_SETTING = "push.vapid";
const PROD_URL = "https://medora-app-gamma.vercel.app";

export type VapidKeys = { publicKey: string; privateKey: string };
export type PushPayload = { title: string; body?: string; link?: string; tag?: string };

let cached: VapidKeys | null = null;

function subject(): string {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;
  // Apple rejects a localhost or http subject, so fall back to the production address.
  const app = process.env.APP_URL ?? "";
  return app.startsWith("https://") ? app : PROD_URL;
}

export async function getVapidKeys(): Promise<VapidKeys> {
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim(), envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) return { publicKey: envPub, privateKey: envPriv };
  if (cached) return cached;
  cached = await db.$transaction(async (tx) => {
    // One generator at a time, so two cold starts can't each store a different pair.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${VAPID_SETTING}))`;
    const row = await tx.setting.findFirst({ where: { userId: null, key: VAPID_SETTING } });
    const v = row?.value as { publicKey?: string; privateKeyEnc?: string } | undefined;
    if (v?.publicKey && v.privateKeyEnc) return { publicKey: v.publicKey, privateKey: decrypt(v.privateKeyEnc) };
    const k = webpush.generateVAPIDKeys();
    await tx.setting.create({ data: { key: VAPID_SETTING, value: { publicKey: k.publicKey, privateKeyEnc: encrypt(k.privateKey) } } });
    log.info("push.vapid_generated");
    return { publicKey: k.publicKey, privateKey: k.privateKey };
  });
  return cached;
}

// Only hand the service worker an in-app path, never an outside address.
const safeLink = (link?: string) => (link && link.startsWith("/") && !link.startsWith("//") ? link : "/");

// Sends to every subscription the user has. Subscriptions the push service reports as gone (404/410)
// are deleted. Never throws: a push problem must not break the in-app notification.
export async function sendPush(userId: string, p: PushPayload): Promise<{ sent: number; removed: number; failed: number }> {
  const res = { sent: 0, removed: 0, failed: 0 };
  try {
    const subs = await db.pushSubscription.findMany({ where: { userId } });
    if (!subs.length) return res;
    const keys = await getVapidKeys();
    const payload = JSON.stringify({ title: p.title, body: p.body ?? "", link: safeLink(p.link), tag: p.tag });
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 12 * 3600, urgency: "high", timeout: 10_000,
        });
        res.sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.pushSubscription.deleteMany({ where: { id: s.id } }).catch(() => undefined);
          res.removed++;
        } else {
          res.failed++;
          log.warn("push.send_failed", { status: status ?? null, host: hostOf(s.endpoint), error: String((e as Error)?.message ?? e).slice(0, 200) });
        }
      }
    }));
  } catch (e) {
    log.error("push.fanout_failed", { error: String(e).slice(0, 300) });
  }
  return res;
}

function hostOf(url: string) {
  try { return new URL(url).host; } catch { return "invalid"; }
}

// Push services browsers actually use (Chrome/Android, Firefox, Safari/iOS, Edge). Anything else is refused,
// so the server never posts to an arbitrary address someone registered.
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];
export function isPushEndpoint(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch { return false; }
}
