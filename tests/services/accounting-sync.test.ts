import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { createClient, createOrder, reviewOrder, saveProduct } from "@/lib/services/sales";
import { backoffMs, pushApprovedOrders, retrySync } from "@/lib/services/accountingSync";
import { makeUser, reset } from "./helpers";

beforeEach(reset);
afterEach(() => { delete process.env.ACCOUNTING_WEBHOOK_URL; delete process.env.ACCOUNTING_WEBHOOK_SECRET; });

type Call = { url: string; init: RequestInit };
const fakeFetch = (statuses: number[], calls: Call[]) => (async (url: string, init: RequestInit) => {
  calls.push({ url, init });
  const s = statuses.shift() ?? 200;
  return new Response("", { status: s });
}) as unknown as typeof fetch;

async function approvedOrder() {
  const acc = await makeUser("ACCOUNTANT", "Lina"), rep = await makeUser("STAFF", "Rami");
  const p = await saveProduct(acc, { sku: "GLV-M", name: "Gloves M", unit: "box", price: 6.5 });
  const c = await createClient(rep, { name: "Dr Chaito", location: { lat: 33.5, lng: 35.3, accuracy: 5 } });
  const o = await createOrder(rep, { contactId: c.id, lines: [{ productId: p.id, quantity: 10 }] });
  const line = await db.salesOrderLine.findFirstOrThrow({ where: { orderId: o.id } });
  await reviewOrder(acc, o.id, { decision: "APPROVE", note: "Tender price", lines: [{ id: line.id, quantity: 12, unitPrice: 6 }] });
  return { acc, rep, order: o };
}

describe("sending approved orders to accounting", () => {
  it("queues approved orders and waits while nothing is configured", async () => {
    const { order } = await approvedOrder();
    expect(await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ syncStatus: "pending" });
    const calls: Call[] = [];
    expect(await pushApprovedOrders(new Date(), fakeFetch([], calls))).toEqual({ sent: 0, failed: 0 });
    expect(calls).toHaveLength(0);
  });

  it("posts a signed, idempotent payload with the approved lines", async () => {
    process.env.ACCOUNTING_WEBHOOK_URL = "https://books.example/hook";
    process.env.ACCOUNTING_WEBHOOK_SECRET = "s3cret";
    const { order } = await approvedOrder();
    const calls: Call[] = [];
    expect(await pushApprovedOrders(new Date(), fakeFetch([200], calls))).toEqual({ sent: 1, failed: 0 });
    const { init } = calls[0];
    const body = init.body as string, h = init.headers as Record<string, string>;
    expect(h["X-Medora-Signature"]).toBe(`sha256=${createHmac("sha256", "s3cret").update(body).digest("hex")}`);
    expect(h["Idempotency-Key"]).toBe(order.id);
    const p = JSON.parse(body);
    expect(p).toMatchObject({ event: "order.approved", number: order.number, total: 72, client: { name: "Dr Chaito" }, approvedBy: { name: "Lina" }, accountingNote: "Tender price" });
    expect(p.lines[0]).toMatchObject({ sku: "GLV-M", quantity: 12, unitPrice: 6, requestedQuantity: 10, requestedUnitPrice: 6.5, lineTotal: 72 });
    expect(await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ syncStatus: "sent", syncAttempts: 1 });
    expect(await pushApprovedOrders(new Date(), fakeFetch([200], calls))).toEqual({ sent: 0, failed: 0 }); // never twice
  });

  it("backs off on errors, gives up after ten tries, tells accounting, and can be resent", async () => {
    process.env.ACCOUNTING_WEBHOOK_URL = "https://books.example/hook";
    process.env.ACCOUNTING_WEBHOOK_SECRET = "s3cret";
    const { acc, order } = await approvedOrder();
    const calls: Call[] = [];
    let now = new Date();
    await pushApprovedOrders(now, fakeFetch([503], calls));
    let row = await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({ syncStatus: "pending", syncAttempts: 1 });
    expect(row.syncError).toMatch(/503/);
    expect(row.nextSyncAt!.getTime() - now.getTime()).toBe(backoffMs(1));
    expect(await pushApprovedOrders(now, fakeFetch([200], calls))).toEqual({ sent: 0, failed: 0 }); // not due yet
    for (let i = 2; i <= 10; i++) { now = new Date(now.getTime() + 7 * 3600e3); await pushApprovedOrders(now, fakeFetch([500], calls)); }
    row = await db.salesOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row).toMatchObject({ syncStatus: "failed", syncAttempts: 10 });
    expect(await db.notification.count({ where: { userId: acc.id, title: { contains: "didn't reach" } } })).toBe(1);
    await retrySync(acc, order.id);
    expect(await pushApprovedOrders(new Date(), fakeFetch([200], calls))).toEqual({ sent: 1, failed: 0 });
  });

  it("doesn't queue rejected orders", async () => {
    const acc = await makeUser("ACCOUNTANT"), rep = await makeUser("STAFF");
    const c = await createClient(rep, { name: "X" });
    const o = await createOrder(rep, { contactId: c.id, lines: [{ description: "Gauze", quantity: 1, unitPrice: 2 }] });
    await reviewOrder(acc, o.id, { decision: "REJECT", note: "No stock" });
    expect((await db.salesOrder.findUniqueOrThrow({ where: { id: o.id } })).syncStatus).toBe("");
    await expect(retrySync(acc, o.id)).rejects.toThrow(/approved/);
  });
});
