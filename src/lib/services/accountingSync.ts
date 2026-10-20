import { createHmac } from "node:crypto";
import type { User } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { log } from "../log";
import { can } from "../rbac";
import { UserError } from "./errors";
import { notify } from "./notifications";

// Approved orders and proforma requests are sent on to the company's accounting system as a signed
// JSON POST. The receiver checks X-Medora-Signature (HMAC-SHA256 of the raw body with the shared secret)
// and uses Idempotency-Key so a retried delivery never books the same order twice.

const MAX_ATTEMPTS = 10;
const CLAIM_MS = 5 * 60_000;

export function accountingTarget(): { url: string; secret: string } | null {
  const url = process.env.ACCOUNTING_WEBHOOK_URL?.trim();
  const secret = process.env.ACCOUNTING_WEBHOOK_SECRET?.trim();
  if (!url || !secret) return null;
  return { url, secret };
}
export const accountingConnected = () => accountingTarget() !== null;

export const sign = (body: string, secret: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

// Minutes to wait after the nth failure: 1, 2, 4 … capped at 6 hours.
export const backoffMs = (attempt: number) => Math.min(2 ** Math.max(0, attempt - 1), 360) * 60_000;

async function payload(id: string) {
  const o = await db.salesOrder.findUniqueOrThrow({
    where: { id },
    include: {
      contact: true, rep: { select: { name: true, email: true } }, reviewedBy: { select: { name: true, email: true } },
      lines: { orderBy: { position: "asc" }, include: { product: { select: { sku: true, unit: true } } } },
    },
  });
  return {
    event: o.kind === "ORDER" ? "order.approved" : "proforma.approved",
    id: o.id, number: o.number, kind: o.kind.toLowerCase(), currency: "USD",
    createdAt: o.createdAt.toISOString(), approvedAt: o.reviewedAt?.toISOString() ?? null,
    approvedBy: o.reviewedBy, rep: o.rep,
    client: {
      id: o.contact.id, name: o.contact.name, type: o.contact.placeType, phone: o.contact.phone, email: o.contact.email,
      address: o.contact.address, lat: o.contact.lat, lng: o.contact.lng,
    },
    lines: o.lines.map((l) => ({
      sku: l.product?.sku ?? null, description: l.description, unit: l.product?.unit ?? "unit",
      quantity: l.quantity, unitPrice: Number(l.unitPrice), lineTotal: Math.round(l.quantity * Number(l.unitPrice) * 100) / 100,
      requestedQuantity: l.requestedQty, requestedUnitPrice: Number(l.requestedPrice),
    })),
    total: Number(o.total), repNotes: o.notes, accountingNote: o.reviewNote,
  };
}

// One delivery pass, run by the scheduled jobs. Does nothing until the accounting system is configured;
// approved orders wait as "pending" and go out once it is.
export async function pushApprovedOrders(now = new Date(), send: typeof fetch = fetch) {
  const target = accountingTarget();
  if (!target) return { sent: 0, failed: 0 };
  const due = await db.salesOrder.findMany({ where: { syncStatus: "pending", nextSyncAt: { lte: now } }, select: { id: true, nextSyncAt: true, syncAttempts: true }, orderBy: { nextSyncAt: "asc" }, take: 10 });
  let sent = 0, failed = 0;
  for (const d of due) {
    // Claim the row so a second runner (cron and an open tab at once) skips it.
    const claimed = await db.salesOrder.updateMany({ where: { id: d.id, syncStatus: "pending", nextSyncAt: d.nextSyncAt }, data: { nextSyncAt: new Date(now.getTime() + CLAIM_MS) } });
    if (claimed.count === 0) continue;
    const body = JSON.stringify(await payload(d.id));
    let error = "";
    try {
      const r = await send(target.url, {
        method: "POST", body, signal: AbortSignal.timeout(15_000),
        headers: { "Content-Type": "application/json", "User-Agent": "Medora-Command-Center", "X-Medora-Event": JSON.parse(body).event, "X-Medora-Signature": sign(body, target.secret), "Idempotency-Key": d.id },
      });
      if (!r.ok) error = `The accounting system answered ${r.status}${r.statusText ? ` ${r.statusText}` : ""}.`;
    } catch (e) {
      error = e instanceof Error && e.name === "TimeoutError" ? "The accounting system didn't answer within 15 seconds." : `Couldn't reach the accounting system (${e instanceof Error ? e.message : String(e)}).`;
    }
    const attempts = d.syncAttempts + 1;
    if (!error) {
      await db.salesOrder.update({ where: { id: d.id }, data: { syncStatus: "sent", syncedAt: new Date(), syncError: "", syncAttempts: attempts, nextSyncAt: null } });
      await audit({ actorKind: "worker", action: "order.sync_sent", entity: "sales_order", entityId: d.id, meta: { attempts } });
      sent++;
      continue;
    }
    const giveUp = attempts >= MAX_ATTEMPTS;
    await db.salesOrder.update({ where: { id: d.id }, data: { syncStatus: giveUp ? "failed" : "pending", syncAttempts: attempts, syncError: error.slice(0, 500), nextSyncAt: giveUp ? null : new Date(now.getTime() + backoffMs(attempts)) } });
    log.error("accounting.sync_failed", { order: d.id, attempts, error });
    if (giveUp) {
      failed++;
      await audit({ actorKind: "worker", action: "order.sync_failed", entity: "sales_order", entityId: d.id, meta: { attempts, error } });
      const o = await db.salesOrder.findUniqueOrThrow({ where: { id: d.id }, select: { number: true } });
      const users = await db.user.findMany({ where: { disabledAt: null }, select: { id: true, role: true } });
      for (const u of users.filter((x) => can(x.role, "sales.review"))) {
        await notify(u.id, { kind: "order", title: `Order #${o.number} didn't reach the accounting system`, body: error, link: `/sales/orders/${d.id}` });
      }
    }
  }
  return { sent, failed };
}

export async function retrySync(a: Pick<User, "id" | "role">, id: string) {
  if (!can(a.role, "sales.review")) throw new UserError("Only accounting can resend orders.", "forbidden");
  const n = await db.salesOrder.updateMany({ where: { id, status: "APPROVED", syncStatus: { in: ["failed", "pending"] } }, data: { syncStatus: "pending", nextSyncAt: new Date(), syncAttempts: 0, syncError: "" } });
  if (n.count === 0) throw new UserError("Only approved orders that haven't been sent can be resent.");
  await audit({ actorId: a.id, action: "order.sync_retry", entity: "sales_order", entityId: id });
}
