import { beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { db } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { injectPush, saveSubscriber } from "@/lib/services/push";
import {
  addShopOrderDocument, createStaffShopOrder, customerLink, customerOrders, documentForCustomer, getShopOrder,
  listShopOrders, placeShopOrder, removeShopOrderDocument, setShopOrderStatus,
} from "@/lib/services/shopOrders";
import { makeUser, reset } from "./helpers";

beforeEach(async () => { await reset(); vi.restoreAllMocks(); });

const KEY = randomToken(32);
const order = (over: Record<string, unknown> = {}) => ({
  key: KEY, ref: "MC-ABC234", name: "Pharmacy Nour", phone: "+961 3 123 456", lang: "ar",
  lines: [{ code: "RH-012", name: "Gauze 10x10", nameAr: "شاش", qty: 3, price: 2.5 }, { code: "RH-317", name: "Underpad", qty: 1 }],
  ...over,
});
const pdf = new TextEncoder().encode("%PDF-1.4 test");
const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/phone1", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
const pushOk = () => vi.spyOn(webpush, "sendNotification").mockResolvedValue({ statusCode: 201, body: "", headers: {} });

describe("My orders", () => {
  it("saves an order sent from the shop once, and tells the staff who handle shop orders", async () => {
    const owner = await makeUser("OWNER"), acc = await makeUser("ACCOUNTANT"), rep = await makeUser("SALESPERSON");
    const a = await placeShopOrder(order());
    const again = await placeShopOrder(order()); // a retry after a bad connection
    expect(again.id).toBe(a.id);
    expect(await db.shopOrder.count()).toBe(1);
    expect(a).toMatchObject({ status: "PLACED", ref: "MC-ABC234" });
    expect(Number(a.total)).toBe(7.5);
    const c = await db.shopCustomer.findFirstOrThrow();
    expect(c).toMatchObject({ name: "Pharmacy Nour", phone: "+9613123456", lang: "ar" });
    expect(c.keyHash).not.toContain(KEY);
    expect(c.keyEnc).not.toContain(KEY);
    expect(await db.notification.count({ where: { userId: { in: [owner.id, acc.id] }, kind: "shop_order" } })).toBe(2);
    expect(await db.notification.count({ where: { userId: rep.id } })).toBe(0);
  });

  it("refuses bad orders and someone else's reference", async () => {
    await expect(placeShopOrder(order({ key: "short" }))).rejects.toThrow();
    await expect(placeShopOrder(order({ lines: [] }))).rejects.toThrow();
    await expect(placeShopOrder(order({ phone: "12" }))).rejects.toThrow();
    await placeShopOrder(order());
    await expect(placeShopOrder(order({ key: randomToken(32) }))).rejects.toThrow(/taken/);
  });

  it("shows a customer only their own orders, with status, expected time and documents", async () => {
    const staff = await makeUser("MANAGER", "Rami");
    const mine = await placeShopOrder(order());
    await placeShopOrder(order({ key: randomToken(32), ref: "MC-ZZZ999", name: "Someone else" }));
    expect(await customerOrders("not-a-key")).toBeNull();
    expect(await customerOrders(randomToken(32))).toBeNull();

    const eta = new Date(Date.now() + 86400_000);
    await setShopOrderStatus(staff, mine.id, { status: "CONFIRMED" });
    await setShopOrderStatus(staff, mine.id, { status: "TO_DELIVER", estimatedAt: eta });
    const { doc } = await addShopOrderDocument(staff, mine.id, { kind: "PROFORMA", fileName: "PF-2026-0007.pdf", mimeType: "application/pdf", bytes: pdf });

    const view = (await customerOrders(KEY))!;
    expect(view.customer).toEqual({ name: "Pharmacy Nour", phone: "+9613123456" });
    expect(view.orders).toHaveLength(1);
    const o = view.orders[0];
    expect(o).toMatchObject({ ref: "MC-ABC234", status: "TO_DELIVER" });
    expect(o.estimatedAt?.getTime()).toBe(eta.getTime());
    expect(o.events.map((e) => e.status)).toEqual(["PLACED", "CONFIRMED", "TO_DELIVER"]);
    expect(o.lines[0]).toMatchObject({ code: "RH-012", qty: 3 });
    expect(o.documents).toEqual([expect.objectContaining({ kind: "PROFORMA", name: "PF-2026-0007.pdf" })]);

    // The document link opens that one file, and nothing without its token.
    const token = new URL(o.documents[0].url, "https://x").searchParams.get("t")!;
    expect((await documentForCustomer(doc.id, token))?.fileName).toBe("PF-2026-0007.pdf");
    expect(await documentForCustomer(doc.id, "")).toBeNull();
    expect(await documentForCustomer(doc.id, token.replace(/.$/, (c) => (c === "a" ? "b" : "a")))).toBeNull();
  });

  it("notifies the customer's phone when the status changes or a document is attached", async () => {
    const staff = await makeUser("ACCOUNTANT");
    const o = await placeShopOrder(order());
    await saveSubscriber(sub, "ar", "", KEY);
    expect((await db.pushSubscriber.findFirstOrThrow()).customerId).not.toBeNull();
    const spy = pushOk();
    const r = await setShopOrderStatus(staff, o.id, { status: "DELIVERED" });
    expect(r.phones).toBe(1);
    expect(JSON.parse(spy.mock.calls[0][1] as string)).toMatchObject({ url: "/shop#my-orders", body: expect.stringContaining("MC-ABC234") });
    await addShopOrderDocument(staff, o.id, { kind: "INVOICE", fileName: "inv.pdf", mimeType: "application/pdf", bytes: pdf });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(JSON.parse(spy.mock.calls[1][1] as string).body).toContain("فاتورة");
  });

  it("keeps status changes sensible and records cancellations with the reason", async () => {
    const staff = await makeUser("OWNER");
    const o = await placeShopOrder(order());
    await expect(setShopOrderStatus(staff, o.id, { status: "PLACED" })).rejects.toThrow(/already/);
    await expect(setShopOrderStatus(staff, o.id, { status: "TO_DELIVER", estimatedAt: new Date(Date.now() - 86400_000) })).rejects.toThrow(/past/);
    await setShopOrderStatus(staff, o.id, { status: "CANCELLED", note: "Out of stock" });
    const view = (await customerOrders(KEY))!;
    expect(view.orders[0]).toMatchObject({ status: "CANCELLED", cancelReason: "Out of stock" });
    expect(await listShopOrders(staff, { status: ["CANCELLED"] })).toHaveLength(1);
    expect(await listShopOrders(staff, { q: "3123" })).toHaveLength(1);
  });

  it("only takes PDFs and pictures up to 4 MB, and can remove them", async () => {
    const staff = await makeUser("OWNER");
    const o = await placeShopOrder(order());
    await expect(addShopOrderDocument(staff, o.id, { kind: "PROFORMA", fileName: "x.html", mimeType: "text/html", bytes: pdf })).rejects.toThrow(/PDF/);
    await expect(addShopOrderDocument(staff, o.id, { kind: "OTHER", fileName: "x.pdf", mimeType: "application/pdf", bytes: pdf })).rejects.toThrow();
    await expect(addShopOrderDocument(staff, o.id, { kind: "INVOICE", fileName: "x.pdf", mimeType: "application/pdf", bytes: new Uint8Array(4_000_001) })).rejects.toThrow(/4 MB/);
    const { doc } = await addShopOrderDocument(staff, o.id, { kind: "INVOICE", fileName: "../../Invoice <1>.PDF", mimeType: "application/pdf", bytes: pdf });
    expect(doc.fileName).toBe(".. .. Invoice 1.pdf");
    await removeShopOrderDocument(staff, doc.id);
    expect((await getShopOrder(staff, o.id)).documents).toHaveLength(0);
  });

  it("is only for staff who handle shop orders", async () => {
    const rep = await makeUser("SALESPERSON"), viewer = await makeUser("VIEWER");
    const o = await placeShopOrder(order());
    await expect(setShopOrderStatus(rep, o.id, { status: "CONFIRMED" })).rejects.toThrow(/can't/);
    await expect(getShopOrder(viewer, o.id)).rejects.toThrow(/can't/);
  });

  it("puts an order entered by staff in the same My orders as the customer's phone, and makes the link", async () => {
    const staff = await makeUser("MANAGER");
    await placeShopOrder(order());
    const o = await createStaffShopOrder(staff, { name: "Nour", phone: "+961 3 123-456", lines: [{ code: "RH-001", name: "Gloves", qty: 2 }] });
    expect(o).toMatchObject({ status: "CONFIRMED", source: "staff" });
    expect((await customerOrders(KEY))!.orders.map((x) => x.ref)).toContain(o.ref);
    const link = await customerLink(staff, o.customerId, "https://shop.example");
    expect(link).toBe(`https://shop.example/shop?mo=${KEY}#my-orders`);
    // A new phone number gets its own customer, whose link opens only their orders.
    const other = await createStaffShopOrder(staff, { name: "Clinic", phone: "70 999 888", lines: [{ name: "Syringes", qty: 5 }] });
    const k = new URL(await customerLink(staff, other.customerId, "https://shop.example")).searchParams.get("mo")!;
    expect((await customerOrders(k))!.orders.map((x) => x.ref)).toEqual([other.ref]);
  });

  it("adds My orders to every shop page the site serves", () => {
    const out = injectPush("<html><head></head><body><p>shop</p></body></html>", "KEY");
    expect(out).toContain('<script src="/shop-orders.js" defer></script></body>');
  });
});
