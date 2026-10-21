import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { can, fieldHome } from "@/lib/rbac";
import { createClient, createOrder, reviewOrder } from "@/lib/services/sales";
import { assignDriver, getDelivery, listDeliveries, listDrivers, markDelivered } from "@/lib/services/deliveries";
import { makeUser, reset } from "./helpers";

beforeEach(reset);

const CLINIC = { lat: 33.5606, lng: 35.3714 };
const NEAR = { lat: 33.56105, lng: 35.3714, accuracy: 12 };
const FAR = { lat: 33.578, lng: 35.3714, accuracy: 12 };

async function approvedOrder() {
  const rep = await makeUser("SALESPERSON", "Rep"), acc = await makeUser("ACCOUNTANT", "Acc");
  const client = await createClient(rep, { name: "Dr Maroun", location: { ...CLINIC, accuracy: 8 } });
  const o = await createOrder(rep, { contactId: client.id, lines: [{ description: "Gloves box", quantity: 3, unitPrice: 5 }] });
  await reviewOrder(acc, o.id, { decision: "APPROVE" });
  return { rep, acc, o };
}

describe("roles", () => {
  it("sends salespeople and drivers straight to their field app", () => {
    expect(fieldHome("SALESPERSON")).toBe("/field");
    expect(fieldHome("DRIVER")).toBe("/field/deliveries");
    expect(fieldHome("ACCOUNTANT")).toBeNull();
    expect(can("SALESPERSON", "sales.field")).toBe(true);
    expect(can("DRIVER", "sales.field")).toBe(false);
    expect(can("DRIVER", "sales.deliver")).toBe(true);
    expect(can("SALESPERSON", "sales.review")).toBe(false);
  });
});

describe("deliveries", () => {
  it("lets accounting hand an approved order to a driver, who delivers it at the client", async () => {
    const { rep, acc, o } = await approvedOrder();
    const driver = await makeUser("DRIVER", "Driver"), other = await makeUser("DRIVER", "Other");
    expect((await listDrivers()).map((d) => d.name)).toEqual(["Driver", "Other"]);

    await expect(assignDriver(rep, o.id, driver.id)).rejects.toThrow(/accounting/);
    await expect(assignDriver(acc, o.id, rep.id)).rejects.toThrow(/drivers/);
    await assignDriver(acc, o.id, driver.id);
    expect(await db.notification.count({ where: { userId: driver.id } })).toBe(1);

    expect((await listDeliveries(driver)).open).toHaveLength(1);
    expect((await listDeliveries(other)).open).toHaveLength(0);
    await expect(getDelivery(other, o.id)).rejects.toThrow();
    await expect(markDelivered(rep, o.id, NEAR)).rejects.toThrow(/drivers/);

    const r = await markDelivered(driver, o.id, NEAR, "Left with reception");
    expect(r.duplicate).toBe(false);
    expect(r.order).toMatchObject({ deliveryVerified: true, deliveryNote: "Left with reception" });
    expect(Math.round(r.order.deliveryDistanceM!)).toBe(50);
    expect((await markDelivered(driver, o.id, NEAR)).duplicate).toBe(true);
    expect(await db.notification.count({ where: { userId: rep.id, title: { contains: "elivered" } } })).toBe(1);

    const list = await listDeliveries(driver);
    expect(list.open).toHaveLength(0);
    expect(list.done).toHaveLength(1);
    await expect(assignDriver(acc, o.id, other.id)).rejects.toThrow(/already delivered/);
  });

  it("records a delivery far from the client's pin as not verified", async () => {
    const { acc, o } = await approvedOrder();
    const driver = await makeUser("DRIVER");
    await assignDriver(acc, o.id, driver.id);
    const r = await markDelivered(driver, o.id, FAR);
    expect(r.order.deliveryVerified).toBe(false);
    expect(r.order.deliveredAt).not.toBeNull();
  });

  it("only sends approved orders out", async () => {
    const rep = await makeUser("SALESPERSON"), acc = await makeUser("ACCOUNTANT"), driver = await makeUser("DRIVER");
    const client = await createClient(rep, { name: "Pharmacy" });
    const o = await createOrder(rep, { contactId: client.id, lines: [{ description: "Masks", quantity: 1, unitPrice: 2 }] });
    await expect(assignDriver(acc, o.id, driver.id)).rejects.toThrow(/approved/);
  });
});
