import type { User } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { can } from "../rbac";
import { distanceM, MAX_ACCURACY_M, VERIFY_RADIUS_M } from "../geo";
import { addDaysKey, dayKey, startOfDayUtc, TZ_DEFAULT } from "../time";
import { GpsFix } from "../validation";
import { UserError } from "./errors";
import { notify } from "./notifications";

type Actor = Pick<User, "id" | "role" | "name"> & { timeZone?: string };

// Accounting hands approved orders to a driver; the driver marks each one delivered at the client,
// and the phone's location is checked against the client's saved pin the same way visits are.

function requireDriver(a: Actor) {
  if (!can(a.role, "sales.deliver")) throw new UserError("Only drivers deliver orders.", "forbidden");
}

export function listDrivers() {
  return db.user.findMany({ where: { role: "DRIVER", disabledAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function assignDriver(a: Actor, orderId: string, driverId: string | null) {
  if (!can(a.role, "sales.review")) throw new UserError("Only accounting assigns deliveries.", "forbidden");
  const o = await db.salesOrder.findUnique({ where: { id: orderId }, include: { contact: { select: { name: true, address: true } } } });
  if (!o) throw new UserError("That order doesn't exist.", "not_found");
  if (o.kind !== "ORDER" || o.status !== "APPROVED") throw new UserError("Only approved orders can go out for delivery.");
  if (o.deliveredAt) throw new UserError("This order was already delivered.");
  if (driverId) {
    const d = await db.user.findFirst({ where: { id: driverId, role: "DRIVER", disabledAt: null } });
    if (!d) throw new UserError("Pick one of your drivers.");
  }
  if (driverId === o.driverId) return o;
  const updated = await db.salesOrder.update({ where: { id: orderId }, data: { driverId, assignedAt: driverId ? new Date() : null } });
  await audit({ actorId: a.id, action: driverId ? "delivery.assign" : "delivery.unassign", entity: "sales_order", entityId: orderId, meta: { number: o.number, driverId } });
  if (driverId) {
    await notify(driverId, { kind: "order", title: `New delivery: order #${o.number}`, body: [o.contact.name, o.contact.address].filter(Boolean).join(" · "), link: `/field/deliveries/${o.id}` });
  }
  return updated;
}

const deliveryInclude = {
  contact: { select: { id: true, name: true, placeType: true, phone: true, whatsapp: true, address: true, lat: true, lng: true } },
  rep: { select: { name: true } },
  lines: { orderBy: { position: "asc" as const }, select: { id: true, description: true, quantity: true, product: { select: { sku: true, unit: true } } } },
};

export async function listDeliveries(a: Actor) {
  requireDriver(a);
  const tz = a.timeZone || TZ_DEFAULT;
  const today = dayKey(new Date(), tz);
  const [open, done] = await Promise.all([
    db.salesOrder.findMany({ where: { driverId: a.id, status: "APPROVED", deliveredAt: null }, include: deliveryInclude, orderBy: { assignedAt: "asc" } }),
    db.salesOrder.findMany({
      where: { driverId: a.id, deliveredAt: { gte: startOfDayUtc(today, tz), lt: startOfDayUtc(addDaysKey(today, 1), tz) } },
      include: deliveryInclude, orderBy: { deliveredAt: "desc" },
    }),
  ]);
  return { open, done };
}

export async function getDelivery(a: Actor, id: string) {
  requireDriver(a);
  const o = await db.salesOrder.findFirst({ where: { id, driverId: a.id }, include: deliveryInclude });
  if (!o) throw new UserError("That delivery isn't assigned to you.", "not_found");
  return o;
}

export async function markDelivered(a: Actor, id: string, raw: unknown, note = "") {
  const o = await getDelivery(a, id);
  if (o.deliveredAt) return { order: o, duplicate: true };
  if (o.status !== "APPROVED") throw new UserError("This order is no longer approved. Check with accounting before handing it over.");
  const p = GpsFix.safeParse(raw);
  if (!p.success) throw new UserError(p.error.issues[0]?.message ?? "Your location couldn't be read.");
  const fix = p.data;
  const distance = o.contact.lat != null && o.contact.lng != null ? distanceM(fix, { lat: o.contact.lat, lng: o.contact.lng }) : null;
  const verified = distance !== null && distance <= VERIFY_RADIUS_M && fix.accuracy <= MAX_ACCURACY_M;
  const n = await db.salesOrder.updateMany({
    where: { id, driverId: a.id, deliveredAt: null },
    data: { deliveredAt: new Date(), deliveryLat: fix.lat, deliveryLng: fix.lng, deliveryAccuracyM: fix.accuracy, deliveryDistanceM: distance, deliveryVerified: verified, deliveryNote: note.trim().slice(0, 2000) },
  });
  if (n.count === 0) return { order: await getDelivery(a, id), duplicate: true };
  await audit({ actorId: a.id, action: "delivery.done", entity: "sales_order", entityId: id, meta: { number: o.number, verified, distance, accuracy: fix.accuracy } });

  const reviewers = (await db.user.findMany({ where: { disabledAt: null }, select: { id: true, role: true } })).filter((u) => can(u.role, "sales.review"));
  const title = `Order #${o.number} delivered${verified ? "" : " (location not verified)"}`;
  const body = `${o.contact.name} · by ${a.name}${note.trim() ? ` · ${note.trim()}` : ""}`;
  for (const id2 of new Set([o.repId, ...reviewers.map((r) => r.id)])) await notify(id2, { kind: "order", title, body, link: id2 === o.repId ? `/field/orders/${o.id}` : `/sales/orders/${o.id}` });
  return { order: await getDelivery(a, id), duplicate: false };
}
