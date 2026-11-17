import "server-only";
import webpush from "web-push";
import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt, encrypt, sha256 } from "@/lib/crypto";
import { log } from "@/lib/log";
import { UserError } from "./errors";
import { SPLASH_BODY, SPLASH_HEAD } from "@/lib/shop-splash";
import { applyBrand } from "@/lib/shop-brand";

// Phone notifications for customers of the public shop (/shop), using standard Web Push.
// A customer's phone only gets them after it opened the shop and tapped "Allow".

const VAPID_ID = "push-vapid"; // Setting row holding the generated keys when none are set in the environment

let cached: { publicKey: string; privateKey: string } | null = null;

// Keys from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or made once and kept in the database (private key encrypted).
export async function vapidKeys() {
  if (cached) return cached;
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim(), envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) return (cached = { publicKey: envPub, privateKey: envPriv });
  const row = await db.setting.findUnique({ where: { id: VAPID_ID } });
  if (row) {
    const v = row.value as { publicKey: string; privateKey: string };
    return (cached = { publicKey: v.publicKey, privateKey: decrypt(v.privateKey) });
  }
  const k = webpush.generateVAPIDKeys();
  // If two requests race on first use, the first row wins and both use it.
  await db.setting.upsert({ where: { id: VAPID_ID }, create: { id: VAPID_ID, key: "push.vapid", value: { publicKey: k.publicKey, privateKey: encrypt(k.privateKey) } }, update: {} });
  cached = null;
  return vapidKeys();
}

// Only the push services that browsers actually use. The server POSTs to this address, so nothing else is accepted.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];
export function isPushEndpoint(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((r) => r.test(url.hostname));
  } catch { return false; }
}

const SubSchema = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpoint, "Not a push service address"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

// customerKey: the My orders key kept on the same phone, if it has ordered. Links the phone to that
// customer so it also gets their order updates. An unknown key is ignored.
export async function saveSubscriber(raw: unknown, lang: string, userAgent: string, customerKey?: unknown) {
  const s = SubSchema.parse(raw);
  const customer = typeof customerKey === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(customerKey)
    ? await db.shopCustomer.findUnique({ where: { keyHash: sha256(customerKey) }, select: { id: true } })
    : null;
  const data = { p256dh: s.keys.p256dh, auth: s.keys.auth, lang: lang === "ar" ? "ar" : "en", userAgent: userAgent.slice(0, 300), ...(customer ? { customerId: customer.id } : {}) };
  await db.pushSubscriber.upsert({ where: { endpoint: s.endpoint }, create: { endpoint: s.endpoint, ...data }, update: data });
}

export async function removeSubscriber(endpoint: string) {
  await db.pushSubscriber.deleteMany({ where: { endpoint } });
}

export const subscriberCount = () => db.pushSubscriber.count();

// Links go to this site only, so a notification can never send customers somewhere else.
const CampaignSchema = z.object({
  title: z.string().trim().min(1, "Write a title").max(60, "Keep the title under 60 characters"),
  body: z.string().trim().min(1, "Write a message").max(180, "Keep the message under 180 characters"),
  link: z.string().trim().max(300).default("/shop").transform((v) => v || "/shop")
    .refine((v) => v.startsWith("/") && !v.startsWith("//") && !v.includes("\\"), "The link must be a page of this site, such as /shop or /shop#shop"),
});

function vapidSubject() {
  return process.env.VAPID_SUBJECT?.trim() || (process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL : "mailto:support@medora-care.com");
}

// One customer's phones (an order update). Never throws: the order change has already been saved.
export async function sendToCustomer(customerId: string, msg: { title: string; body: string; url: string; tag: string }) {
  try {
    const subs = await db.pushSubscriber.findMany({ where: { customerId }, select: { id: true, endpoint: true, p256dh: true, auth: true } });
    if (!subs.length) return 0;
    const { publicKey, privateKey } = await vapidKeys();
    const payload = JSON.stringify(msg);
    let delivered = 0;
    const gone: string[] = [];
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
          { vapidDetails: { subject: vapidSubject(), publicKey, privateKey }, TTL: 3 * 86400, urgency: "high", timeout: 10_000 });
        delivered++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id);
        else log.warn("push.order_update_failed", { code, error: String(e).slice(0, 200) });
      }
    }));
    if (gone.length) await db.pushSubscriber.deleteMany({ where: { id: { in: gone } } });
    return delivered;
  } catch (e) {
    log.warn("push.order_update_failed", { error: String(e).slice(0, 200) });
    return 0;
  }
}

export async function sendCampaign(userId: string, raw: unknown) {
  const c = CampaignSchema.parse(raw);
  const { publicKey, privateKey } = await vapidKeys();
  const subject = vapidSubject();
  const subs = await db.pushSubscriber.findMany({ select: { id: true, endpoint: true, p256dh: true, auth: true } });
  if (!subs.length) throw new UserError("No customer has turned on notifications yet.");
  const payload = JSON.stringify({ title: c.title, body: c.body, url: c.link, tag: "medora-" + Date.now() });
  let delivered = 0, failed = 0;
  const gone: string[] = [], ok: string[] = [];
  const queue = [...subs];
  async function worker() {
    for (let s = queue.shift(); s; s = queue.shift()) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
          { vapidDetails: { subject: subject!, publicKey, privateKey }, TTL: 3 * 86400, urgency: "normal", timeout: 10_000 });
        delivered++; ok.push(s.id);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id); // the customer turned them off or removed the app
        else { failed++; log.warn("push.send_failed", { code, error: String(e).slice(0, 200) }); }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(20, subs.length) }, worker));
  if (gone.length) await db.pushSubscriber.deleteMany({ where: { id: { in: gone } } });
  if (ok.length) await db.pushSubscriber.updateMany({ where: { id: { in: ok } }, data: { lastSentAt: new Date() } });
  return db.pushCampaign.create({ data: { ...c, sentById: userId, total: subs.length, delivered, removed: gone.length, failed } });
}

export const recentCampaigns = () => db.pushCampaign.findMany({ orderBy: { createdAt: "desc" }, take: 20, include: { sentBy: { select: { name: true } } } });

// ---- The shop page ----

export const MAX_SHOP_BYTES = 4_000_000; // Vercel accepts uploads up to about 4.5 MB

export const shopVersion = (d: Date) => String(d.getTime());

// The shop was changed somewhere else, so saving now would throw that change away.
// "live": the Admin was opened on an older copy of the page. "older": an uploaded file holds an older catalogue than the live shop.
export class ShopConflictError extends UserError {
  constructor(public kind: "live" | "older", message: string) { super(message); }
}

// When the shop's Admin last saved the catalogue (set.upd inside <script id="db">), or null for a page without one.
export function catalogueSavedAt(html: string): string | null {
  const m = html.match(/<script type="application\/json" id="db">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    const u = JSON.parse(m[1])?.set?.upd;
    return typeof u === "string" && !Number.isNaN(Date.parse(u)) ? u : null;
  } catch { return null; }
}

const when = (iso: string) => iso.slice(0, 16).replace("T", " ") + " UTC";

// The database holds the one live shop page. Two guards keep a stale copy from replacing a newer one:
// - baseVersion (sent by the shop's Admin): the version of the page the Admin was opened on. If the page changed since, nothing is saved.
// - an uploaded file whose catalogue is older than the live one is refused, unless force is set (the person confirmed it).
export async function saveShopPage(html: string, userName: string, opts: { baseVersion?: string; force?: boolean } = {}): Promise<string> {
  if (!/<html[\s>]/i.test(html) || !/<\/body>/i.test(html)) throw new UserError("That file is not the shop page. In the shop, open ⚙ Admin and use “Download site file”, then upload that index.html.");
  if (Buffer.byteLength(html) > MAX_SHOP_BYTES) throw new UserError("The shop file is larger than 4 MB. Remove or shrink some photos in the shop's Admin, then download it again.");
  const cur = await db.shopPage.findUnique({ where: { id: "main" }, select: { html: true, updatedAt: true } });
  if (!cur) {
    const p = await db.shopPage.create({ data: { id: "main", html, updatedBy: userName }, select: { updatedAt: true } });
    return shopVersion(p.updatedAt);
  }
  const live = "The shop was updated somewhere else after this Admin was opened, so nothing was saved. Load the latest version and make your changes again.";
  if (opts.baseVersion !== undefined && opts.baseVersion !== shopVersion(cur.updatedAt)) throw new ShopConflictError("live", live);
  if (opts.baseVersion === undefined && !opts.force) {
    const mine = catalogueSavedAt(html), theirs = catalogueSavedAt(cur.html);
    if (mine && theirs && Date.parse(mine) < Date.parse(theirs))
      throw new ShopConflictError("older", `This file's products were saved ${when(mine)}, but the live shop has newer ones from ${when(theirs)}. Uploading it would undo those changes.`);
  }
  // Only replaces the page if nobody saved in between (two saves at the same moment).
  const { count } = await db.shopPage.updateMany({ where: { id: "main", updatedAt: cur.updatedAt }, data: { html, updatedBy: userName } });
  if (count === 0) throw new ShopConflictError("live", live);
  const p = await db.shopPage.findUniqueOrThrow({ where: { id: "main" }, select: { updatedAt: true } });
  return shopVersion(p.updatedAt);
}

export const shopPageInfo = () => db.shopPage.findUnique({ where: { id: "main" }, select: { updatedAt: true, updatedBy: true } });

export async function shopHtml(): Promise<string | null> {
  const p = await db.shopPage.findUnique({ where: { id: "main" }, select: { html: true, updatedAt: true } });
  if (!p) return null;
  const { publicKey } = await vapidKeys();
  return injectPush(p.html, publicKey, shopVersion(p.updatedAt));
}

// Adds the official logo, the home-screen app details, the animated logo shown when the shop opens as an app,
// the "Get offers on your phone" button, My orders and the "I am a …" profession sort to the uploaded page.
export function injectPush(html: string, publicKey: string, version?: string): string {
  // A page saved from the live shop may already carry the logo; never add it twice.
  html = html.replace(/<style id="medora-splash-css">[\s\S]*?<\/style>|<script id="medora-splash-js">[\s\S]*?<\/script>/g, "");
  // The official logo and tab icon, whatever logo the uploaded file was saved with.
  html = applyBrand(html);
  // A page saved from the live shop carries the version it was opened on; only the current one counts.
  html = html.replace(/<meta name="medora-shop-version"[^>]*>/g, "");
  const head = SPLASH_HEAD + `<link rel="manifest" href="/shop.webmanifest"><link rel="apple-touch-icon" href="/shop-icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Medora Care"><meta name="theme-color" content="#0f5f66">${version ? `<meta name="medora-shop-version" content="${version.replace(/\D/g, "")}">` : ""}<script src="/shop-admin.js"></script>`;
  const body = `<script id="medora-push">window.MEDORA_PUSH_KEY=${JSON.stringify(publicKey)};</script><script src="/shop-push.js" defer></script><script src="/shop-orders.js" defer></script><script src="/shop-profession.js" defer></script>`;
  const h = html.search(/<\/head>/i);
  let out = h >= 0 ? html.slice(0, h) + head + html.slice(h) : head + html;
  const b = out.search(/<\/body>(?![\s\S]*<\/body>)/i);
  out = b >= 0 ? out.slice(0, b) + body + out.slice(b) : out + body;
  // The logo goes first in <body> so it covers the page before anything else draws.
  // Scripts are skipped so a "<body>" written inside one (the shop's own "Download site file") isn't mistaken for the tag.
  let at = -1;
  for (const m of out.matchAll(/<script\b[\s\S]*?<\/script\s*>|<body\b[^>]*>/gi)) {
    if (/^<body/i.test(m[0])) { at = m.index + m[0].length; break; }
  }
  if (at >= 0) out = out.slice(0, at) + SPLASH_BODY + out.slice(at);
  else out = out.replace(body, SPLASH_BODY + body);
  return out;
}
