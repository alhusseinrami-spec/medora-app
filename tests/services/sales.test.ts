import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { distanceM, nearestRoute } from "@/lib/geo";
import {
  cancelOrder, checkIn, checkInNearest, countKnownLeads, createClient, createOrder, importLeads, importProducts, listClients, listProducts, readNumber, listOrders, relocateClient,
  reviewOrder, saveProduct, setFollowUp, todayFor, updateClient, visitsBoard,
} from "@/lib/services/sales";
import { makeUser, reset } from "./helpers";
import { LEAD_LISTS } from "@/lib/leadLists";
import { findHeader, guessMapping, parseCsv, stockLooksUnused } from "@/components/sales/importSheet";

beforeEach(reset);

// Saida, and a point about 50 m north of it, and one about 2 km away.
const CLINIC = { lat: 33.5606, lng: 35.3714 };
const NEAR = { lat: 33.56105, lng: 35.3714, accuracy: 12 };
const FAR = { lat: 33.578, lng: 35.3714, accuracy: 12 };

describe("geo", () => {
  it("measures metres and orders a route nearest-first", () => {
    expect(Math.round(distanceM(CLINIC, NEAR))).toBe(50);
    const stops = [{ id: "far", lat: 33.9, lng: 35.5 }, { id: "none", lat: null, lng: null }, { id: "near", lat: 33.57, lng: 35.37 }];
    expect(nearestRoute(CLINIC, stops).map((s) => s.id)).toEqual(["near", "far", "none"]);
  });
});

describe("clients and visits", () => {
  it("adds a client where the rep stands and verifies check-ins by distance", async () => {
    const rep = await makeUser("STAFF", "Rep");
    const c = await createClient(rep, { name: "Dr Maroun", placeType: "Clinic", location: { ...CLINIC, accuracy: 8 } });
    expect(c).toMatchObject({ stage: "LEAD", category: "CUSTOMER", lat: CLINIC.lat, ownerId: rep.id });

    const near = await checkIn(rep, c.id, NEAR);
    expect(near.visit.verified).toBe(true);
    expect(Math.round(near.visit.distanceM!)).toBe(50);
    expect((await checkIn(rep, c.id, NEAR)).duplicate).toBe(true);

    await db.visit.deleteMany();
    const far = await checkIn(rep, c.id, FAR);
    expect(far.visit.verified).toBe(false);
    await db.visit.deleteMany();
    expect((await checkIn(rep, c.id, { ...NEAR, accuracy: 400 })).visit.verified).toBe(false); // fix too vague
  });

  it("gives a client with no pin the first check-in's location, unverified", async () => {
    const rep = await makeUser("STAFF");
    const c = await createClient(rep, { name: "Al Hekmeh hospital" });
    const r = await checkIn(rep, c.id, NEAR);
    expect(r.visit.verified).toBe(false);
    expect((await db.contact.findUniqueOrThrow({ where: { id: c.id } })).lat).toBe(NEAR.lat);
  });

  it("shares clients across reps but stops them editing another rep's client or moving a saved pin", async () => {
    const a = await makeUser("STAFF"), b = await makeUser("STAFF"), mgr = await makeUser("MANAGER");
    const c = await createClient(a, { name: "Dr Kamil", location: { ...CLINIC, accuracy: 5 } });
    expect(await listClients(b)).toHaveLength(1);
    expect(await listClients(mgr)).toHaveLength(1);
    expect((await checkIn(b, c.id, NEAR)).visit.verified).toBe(true);
    await expect(updateClient(b, c.id, { stage: "CUSTOMER" })).rejects.toThrow(/client's rep/);
    await expect(relocateClient(a, c.id, NEAR)).rejects.toThrow(/manager/);
    await relocateClient(mgr, c.id, NEAR);
    await updateClient(a, c.id, { stage: "PROSPECT" });
    expect((await listClients(a, { stage: "PROSPECT" })).map((x) => x.id)).toEqual([c.id]);
    const viewer = await makeUser("ACCOUNTANT");
    await expect(createClient(viewer, { name: "x" })).rejects.toThrow(/doesn't use/);
  });

  it("logs a visit at the nearest client, and builds the manager's board", async () => {
    const rep = await makeUser("STAFF", "Rami"), mgr = await makeUser("MANAGER");
    await createClient(rep, { name: "Far away", location: { lat: 34.4, lng: 35.8, accuracy: 5 } });
    const c = await createClient(rep, { name: "Dr Dbouk", location: { ...CLINIC, accuracy: 5 } });
    const r = await checkInNearest(rep, NEAR);
    expect(r.found && r.client.id).toBe(c.id);
    expect((await checkInNearest(rep, { lat: 33.0, lng: 35.2, accuracy: 5 })).found).toBe(false);

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
    const board = await visitsBoard(mgr, today);
    const row = board.find((x) => x.rep.id === rep.id)!;
    expect(row).toMatchObject({ verified: 1 });
    expect(row.visits[0].contact.name).toBe("Dr Dbouk");
    await expect(visitsBoard(rep, today)).rejects.toThrow(/managers/);
    expect((await todayFor(rep)).verifiedToday).toBe(1);
  });

  it("sets a follow-up that lands in the rep's reminders and on today's route", async () => {
    const rep = await makeUser("STAFF");
    const c = await createClient(rep, { name: "Dt Yassmina", stage: "CUSTOMER" });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Beirut" }).format(new Date());
    await setFollowUp(rep, c.id, today, "00:01");
    expect(await db.reminder.findFirst({ where: { userId: rep.id } })).toMatchObject({ title: "Follow up: Dt Yassmina" });
    const t = await todayFor(rep);
    expect(t.route.map((x) => x.id)).toEqual([c.id]);
    expect(t.route[0].due).toBe(true);
  });
});

describe("orders and proformas", () => {
  async function setup() {
    const owner = await makeUser("OWNER", "Owner"), acc = await makeUser("ACCOUNTANT", "Accounting"), rep = await makeUser("STAFF", "Rep");
    const gloves = await saveProduct(acc, { sku: "GLV-M", name: "Nitrile gloves M", unit: "box", price: 6.5 });
    const client = await createClient(rep, { name: "Dr Chaito", location: { ...CLINIC, accuracy: 5 } });
    return { owner, acc, rep, gloves, client };
  }

  it("notifies accounting, who edits quantities and prices and approves; the rep is told", async () => {
    const { owner, acc, rep, gloves, client } = await setup();
    const o = await createOrder(rep, { contactId: client.id, lines: [{ productId: gloves.id, quantity: 10 }, { description: "Sharps container 5L", quantity: 2, unitPrice: 4 }] });
    expect(Number(o.total)).toBe(73);
    expect(await db.notification.count({ where: { userId: acc.id, kind: "order" } })).toBe(1);
    expect(await db.notification.count({ where: { userId: owner.id, kind: "order" } })).toBe(1);
    expect((await db.contact.findUniqueOrThrow({ where: { id: client.id } })).stage).toBe("CUSTOMER");

    const lines = await db.salesOrderLine.findMany({ where: { orderId: o.id }, orderBy: { position: "asc" } });
    await expect(reviewOrder(rep, o.id, { decision: "APPROVE" })).rejects.toThrow(/accounting/);
    const done = await reviewOrder(acc, o.id, { decision: "APPROVE", note: "Gloves at the tender price", lines: [{ id: lines[0].id, quantity: 20, unitPrice: 6 }, { id: lines[1].id, quantity: 0, unitPrice: 4 }] });
    expect(done).toMatchObject({ status: "APPROVED", edited: true, reviewedById: acc.id });
    expect(Number(done.total)).toBe(120);
    const kept = await db.salesOrderLine.findMany({ where: { orderId: o.id } });
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ quantity: 20, requestedQty: 10 });
    expect(await db.notification.findFirst({ where: { userId: rep.id } })).toMatchObject({ title: `Order #${o.number} approved with changes` });
    await expect(reviewOrder(acc, o.id, { decision: "REJECT", note: "x" })).rejects.toThrow(/already approved/);
    expect(await db.auditLog.count({ where: { entityId: o.id } })).toBe(2);
  });

  it("handles proforma requests, rejections with a reason, and cancelling", async () => {
    const { acc, rep, gloves, client } = await setup();
    const p = await createOrder(rep, { contactId: client.id, kind: "PROFORMA", lines: [{ productId: gloves.id, quantity: 100 }] });
    expect((await db.contact.findUniqueOrThrow({ where: { id: client.id } })).stage).toBe("PROSPECT");
    await expect(reviewOrder(acc, p.id, { decision: "REJECT" })).rejects.toThrow(/Say why/);
    await reviewOrder(acc, p.id, { decision: "REJECT", note: "Out of stock until November" });
    expect(await db.notification.findFirst({ where: { userId: rep.id } })).toMatchObject({ title: `Proforma request #${p.number} rejected` });

    const o = await createOrder(rep, { contactId: client.id, lines: [{ productId: gloves.id, quantity: 1 }] });
    const other = await makeUser("STAFF");
    expect(await listOrders(other)).toHaveLength(0);
    await expect(cancelOrder(other, o.id)).rejects.toThrow(/isn't visible/);
    await cancelOrder(rep, o.id);
    await expect(reviewOrder(acc, o.id, { decision: "APPROVE" })).rejects.toThrow(/already cancelled/);
    expect((await listOrders(acc, { status: ["SUBMITTED"] })).length).toBe(0);
  });

  it("refuses empty and invalid orders", async () => {
    const { rep, client, gloves } = await setup();
    await expect(createOrder(rep, { contactId: client.id, lines: [] })).rejects.toThrow(/at least one/);
    await expect(createOrder(rep, { contactId: client.id, lines: [{ productId: gloves.id, quantity: 1.5 }] })).rejects.toThrow(/whole numbers/);
    await expect(createOrder(rep, { contactId: client.id, lines: [{ description: "", quantity: 1 }] })).rejects.toThrow(/Describe/);
  });
});

describe("product import", () => {
  it("reads prices the way accounting exports write them", () => {
    expect(readNumber("$1,250.50")).toBe(1250.5);
    expect(readNumber("1.250,50")).toBe(1250.5);
    expect(readNumber("6,5")).toBe(6.5);
    expect(readNumber("1,250")).toBe(1250);
    expect(readNumber("12 pcs")).toBe(12);
    expect(readNumber(7.25)).toBe(7.25);
    expect(readNumber("")).toBeNull();
    expect(readNumber("n/a")).toBeNull();
  });

  it("adds new codes, updates existing ones, keeps stock when the cell is blank, and reports bad rows", async () => {
    const acc = await makeUser("ACCOUNTANT"), rep = await makeUser("STAFF");
    await saveProduct(acc, { sku: "GLV-M", name: "Gloves", unit: "box", price: 6, stock: 40, minStock: 10 });
    await saveProduct(acc, { sku: "OLD-1", name: "Discontinued", price: 1 });
    await expect(importProducts(rep, { rows: [{ sku: "X", name: "Y", price: 1 }] })).rejects.toThrow(/accounting/);

    const r = await importProducts(acc, {
      hideMissing: true,
      rows: [
        { sku: "GLV-M", name: "Nitrile gloves M", unit: "box", price: "6,50", stock: "" },
        { sku: "SYR-5", name: "Syringe 5ml", unit: "", price: "$0.12", stock: "3", minStock: 50 },
        { sku: "", name: "", price: "" },
        { sku: "NOP-1", name: "No price yet", price: "" },
        { sku: "BAD-1", name: "Unreadable price", price: "call us" },
        { sku: "SYR-5", name: "Syringe 5 ml", price: 0.15, stock: 4 },
      ],
    });
    expect(r).toMatchObject({ added: 2, updated: 1, hidden: 1, skipped: [{ row: 5, sku: "BAD-1", reason: "Price can't be read" }] });
    const all = await listProducts(false);
    const by = Object.fromEntries(all.map((p) => [p.sku, p]));
    expect(by["GLV-M"]).toMatchObject({ name: "Nitrile gloves M", stock: 40, minStock: 10, active: true });
    expect(Number(by["GLV-M"].price)).toBe(6.5);
    expect(by["SYR-5"]).toMatchObject({ name: "Syringe 5 ml", unit: "unit", stock: 4, minStock: null });
    expect(by["OLD-1"].active).toBe(false);
    expect(Number(by["NOP-1"].price)).toBe(0);
    await importProducts(acc, { rows: [{ sku: "GLV-M", name: "Nitrile gloves M", price: 7 }] });
    expect((await listProducts(false)).find((p) => p.sku === "GLV-M")?.unit).toBe("box"); // no unit column: unit kept
    await expect(importProducts(acc, { rows: [{ sku: "A", name: "B", price: "x" }] })).rejects.toThrow(/None of the rows/);
  });
});

describe("reading an export's columns", () => {
  it("picks the selling price, stock on hand and minimum stock, not their look-alikes", () => {
    const header = ["Ref", "Name", "Arabic name", "Category", "Unit", "Barcode", "Description", "Cost price", "Selling price", "Wholesale price", "Minimum selling price", "Minimum stock", "Reorder quantity", "Status", "Quantity"];
    const m = guessMapping(header);
    expect(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v == null ? null : header[v]]))).toEqual({
      sku: "Ref", name: "Name", unit: "Unit", price: "Selling price", stock: "Quantity", minStock: "Minimum stock",
    });
    expect(guessMapping(["Item Code", "Description", "UOM", "Qty On Hand", "Reorder Level", "Selling Price"])).toEqual({ sku: 0, name: 1, unit: 2, stock: 3, minStock: 4, price: 5 });
  });

  it("finds the header under a title row, reads quoted CSV, and spots an unused stock column", () => {
    const rows = parseCsv('\uFEFFItem list\nRef,Name,Selling price,Quantity\nA-1,"Syringe 1cc 25G x 1/2""",0.3375,0\nA-2,"Gloves, M",,0\n');
    const h = findHeader(rows);
    expect(h).toBe(1);
    expect(rows[2]).toEqual(["A-1", 'Syringe 1cc 25G x 1/2"', "0.3375", "0"]);
    expect(rows[3][1]).toBe("Gloves, M");
    expect(stockLooksUnused(rows, h, guessMapping(rows[h]).stock)).toBe(true);
    expect(stockLooksUnused([["Qty"], ["0"], ["4"]], 0, 0)).toBe(false);
  });
});

describe("prices by the piece", () => {
  it("keeps four decimals on catalogue and order prices", async () => {
    const acc = await makeUser("ACCOUNTANT"), rep = await makeUser("STAFF");
    await importProducts(acc, { rows: [{ sku: "SYR-1", name: "Syringe 1cc", price: "0.3375" }] });
    const p = (await listProducts()).find((x) => x.sku === "SYR-1")!;
    expect(Number(p.price)).toBe(0.3375);
    const client = await createClient(rep, { name: "Dr Piece" });
    const o = await createOrder(rep, { contactId: client.id, lines: [{ productId: p.id, quantity: 1000 }] });
    expect(Number(o.total)).toBe(337.5);
    expect(Number((await db.salesOrderLine.findFirstOrThrow({ where: { orderId: o.id } })).unitPrice)).toBe(0.3375);
  });
});

describe("lead lists", () => {
  const rows = [
    { name: "Srour Pharmacy", placeType: "Pharmacy", phone: "07/740328", address: "Tyre" },
    { name: "Nahouli Pharmacy", placeType: "Pharmacy", phone: "07-734167", address: "Saida" },
    { name: "Manana Medical", placeType: "Medical supplies", phone: "", address: "Zahrani" },
  ];

  it("adds a list as shared leads once, skipping places already in the CRM", async () => {
    const boss = await makeUser("MANAGER", "Boss");
    await createClient(boss, { name: "Srour (old entry)", phone: "+961 7 740 328" });
    const r = await importLeads(boss, { rows, tag: "test-list" });
    expect(r).toEqual({ added: 2, skipped: 1 });
    const nahouli = await db.contact.findFirstOrThrow({ where: { name: "Nahouli Pharmacy" } });
    expect(nahouli).toMatchObject({ stage: "LEAD", category: "CUSTOMER", ownerId: boss.id, tags: ["test-list"], lat: null });
    expect(await importLeads(boss, { rows, tag: "test-list" })).toEqual({ added: 0, skipped: 3 });
    expect(await countKnownLeads(rows)).toBe(3);

    const rep = await makeUser("SALESPERSON");
    expect((await listClients(rep)).map((c) => c.name)).toContain("Manana Medical");
    await expect(importLeads(rep, { rows })).rejects.toThrow(/manager/);
  });

  it("places list leads at their town until a rep's check-in saves the exact spot", async () => {
    const boss = await makeUser("MANAGER", "Boss");
    const rep = await makeUser("SALESPERSON");
    await importLeads(boss, { rows: [{ name: "Ghazieh Pharmacy", phone: "07-220028", address: "Ghazieh", lat: 33.5175, lng: 35.36889 }] });
    const c = await db.contact.findFirstOrThrow({ where: { name: "Ghazieh Pharmacy" } });
    expect(c).toMatchObject({ lat: 33.5175, locationApprox: true });

    // Standing next to the town pin finds nothing: it isn't the shop's real spot.
    expect((await checkInNearest(rep, { lat: 33.5175, lng: 35.36889, accuracy: 10 })).found).toBe(false);
    const r = await checkIn(rep, c.id, { lat: 33.519, lng: 35.37, accuracy: 15 });
    expect(r.visit).toMatchObject({ verified: false, distanceM: null });
    expect(await db.contact.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ lat: 33.519, lng: 35.37, locationApprox: false });
  });

  it("ships lists the import accepts", () => {
    for (const l of LEAD_LISTS) {
      expect(l.rows.length).toBeGreaterThan(0);
      expect(l.rows.every((r) => r.name && r.address.length <= 300 && r.lat! > 33 && r.lat! < 33.7 && r.lng! > 35.1 && r.lng! < 35.7)).toBe(true);
    }
  });
});
