import type { User } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { TZ_DEFAULT, zonedToUtc, addDaysKey } from "../time";
import { EventInput } from "../validation";
import { UserError } from "./errors";

type Actor = Pick<User, "id" | "role" | "timeZone">;

function toRange(i: EventInput, tz: string) {
  if (i.allDay) return { start: zonedToUtc(i.date, "00:00", tz), end: zonedToUtc(addDaysKey(i.date, 1), "00:00", tz) };
  return { start: zonedToUtc(i.date, i.start, tz), end: zonedToUtc(i.date, i.end, tz) };
}

export function listEvents(a: Actor, from: Date, to: Date) {
  return db.event.findMany({
    where: { ownerId: a.id, start: { lt: to }, end: { gt: from } },
    include: { contact: { select: { id: true, name: true } } },
    orderBy: { start: "asc" },
  });
}

export async function createEvent(a: Actor, raw: unknown, by: "user" | "ai" = "user") {
  const p = EventInput.safeParse(raw);
  if (!p.success) throw new UserError(p.error.issues[0]?.message ?? "Invalid event.");
  const i = p.data, tz = a.timeZone || TZ_DEFAULT;
  const ev = await db.event.create({
    data: { title: i.title, ...toRange(i, tz), allDay: i.allDay, location: i.location, notes: i.notes, contactId: i.contactId ?? null, ownerId: a.id, source: by === "ai" ? "assistant" : "app" },
  });
  await audit({ actorId: a.id, actorKind: by, action: "event.create", entity: "event", entityId: ev.id, meta: { title: ev.title } });
  return ev;
}

export async function updateEvent(a: Actor, id: string, raw: unknown) {
  const before = await db.event.findFirst({ where: { id, ownerId: a.id } });
  if (!before) throw new UserError("That event doesn't exist or isn't yours.", "not_found");
  const p = EventInput.safeParse(raw);
  if (!p.success) throw new UserError(p.error.issues[0]?.message ?? "Invalid event.");
  const i = p.data;
  const ev = await db.event.update({ where: { id }, data: { title: i.title, ...toRange(i, a.timeZone || TZ_DEFAULT), allDay: i.allDay, location: i.location, notes: i.notes, contactId: i.contactId ?? null } });
  await audit({ actorId: a.id, action: "event.update", entity: "event", entityId: id });
  return ev;
}

export async function deleteEvent(a: Actor, id: string) {
  const ev = await db.event.findFirst({ where: { id, ownerId: a.id } });
  if (!ev) throw new UserError("That event doesn't exist or isn't yours.", "not_found");
  await db.event.delete({ where: { id } });
  await audit({ actorId: a.id, action: "event.delete", entity: "event", entityId: id, meta: { title: ev.title } });
}

// Pairs of events that overlap, for the dashboard.
export function overlaps<T extends { id: string; start: Date; end: Date; allDay: boolean }>(evs: T[]): [T, T][] {
  const timed = evs.filter((e) => !e.allDay).sort((x, y) => +x.start - +y.start);
  const out: [T, T][] = [];
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length && timed[j].start < timed[i].end; j++) out.push([timed[i], timed[j]]);
  return out;
}
