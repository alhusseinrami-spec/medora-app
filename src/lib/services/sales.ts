import { Prisma, type ClientStage, type OrderStatus, type User } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { can } from "../rbac";
import { distanceM, MAX_ACCURACY_M, VERIFY_RADIUS_M } from "../geo";
import { addDaysKey, dayKey, startOfDayUtc, TZ_DEFAULT, zonedToUtc } from "../time";
import { ClientInput, ClientPatch, GpsFix, LeadImport, OrderInput, OrderReview, ProductImport, ProductInput } from "../validation";
import { UserError } from "./errors";
import { notify } from "./notifications";

type Actor = Pick<User, "id" | "role" | "name"> & { timeZone?: string };

const parse = <T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, raw: unknown, what: string): T => {
  const p = schema.safeParse(raw);
  if (!p.success) throw new UserError(p.error.issues[0]?.message ?? `Invalid ${what}.`);
  return p.data;
};

// Clients are shared: every rep sees every client on the map and can visit or take an order there.
// Orders stay private to the rep who took them; managers and accounting see them all.
const seesAll = (a: Actor) => can(a.role, "team.view") || can(a.role, "sales.review");
const clientScope: Prisma.ContactWhereInput = { stage: { not: null } };
const orderScope = (a: Actor): Prisma.SalesOrderWhereInput => (seesAll(a) ? {} : { repId: a.id });

function requireField(a: Actor) {
  if (!can(a.role, "sales.field")) throw new UserError("Your role doesn't use the field sales app.", "forbidden");
}
function requireReview(a: Actor) {
  if (!can(a.role, "sales.review")) throw new UserError("Only accounting can review orders.", "forbidden");
}

// ---- Clients ----

export function listClients(a: Actor, opts: { stage?: ClientStage; q?: string } = {}) {
  const s = opts.q?.trim();
  return db.contact.findMany({
    where: {
      AND: [clientScope],
      ...(opts.stage ? { stage: opts.stage } : {}),
      ...(s ? { OR: ["name", "company", "phone", "address", "placeType"].map((f) => ({ [f]: { contains: s, mode: "insensitive" } })) } : {}),
    },
    include: { visits: { orderBy: { at: "desc" }, take: 1, select: { at: true, verified: true } } },
    orderBy: { name: "asc" }, take: 1000,
  });
}

export async function getClient(a: Actor, id: string) {
  const c = await db.contact.findFirst({
    where: { id, ...clientScope },
    include: {
      owner: { select: { id: true, name: true } },
      visits: { orderBy: { at: "desc" }, take: 30, include: { rep: { select: { name: true } } } },
      orders: { orderBy: { createdAt: "desc" }, take: 30, select: { id: true, number: true, kind: true, status: true, total: true, createdAt: true, edited: true } },
    },
  });
  if (!c) throw new UserError("That client doesn't exist.", "not_found");
  return c;
}

export async function createClient(a: Actor, raw: unknown) {
  requireField(a);
  const i = parse(ClientInput, raw, "client");
  const { location, ...fields } = i;
  const c = await db.contact.create({
    data: { ...fields, category: "CUSTOMER", ownerId: a.id, lat: location?.lat ?? null, lng: location?.lng ?? null },
  });
  await audit({ actorId: a.id, action: "client.create", entity: "contact", entityId: c.id, meta: { name: c.name, located: !!location, accuracy: location?.accuracy ?? null } });
  return c;
}

export async function updateClient(a: Actor, id: string, raw: unknown) {
  const c = await getClient(a, id);
  if (c.ownerId !== a.id && !can(a.role, "team.view")) throw new UserError("Only the client's rep or a manager can change it.", "forbidden");
  const data = parse(ClientPatch, raw, "client");
  const u = await db.contact.update({ where: { id }, data });
  await audit({ actorId: a.id, action: "client.update", entity: "contact", entityId: id, meta: { changed: Object.keys(data), stage: data.stage ?? null } });
  return u;
}

// Moving a client's pin is a manager's call, so reps can't quietly move a client to wherever they are.
export async function relocateClient(a: Actor, id: string, raw: unknown) {
  const c = await getClient(a, id);
  const fix = parse(GpsFix, raw, "location");
  if (c.lat != null && !can(a.role, "team.view")) throw new UserError("Ask a manager to move a client's saved location.", "forbidden");
  if (fix.accuracy > MAX_ACCURACY_M) throw new UserError(`Your location is only accurate to ${Math.round(fix.accuracy)} m. Step outside or wait a moment and try again.`);
  await db.contact.update({ where: { id }, data: { lat: fix.lat, lng: fix.lng } });
  await audit({ actorId: a.id, action: "client.relocate", entity: "contact", entityId: id, meta: { from: c.lat != null ? [c.lat, c.lng] : null, to: [fix.lat, fix.lng] } });
}

export async function setFollowUp(a: Actor, id: string, date: string | null, time = "09:00") {
  const c = await getClient(a, id);
  const tz = a.timeZone || TZ_DEFAULT;
  if (date === null) {
    await db.contact.update({ where: { id }, data: { followUpAt: null } });
    return null;
  }
  let at: Date;
  try { at = zonedToUtc(date, time, tz); } catch { throw new UserError("Pick a date and time for the follow-up."); }
  await db.contact.update({ where: { id }, data: { followUpAt: at } });
  // The existing reminder system delivers it to the rep's bell at that time.
  await db.reminder.create({ data: { title: `Follow up: ${c.name}`, dueAt: at, userId: a.id } });
  await audit({ actorId: a.id, action: "client.follow_up", entity: "contact", entityId: id, meta: { at: at.toISOString() } });
  return at;
}

// The same number written as 07/740328, +961 7 740328 or 07-740-328.
export const phoneKey = (p: string) => p.replace(/\D/g, "").replace(/^(00)?961/, "").replace(/^0/, "");

// A manager adds a researched list of places as leads. Places already in the CRM (same phone, or same name and
// address) are skipped, so running the same list twice adds nothing.
// Tells whether a place is already in the CRM. Adding a place to it makes later copies count as known.
async function knownPlaces() {
  const existing = await db.contact.findMany({ select: { name: true, address: true, phone: true, whatsapp: true } });
  const nameKey = (n: string, addr: string) => `${n.trim().toLowerCase()}|${addr.trim().toLowerCase()}`;
  const phones = new Set(existing.flatMap((c) => [c.phone, c.whatsapp]).map(phoneKey).filter((k) => k.length >= 6));
  const names = new Set(existing.map((c) => nameKey(c.name, c.address)));
  return {
    has: (r: { name: string; address: string; phone: string }) => {
      const pk = phoneKey(r.phone);
      return (pk.length >= 6 && phones.has(pk)) || names.has(nameKey(r.name, r.address));
    },
    add: (r: { name: string; address: string; phone: string }) => {
      const pk = phoneKey(r.phone);
      if (pk.length >= 6) phones.add(pk);
      names.add(nameKey(r.name, r.address));
    },
  };
}

export async function countKnownLeads(rows: { name: string; address: string; phone: string }[]) {
  const known = await knownPlaces();
  return rows.filter((r) => known.has(r)).length;
}

export async function importLeads(a: Actor, raw: unknown) {
  if (!can(a.role, "team.view")) throw new UserError("Only a manager can add a lead list.", "forbidden");
  const { rows, tag } = parse(LeadImport, raw, "lead list");
  const known = await knownPlaces();
  const fresh: Prisma.ContactCreateManyInput[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (known.has(r)) { skipped++; continue; }
    known.add(r);
    fresh.push({ ...r, stage: "LEAD", category: "CUSTOMER", ownerId: a.id, tags: tag ? [tag] : [] });
  }
  if (fresh.length) await db.contact.createMany({ data: fresh });
  await audit({ actorId: a.id, action: "client.import_leads", entity: "contact", meta: { tag, added: fresh.length, skipped } });
  return { added: fresh.length, skipped };
}

// ---- Visits ----

export async function checkIn(a: Actor, contactId: string, raw: unknown, note = "") {
  requireField(a);
  const c = await getClient(a, contactId);
  const fix = parse(GpsFix, raw, "location");
  // A second tap at the same client within 30 minutes is the same visit.
  const recent = await db.visit.findFirst({ where: { contactId, repId: a.id, at: { gte: new Date(Date.now() - 30 * 60_000) } }, orderBy: { at: "desc" } });
  if (recent) return { visit: recent, duplicate: true };

  let distance: number | null = null;
  if (c.lat != null && c.lng != null) distance = distanceM(fix, { lat: c.lat, lng: c.lng });
  const verified = distance !== null && distance <= VERIFY_RADIUS_M && fix.accuracy <= MAX_ACCURACY_M;
  // A client with no saved pin takes this one, but the visit stays unverified: there was nothing to check against.
  if (c.lat == null && fix.accuracy <= MAX_ACCURACY_M) await db.contact.update({ where: { id: contactId }, data: { lat: fix.lat, lng: fix.lng } });

  const visit = await db.visit.create({
    data: { contactId, repId: a.id, lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracy, distanceM: distance, verified, note: note.trim().slice(0, 2000) },
  });
  await audit({ actorId: a.id, action: "visit.check_in", entity: "visit", entityId: visit.id, meta: { contactId, verified, distance, accuracy: fix.accuracy } });
  return { visit, duplicate: false };
}

// "Log visit" on the Today screen: check in at whichever client the rep is standing at.
export async function checkInNearest(a: Actor, raw: unknown) {
  requireField(a);
  const fix = parse(GpsFix, raw, "location");
  const mine = await db.contact.findMany({ where: { stage: { not: null }, lat: { not: null }, lng: { not: null } }, select: { id: true, name: true, lat: true, lng: true } });
  const best = mine
    .map((c) => ({ id: c.id, name: c.name, d: distanceM(fix, { lat: c.lat!, lng: c.lng! }) }))
    .reduce<{ id: string; name: string; d: number } | null>((b, c) => (!b || c.d < b.d ? c : b), null);
  if (!best || best.d > VERIFY_RADIUS_M) return { found: false as const, nearest: best };
  const r = await checkIn(a, best.id, fix);
  return { found: true as const, client: { id: best.id, name: best.name }, ...r };
}

export function listVisits(a: Actor, from: Date, to: Date, repId?: string) {
  const all = can(a.role, "team.view");
  return db.visit.findMany({
    where: { at: { gte: from, lt: to }, ...(all ? (repId ? { repId } : {}) : { repId: a.id }) },
    include: { contact: { select: { id: true, name: true, placeType: true, stage: true } }, rep: { select: { id: true, name: true } }, orders: { select: { id: true } } },
    orderBy: { at: "asc" },
  });
}

// Manager board: one row per rep for a day.
export async function visitsBoard(a: Actor, key: string) {
  if (!can(a.role, "team.view")) throw new UserError("Only managers can see the team's visits.", "forbidden");
  const tz = a.timeZone || TZ_DEFAULT;
  const from = startOfDayUtc(key, tz), to = startOfDayUtc(addDaysKey(key, 1), tz);
  const [visits, reps, orders] = await Promise.all([
    listVisits(a, from, to),
    db.user.findMany({ where: { disabledAt: null, role: { in: ["SALESPERSON", "STAFF", "MANAGER", "OWNER"] } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    db.salesOrder.groupBy({ by: ["repId"], where: { createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
  ]);
  const byRep = new Map<string, typeof visits>();
  for (const v of visits) byRep.set(v.repId, [...(byRep.get(v.repId) ?? []), v]);
  const orderCount = new Map(orders.map((o) => [o.repId, o._count._all]));
  return reps
    .map((r) => {
      const vs = byRep.get(r.id) ?? [];
      return { rep: r, visits: vs, verified: vs.filter((v) => v.verified).length, orders: orderCount.get(r.id) ?? 0 };
    })
    // Owners and managers appear only on days they actually visited someone.
    .filter((row) => row.rep.role === "SALESPERSON" || row.rep.role === "STAFF" || row.visits.length > 0);
}

// ---- Today ----

export async function todayFor(a: Actor) {
  requireField(a);
  const tz = a.timeZone || TZ_DEFAULT;
  const today = dayKey(new Date(), tz);
  const from = startOfDayUtc(today, tz), to = startOfDayUtc(addDaysKey(today, 1), tz);
  const monthStart = startOfDayUtc(`${today.slice(0, 8)}01`, tz);
  const staleBefore = new Date(Date.now() - 14 * 864e5);
  const [verifiedToday, visitsToday, ordersMonth, route] = await Promise.all([
    db.visit.count({ where: { repId: a.id, verified: true, at: { gte: from, lt: to } } }),
    db.visit.findMany({ where: { repId: a.id, at: { gte: from, lt: to } }, select: { contactId: true } }),
    db.salesOrder.aggregate({ where: { repId: a.id, kind: "ORDER", status: "APPROVED", createdAt: { gte: monthStart } }, _sum: { total: true }, _count: { _all: true } }),
    // Today's route: follow-ups due by tonight, then leads and prospects nobody has seen in two weeks.
    db.contact.findMany({
      where: {
        ownerId: a.id, stage: { in: ["LEAD", "PROSPECT", "CUSTOMER"] },
        OR: [{ followUpAt: { lt: to } }, { stage: { in: ["LEAD", "PROSPECT"] }, visits: { none: { at: { gte: staleBefore } } } }],
      },
      select: { id: true, name: true, stage: true, placeType: true, lat: true, lng: true, followUpAt: true },
      orderBy: [{ followUpAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
      take: 30,
    }),
  ]);
  const visited = new Set(visitsToday.map((v) => v.contactId));
  return {
    verifiedToday,
    salesMonth: Number(ordersMonth._sum.total ?? 0),
    ordersMonth: ordersMonth._count._all,
    route: route.map((r) => ({ ...r, visitedToday: visited.has(r.id), due: r.followUpAt != null && r.followUpAt < to })),
  };
}

// ---- Products ----

export function listProducts(activeOnly = true) {
  return db.product.findMany({ where: activeOnly ? { active: true } : {}, orderBy: { name: "asc" }, take: 10_000 });
}

export async function saveProduct(a: Actor, raw: unknown, id?: string) {
  requireReview(a);
  const p = parse(ProductInput, raw, "product");
  const dup = await db.product.findFirst({ where: { sku: p.sku, ...(id ? { id: { not: id } } : {}) } });
  if (dup) throw new UserError(`Code ${p.sku} is already used by ${dup.name}.`);
  const data = { ...p, price: new Prisma.Decimal(p.price) };
  const r = id ? await db.product.update({ where: { id }, data }) : await db.product.create({ data });
  await audit({ actorId: a.id, action: id ? "product.update" : "product.create", entity: "product", entityId: r.id, meta: { sku: r.sku, price: p.price } });
  return r;
}

// Accounting exports write numbers every which way: "$1,250.50", "1.250,50", "6,5", "12 pcs".
export function readNumber(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = (v ?? "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  const comma = s.lastIndexOf(","), dot = s.lastIndexOf(".");
  if (comma > -1 && dot > -1) s = comma > dot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (comma > -1) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const cellText = (v: string | number | null | undefined) => (v == null ? "" : String(v)).trim();

// Adds new codes and updates existing ones. Rows that can't be read are skipped and reported, never half-saved.
export async function importProducts(a: Actor, raw: unknown) {
  requireReview(a);
  const { rows, hideMissing } = parse(ProductImport, raw, "import");
  const bySku = new Map<string, Prisma.ProductCreateInput>();
  const skipped: { row: number; sku: string; reason: string }[] = [];
  rows.forEach((r, i) => {
    const sku = cellText(r.sku), name = cellText(r.name);
    // No price yet is fine: the rep sees "Price from accounting" and accounting prices it on review.
    const price = cellText(r.price) === "" ? 0 : readNumber(r.price);
    if (!sku && !name) return; // blank line
    const stock = readNumber(r.stock), minStock = readNumber(r.minStock);
    const p = ProductInput.safeParse({
      sku, name, unit: cellText(r.unit), price: price ?? NaN,
      stock: stock == null ? null : Math.round(stock), minStock: minStock == null ? null : Math.round(minStock),
    });
    if (!p.success) {
      skipped.push({ row: i + 1, sku, reason: price == null && sku && name ? "Price can't be read" : p.error.issues[0]?.message ?? "Can't read this row" });
      return;
    }
    bySku.set(p.data.sku, { ...p.data, price: new Prisma.Decimal(p.data.price) });
  });
  if (bySku.size === 0) throw new UserError(skipped.length ? `None of the rows could be read. Row ${skipped[0].row}: ${skipped[0].reason}.` : "The file has no item rows.");

  const items = [...bySku.values()];
  const existing = new Map((await db.product.findMany({ where: { sku: { in: [...bySku.keys()] } }, select: { sku: true, unit: true } })).map((p) => [p.sku, p.unit]));
  // A file without a unit column keeps the units already saved.
  for (const x of items) if (!x.unit) x.unit = existing.get(x.sku) ?? "unit";
  // One statement per 1,000 rows keeps a 10,000-item price list well inside a serverless time limit.
  // A blank stock cell keeps the figure already saved rather than wiping it.
  await db.$transaction(async (tx) => {
    for (let i = 0; i < items.length; i += 1000) {
      const chunk = items.slice(i, i + 1000);
      await tx.$executeRaw`
        INSERT INTO "products" ("id", "sku", "name", "unit", "price", "active", "stock", "minStock", "createdAt", "updatedAt")
        SELECT 'imp' || md5(random()::text || r.sku), r.sku, r.name, r.unit, r.price, true, r.stock, r.min, now(), now()
        FROM unnest(${chunk.map((x) => x.sku)}::text[], ${chunk.map((x) => x.name)}::text[], ${chunk.map((x) => x.unit ?? "unit")}::text[],
                    ${chunk.map((x) => String(x.price))}::numeric[], ${chunk.map((x) => x.stock ?? null)}::int[], ${chunk.map((x) => x.minStock ?? null)}::int[])
          AS r(sku, name, unit, price, stock, min)
        ON CONFLICT ("sku") DO UPDATE SET
          "name" = EXCLUDED."name", "unit" = EXCLUDED."unit", "price" = EXCLUDED."price", "active" = true,
          "stock" = COALESCE(EXCLUDED."stock", "products"."stock"), "minStock" = COALESCE(EXCLUDED."minStock", "products"."minStock"),
          "updatedAt" = now()`;
    }
  }, { timeout: 60_000 });
  const hidden = hideMissing
    ? (await db.product.updateMany({ where: { sku: { notIn: [...bySku.keys()] }, active: true }, data: { active: false } })).count
    : 0;
  const result = { added: items.length - existing.size, updated: existing.size, hidden, skipped };
  await audit({ actorId: a.id, action: "product.import", entity: "product", meta: { added: result.added, updated: result.updated, hidden, skipped: skipped.length } });
  return result;
}

// ---- Orders and proformas ----

const money = (n: number) => Math.round(n * 100) / 100;
const unitMoney = (n: number) => Math.round(n * 10_000) / 10_000; // unit prices keep 4 decimals, like 0.3375 a piece
const lineTotal = (l: { quantity: number; unitPrice: Prisma.Decimal | number }) => l.quantity * Number(l.unitPrice);
export const KIND_LABEL = { ORDER: "Order", PROFORMA: "Proforma request" } as const;

async function reviewers() {
  const users = await db.user.findMany({ where: { disabledAt: null }, select: { id: true, role: true } });
  return users.filter((u) => can(u.role, "sales.review"));
}

export async function createOrder(a: Actor, raw: unknown) {
  requireField(a);
  const i = parse(OrderInput, raw, "order");
  const client = await getClient(a, i.contactId);
  const ids = i.lines.map((l) => l.productId).filter((x): x is string => !!x);
  const products = new Map((await db.product.findMany({ where: { id: { in: ids }, active: true } })).map((p) => [p.id, p]));

  const lines = i.lines.map((l, idx) => {
    const p = l.productId ? products.get(l.productId) : undefined;
    if (l.productId && !p) throw new UserError("One of the products is no longer in the catalogue. Refresh and try again.");
    const description = p ? p.name : l.description.trim();
    if (!description) throw new UserError("Describe each item or pick it from the catalogue.");
    const price = unitMoney(l.unitPrice ?? (p ? Number(p.price) : 0));
    return { productId: p?.id ?? null, description, quantity: l.quantity, unitPrice: price, requestedQty: l.quantity, requestedPrice: price, position: idx };
  });
  const total = money(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));

  let visitId: string | null = null;
  if (i.visitId) {
    const v = await db.visit.findFirst({ where: { id: i.visitId, repId: a.id, contactId: client.id } });
    visitId = v?.id ?? null;
  }
  const order = await db.salesOrder.create({
    data: { kind: i.kind, contactId: client.id, repId: a.id, visitId, notes: i.notes, total, lines: { create: lines } },
  });
  if (client.stage === "LEAD" || client.stage === "PROSPECT") {
    if (i.kind === "ORDER") await db.contact.update({ where: { id: client.id }, data: { stage: "CUSTOMER" } });
    else if (client.stage === "LEAD") await db.contact.update({ where: { id: client.id }, data: { stage: "PROSPECT" } });
  }
  await audit({ actorId: a.id, action: "order.submit", entity: "sales_order", entityId: order.id, meta: { number: order.number, kind: i.kind, total, lines: lines.length } });
  const label = KIND_LABEL[i.kind];
  for (const r of await reviewers()) {
    if (r.id === a.id) continue;
    await notify(r.id, { kind: "order", title: `${label} #${order.number} from ${a.name}`, body: `${client.name} · $${total.toFixed(2)} · ${lines.length} item${lines.length === 1 ? "" : "s"}`, link: `/sales/orders/${order.id}` });
  }
  return order;
}

export function listOrders(a: Actor, opts: { status?: OrderStatus[]; mine?: boolean; take?: number } = {}) {
  return db.salesOrder.findMany({
    where: { ...orderScope(a), ...(opts.mine ? { repId: a.id } : {}), ...(opts.status ? { status: { in: opts.status } } : {}) },
    include: { contact: { select: { id: true, name: true } }, rep: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
    orderBy: { createdAt: "desc" }, take: opts.take ?? 200,
  });
}

export async function getOrder(a: Actor, id: string) {
  const o = await db.salesOrder.findFirst({
    where: { id, ...orderScope(a) },
    include: {
      contact: { select: { id: true, name: true, placeType: true, phone: true, address: true } },
      rep: { select: { id: true, name: true } }, reviewedBy: { select: { name: true } }, driver: { select: { id: true, name: true } },
      visit: { select: { at: true, verified: true } },
      lines: { orderBy: { position: "asc" }, include: { product: { select: { sku: true, unit: true } } } },
    },
  });
  if (!o) throw new UserError("That order doesn't exist or isn't visible to you.", "not_found");
  return o;
}

export async function reviewOrder(a: Actor, id: string, raw: unknown) {
  requireReview(a);
  const r = parse(OrderReview, raw, "review");
  const o = await getOrder(a, id);
  if (o.status !== "SUBMITTED") throw new UserError(`This ${KIND_LABEL[o.kind].toLowerCase()} was already ${o.status.toLowerCase()}.`);

  const current = new Map(o.lines.map((l) => [l.id, l]));
  const changes = r.lines.filter((l) => current.has(l.id));
  const after = o.lines.map((l) => {
    const c = changes.find((x) => x.id === l.id);
    return c ? { ...l, quantity: c.quantity, unitPrice: new Prisma.Decimal(unitMoney(c.unitPrice)) } : l;
  });
  const kept = after.filter((l) => l.quantity > 0);
  if (r.decision === "APPROVE" && kept.length === 0) throw new UserError("Keep at least one item, or reject instead.");
  const edited = after.some((l) => l.quantity !== l.requestedQty || !l.unitPrice.equals(l.requestedPrice));
  const total = money(kept.reduce((s, l) => s + lineTotal(l), 0));

  const status: OrderStatus = r.decision === "APPROVE" ? "APPROVED" : r.decision === "REJECT" ? "REJECTED" : "SUBMITTED";
  if (r.decision === "REJECT" && !r.note) throw new UserError("Say why it's rejected so the rep can tell the client.");
  // Every write is conditional on the order still being open, so two reviewers can't both decide it.
  const updated = await db.$transaction(async (tx) => {
    const n = await tx.salesOrder.updateMany({
      where: { id, status: "SUBMITTED" },
      data: { status, total, edited: o.edited || edited, reviewNote: r.note || o.reviewNote, ...(status !== "SUBMITTED" ? { reviewedById: a.id, reviewedAt: new Date() } : {}),
        // Approved orders and proformas queue for the accounting system (lib/services/accountingSync.ts).
        ...(status === "APPROVED" ? { syncStatus: "pending", nextSyncAt: new Date(), syncAttempts: 0, syncError: "" } : {}) },
    });
    if (n.count === 0) throw new UserError("Someone else just reviewed this. Reload to see their decision.");
    for (const l of after) {
      if (l.quantity === 0) await tx.salesOrderLine.delete({ where: { id: l.id } });
      else if (changes.some((c) => c.id === l.id)) await tx.salesOrderLine.update({ where: { id: l.id }, data: { quantity: l.quantity, unitPrice: l.unitPrice } });
    }
    return tx.salesOrder.findUniqueOrThrow({ where: { id } });
  });

  await audit({
    actorId: a.id, action: `order.${r.decision.toLowerCase()}`, entity: "sales_order", entityId: id,
    meta: { number: o.number, total, changes: changes.map((c) => { const l = current.get(c.id)!; return { line: l.description, qty: [l.quantity, c.quantity], price: [Number(l.unitPrice), c.unitPrice] }; }) },
  });
  if (status !== "SUBMITTED") {
    const label = KIND_LABEL[o.kind];
    const verb = status === "APPROVED" ? (edited ? "approved with changes" : "approved") : "rejected";
    await notify(o.repId, { kind: "order", title: `${label} #${o.number} ${verb}`, body: `${o.contact.name} · $${total.toFixed(2)}${r.note ? ` · ${r.note}` : ""}`, link: `/field/orders/${o.id}` });
  }
  return updated;
}

export async function cancelOrder(a: Actor, id: string) {
  const o = await getOrder(a, id);
  if (o.repId !== a.id) throw new UserError("Only the rep who placed it can cancel it.", "forbidden");
  const n = await db.salesOrder.updateMany({ where: { id, status: "SUBMITTED" }, data: { status: "CANCELLED" } });
  if (n.count === 0) throw new UserError("Accounting has already reviewed it. Ask them to change it.");
  await audit({ actorId: a.id, action: "order.cancel", entity: "sales_order", entityId: id, meta: { number: o.number } });
}

export async function pendingOrderCount(a: Actor) {
  return can(a.role, "sales.review") ? db.salesOrder.count({ where: { status: "SUBMITTED" } }) : 0;
}

// An order taken during a visit is linked to it, so managers can see which visits produced sales.
export async function recentVisitId(a: Actor, contactId: string) {
  const v = await db.visit.findFirst({ where: { contactId, repId: a.id, at: { gte: new Date(Date.now() - 3 * 3600e3) } }, orderBy: { at: "desc" }, select: { id: true } });
  return v?.id ?? null;
}
