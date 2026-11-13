import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma, ShopOrderStatus, User } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { decrypt, encrypt, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { can } from "@/lib/rbac";
import { notify } from "./notifications";
import { sendToCustomer } from "./push";
import { UserError } from "./errors";

// My orders for shop customers. Customers don't sign in: the shop keeps a random key on the phone
// (made by the phone itself, so sending the order never waits for the server) and every request
// carries it. Staff set each order's status and attach the pro forma and invoice from Shop orders.

export const SHOP_STATUS: Record<ShopOrderStatus, { label: string; ar: string; chip: string }> = {
  PLACED: { label: "New", ar: "تم الاستلام", chip: "chip-warn" },
  CONFIRMED: { label: "Confirmed", ar: "تم التأكيد", chip: "chip-blue" },
  TO_DELIVER: { label: "To be delivered", ar: "قيد التوصيل", chip: "chip-teal" },
  DELIVERED: { label: "Delivered", ar: "تم التسليم", chip: "chip-ok" },
  CANCELLED: { label: "Cancelled", ar: "ملغى", chip: "chip-danger" },
};

export const DOC_KIND = { PROFORMA: { label: "Pro forma", ar: "فاتورة مبدئية (بروفورما)" }, INVOICE: { label: "Invoice", ar: "فاتورة" } } as const;
export type DocKind = keyof typeof DOC_KIND;

export const MAX_DOC_BYTES = 4_000_000; // Vercel accepts request bodies up to about 4.5 MB
const DOC_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

const KeySchema = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/);
const refAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newRef(): string {
  const b = randomBytes(6);
  return "MC-" + Array.from(b, (x) => refAlphabet[x % refAlphabet.length]).join("");
}

// Phone numbers as typed: keep digits and a leading +, so the same number always looks the same.
export function cleanPhone(p: string): string {
  const t = p.trim();
  return (t.startsWith("+") ? "+" : "") + t.replace(/\D/g, "");
}

const Line = z.object({
  code: z.string().trim().max(40).default(""),
  name: z.string().trim().min(1).max(200),
  nameAr: z.string().trim().max(200).default(""),
  qty: z.coerce.number().int().min(1).max(100_000),
  price: z.coerce.number().min(0).max(1_000_000).default(0),
});
type LineT = z.infer<typeof Line>;

const Phone = z.string().trim().max(30).transform(cleanPhone).refine((v) => v.replace("+", "").length >= 7, "Enter a phone number");

const PlaceSchema = z.object({
  key: KeySchema,
  ref: z.string().regex(/^MC-[A-Z0-9]{6}$/),
  name: z.string().trim().min(1, "Enter your name").max(100),
  phone: Phone,
  lang: z.string().default("en").transform((v) => (v === "ar" ? "ar" : "en")),
  lines: z.array(Line).min(1).max(300),
  note: z.string().trim().max(500).default(""),
});

const total = (lines: LineT[]) => Math.round(lines.reduce((s, l) => s + l.qty * l.price, 0) * 100) / 100;

async function staffToTell() {
  const users = await db.user.findMany({ where: { disabledAt: null }, select: { id: true, role: true } });
  return users.filter((u) => can(u.role, "shop.orders"));
}

// The shop sends this when the customer taps "Send order on WhatsApp". Sending the same ref again
// (a retry after a bad connection) returns the order already saved.
export async function placeShopOrder(raw: unknown) {
  const o = PlaceSchema.parse(raw);
  const keyHash = sha256(o.key);
  const customer = await db.shopCustomer.upsert({
    where: { keyHash },
    create: { keyHash, keyEnc: encrypt(o.key), name: o.name, phone: o.phone, lang: o.lang, lastSeenAt: new Date() },
    update: { name: o.name, phone: o.phone, lang: o.lang, lastSeenAt: new Date() },
  });
  const existing = await db.shopOrder.findUnique({ where: { ref: o.ref } });
  if (existing) {
    if (existing.customerId !== customer.id) throw new UserError("That order reference is taken.");
    return existing;
  }
  const order = await db.shopOrder.create({
    data: {
      ref: o.ref, customerId: customer.id, source: "shop", lines: o.lines as Prisma.InputJsonValue, total: total(o.lines), note: o.note,
      events: { create: { status: "PLACED", byName: o.name } },
    },
  });
  for (const u of await staffToTell()) {
    await notify(u.id, { kind: "shop_order", title: `Shop order ${order.ref} from ${o.name}`, body: `${o.phone} · ${o.lines.length} item${o.lines.length === 1 ? "" : "s"}`, link: `/customers/orders/${order.id}` });
  }
  return order;
}

async function customerFor(key: unknown) {
  const k = KeySchema.safeParse(key);
  if (!k.success) return null;
  return db.shopCustomer.findUnique({ where: { keyHash: sha256(k.data) } });
}

// A link that opens one document for the customer who owns it. It names the document, not the
// customer's key, so a forwarded link shows that one file and nothing else.
export const docToken = (docId: string, keyHash: string) => sha256(`shop-doc:${docId}:${keyHash}`).slice(0, 40);

// What My orders shows: newest first, with the timeline and the documents.
export async function customerOrders(key: unknown) {
  const c = await customerFor(key);
  if (!c) return null;
  await db.shopCustomer.update({ where: { id: c.id }, data: { lastSeenAt: new Date() } });
  const orders = await db.shopOrder.findMany({
    where: { customerId: c.id }, orderBy: { createdAt: "desc" }, take: 100,
    include: { events: { orderBy: { at: "asc" } }, documents: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, fileName: true, createdAt: true } } },
  });
  return {
    customer: { name: c.name, phone: c.phone },
    orders: orders.map((o) => ({
      ref: o.ref, status: o.status, createdAt: o.createdAt, estimatedAt: o.status === "TO_DELIVER" ? o.estimatedAt : null,
      deliveredAt: o.deliveredAt, cancelReason: o.status === "CANCELLED" ? o.cancelReason : "",
      total: Number(o.total), lines: o.lines as LineT[],
      events: o.events.map((e) => ({ status: e.status, at: e.at, estimatedAt: e.estimatedAt, note: e.note })),
      documents: o.documents.map((d) => ({ kind: d.kind, name: d.fileName, at: d.createdAt, url: `/api/shop/orders/doc/${d.id}?t=${docToken(d.id, c.keyHash)}` })),
    })),
  };
}

export async function documentForCustomer(docId: string, token: string) {
  const d = await db.shopOrderDocument.findUnique({ where: { id: docId }, include: { order: { select: { customer: { select: { keyHash: true } } } } } });
  if (!d || !token || !safeEqual(docToken(d.id, d.order.customer.keyHash), token)) return null;
  return d;
}

// ---- Command Center ----

function assertStaff(user: User) {
  if (!can(user.role, "shop.orders")) throw new UserError("You can't manage shop orders.", "forbidden");
}

export const OPEN_STATUSES: ShopOrderStatus[] = ["PLACED", "CONFIRMED", "TO_DELIVER"];

export function listShopOrders(user: User, f: { status?: ShopOrderStatus[]; q?: string } = {}) {
  assertStaff(user);
  const q = f.q?.trim();
  return db.shopOrder.findMany({
    where: {
      ...(f.status ? { status: { in: f.status } } : {}),
      ...(q ? { OR: [{ ref: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }, { customer: { phone: { contains: cleanPhone(q) || q } } }] } : {}),
    },
    orderBy: { createdAt: "desc" }, take: 200,
    include: { customer: { select: { name: true, phone: true } }, _count: { select: { documents: true } } },
  });
}

export async function getShopOrder(user: User, id: string) {
  assertStaff(user);
  const o = await db.shopOrder.findUnique({
    where: { id },
    include: {
      customer: { include: { _count: { select: { orders: true, phones: true } } } },
      events: { orderBy: { at: "asc" } },
      documents: { orderBy: { createdAt: "asc" }, select: { id: true, kind: true, fileName: true, sizeBytes: true, uploadedBy: true, createdAt: true } },
    },
  });
  if (!o) throw new UserError("Order not found.", "not_found");
  return { ...o, lines: o.lines as LineT[] };
}

const StatusSchema = z.object({
  status: z.enum(["PLACED", "CONFIRMED", "TO_DELIVER", "DELIVERED", "CANCELLED"]),
  estimatedAt: z.date().nullable().default(null),
  note: z.string().trim().max(300).default(""),
});

const etaText = (d: Date, lang: string) =>
  d.toLocaleString(lang === "ar" ? "ar-LB" : "en-GB", { timeZone: "Asia/Beirut", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function statusMessage(ref: string, status: ShopOrderStatus, lang: string, eta: Date | null, note: string) {
  const ar = lang === "ar";
  const lines: Record<ShopOrderStatus, [string, string]> = {
    PLACED: [`We received order ${ref}.`, `استلمنا طلبك ${ref}.`],
    CONFIRMED: [`Your order ${ref} is confirmed.`, `تم تأكيد طلبك ${ref}.`],
    TO_DELIVER: [`Your order ${ref} is on its way${eta ? `, expected ${etaText(eta, "en")}` : ""}.`, `طلبك ${ref} قيد التوصيل${eta ? `، الموعد المتوقع ${etaText(eta, "ar")}` : ""}.`],
    DELIVERED: [`Your order ${ref} was delivered. Thank you!`, `تم تسليم طلبك ${ref}. شكراً لك!`],
    CANCELLED: [`Your order ${ref} was cancelled${note ? `: ${note}` : "."}`, `تم إلغاء طلبك ${ref}${note ? `: ${note}` : "."}`],
  };
  return { title: "Medora Care", body: lines[status][ar ? 1 : 0] };
}

export async function setShopOrderStatus(user: User, id: string, raw: unknown) {
  assertStaff(user);
  const s = StatusSchema.parse(raw);
  const o = await db.shopOrder.findUnique({ where: { id }, include: { customer: true } });
  if (!o) throw new UserError("Order not found.", "not_found");
  if (s.status === "TO_DELIVER" && s.estimatedAt && s.estimatedAt.getTime() < Date.now() - 6 * 3600_000) throw new UserError("The estimated delivery time is in the past.");
  if (s.status === o.status && s.status !== "TO_DELIVER") throw new UserError(`It is already ${SHOP_STATUS[s.status].label.toLowerCase()}.`);
  const now = new Date();
  const updated = await db.shopOrder.update({
    where: { id },
    data: {
      status: s.status,
      estimatedAt: s.status === "TO_DELIVER" ? s.estimatedAt : s.status === "DELIVERED" ? o.estimatedAt : null,
      cancelReason: s.status === "CANCELLED" ? s.note : "",
      ...(s.status === "CONFIRMED" && !o.confirmedAt ? { confirmedAt: now } : {}),
      ...(s.status === "DELIVERED" ? { deliveredAt: now } : {}),
      ...(s.status === "CANCELLED" ? { cancelledAt: now } : {}),
      events: { create: { status: s.status, estimatedAt: s.status === "TO_DELIVER" ? s.estimatedAt : null, note: s.note, byName: user.name } },
    },
  });
  const m = statusMessage(o.ref, s.status, o.customer.lang, s.status === "TO_DELIVER" ? s.estimatedAt : null, s.note);
  const phones = await sendToCustomer(o.customerId, { ...m, url: "/shop#my-orders", tag: "order-" + o.ref });
  return { order: updated, phones };
}

export async function addShopOrderDocument(user: User, id: string, f: { kind: string; fileName: string; mimeType: string; bytes: Uint8Array }) {
  assertStaff(user);
  if (f.kind !== "PROFORMA" && f.kind !== "INVOICE") throw new UserError("Choose pro forma or invoice.");
  const ext = DOC_TYPES[f.mimeType];
  if (!ext) throw new UserError("Upload a PDF, or a PNG or JPG picture.");
  if (!f.bytes.length) throw new UserError("That file is empty.");
  if (f.bytes.length > MAX_DOC_BYTES) throw new UserError("The file is larger than 4 MB.");
  const o = await db.shopOrder.findUnique({ where: { id }, include: { customer: true } });
  if (!o) throw new UserError("Order not found.", "not_found");
  const base = f.fileName.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/\s+/g, " ").trim().slice(0, 80) || `${f.kind === "PROFORMA" ? "Proforma" : "Invoice"}-${o.ref}`;
  const doc = await db.shopOrderDocument.create({
    data: { orderId: id, kind: f.kind, fileName: `${base}.${ext}`, mimeType: f.mimeType, sizeBytes: f.bytes.length, data: Buffer.from(f.bytes), uploadedBy: user.name },
    select: { id: true, kind: true, fileName: true },
  });
  const ar = o.customer.lang === "ar";
  const kind = DOC_KIND[f.kind as DocKind];
  const phones = await sendToCustomer(o.customerId, {
    title: "Medora Care",
    body: ar ? `${kind.ar} لطلبك ${o.ref} جاهزة في «طلباتي».` : `Your ${kind.label.toLowerCase()} for order ${o.ref} is ready in My orders.`,
    url: "/shop#my-orders", tag: "doc-" + doc.id,
  });
  return { doc, phones };
}

export async function removeShopOrderDocument(user: User, docId: string) {
  assertStaff(user);
  const d = await db.shopOrderDocument.findUnique({ where: { id: docId }, select: { id: true, orderId: true, fileName: true } });
  if (!d) throw new UserError("Document not found.", "not_found");
  await db.shopOrderDocument.delete({ where: { id: docId } });
  return d;
}

export async function documentForStaff(user: User, docId: string) {
  assertStaff(user);
  return db.shopOrderDocument.findUnique({ where: { id: docId } });
}

const StaffOrderSchema = z.object({
  name: z.string().trim().min(1, "Enter the customer's name").max(100),
  phone: Phone,
  lines: z.array(Line).min(1, "Add at least one item").max(300),
  note: z.string().trim().max(500).default(""),
});

// An order that came in by phone or WhatsApp, entered by staff so it shows in the customer's My orders.
// It goes to the latest customer with the same phone number, or a new one.
export async function createStaffShopOrder(user: User, raw: unknown) {
  assertStaff(user);
  const o = StaffOrderSchema.parse(raw);
  let customer = await db.shopCustomer.findFirst({ where: { phone: o.phone }, orderBy: { lastSeenAt: { sort: "desc", nulls: "last" } } });
  if (!customer) {
    const key = randomToken(32);
    customer = await db.shopCustomer.create({ data: { keyHash: sha256(key), keyEnc: encrypt(key), name: o.name, phone: o.phone } });
  }
  let ref = newRef();
  while (await db.shopOrder.findUnique({ where: { ref }, select: { id: true } })) ref = newRef();
  return db.shopOrder.create({
    data: {
      ref, customerId: customer.id, source: "staff", status: "CONFIRMED", confirmedAt: new Date(),
      lines: o.lines as Prisma.InputJsonValue, total: total(o.lines), note: o.note,
      events: { create: [{ status: "PLACED", byName: user.name, note: "Entered by Medora" }, { status: "CONFIRMED", byName: user.name }] },
    },
  });
}

// The link that opens My orders on the customer's phone (staff send it on WhatsApp).
export async function customerLink(user: User, customerId: string, origin: string) {
  assertStaff(user);
  const c = await db.shopCustomer.findUnique({ where: { id: customerId }, select: { keyEnc: true } });
  if (!c) throw new UserError("Customer not found.", "not_found");
  return `${origin}/shop?mo=${encodeURIComponent(decrypt(c.keyEnc))}#my-orders`;
}

// Serves a stored document. inline: phones open PDFs in their viewer.
export function fileResponse(d: { data: Uint8Array; mimeType: string; fileName: string }) {
  return new Response(Buffer.from(d.data), {
    headers: {
      "content-type": d.mimeType,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.fileName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
