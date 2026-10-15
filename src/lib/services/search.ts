import type { User } from "@prisma/client";
import { db } from "../db";
import { taskScope } from "./tasks";
import { can } from "../rbac";
import { fmtDateTime } from "../time";

export type SearchHit = { kind: "task" | "contact" | "event" | "reminder"; id: string; title: string; sub: string; href: string };

export async function search(a: Pick<User, "id" | "role" | "timeZone">, q: string): Promise<SearchHit[]> {
  const s = q.trim();
  if (s.length < 2) return [];
  const ci = { contains: s, mode: "insensitive" as const };
  const [tasks, contacts, events, reminders] = await Promise.all([
    db.task.findMany({ where: { AND: [taskScope(a), { OR: [{ title: ci }, { notes: ci }] }] }, take: 6, orderBy: { updatedAt: "desc" } }),
    db.contact.findMany({ where: { AND: [can(a.role, "team.view") ? {} : { ownerId: a.id }, { OR: [{ name: ci }, { company: ci }, { email: ci }] }] }, take: 6 }),
    db.event.findMany({ where: { ownerId: a.id, OR: [{ title: ci }, { location: ci }] }, take: 6, orderBy: { start: "desc" } }),
    db.reminder.findMany({ where: { userId: a.id, title: ci }, take: 4, orderBy: { dueAt: "desc" } }),
  ]);
  return [
    ...tasks.map((t) => ({ kind: "task" as const, id: t.id, title: t.title, sub: `Task · ${t.status.toLowerCase()}`, href: `/tasks?open=${t.id}` })),
    ...contacts.map((c) => ({ kind: "contact" as const, id: c.id, title: c.name, sub: ["Contact", c.company].filter(Boolean).join(" · "), href: `/contacts?open=${c.id}` })),
    ...events.map((e) => ({ kind: "event" as const, id: e.id, title: e.title, sub: `Event · ${fmtDateTime(e.start, a.timeZone)}`, href: `/calendar?date=${e.start.toISOString().slice(0, 10)}` })),
    ...reminders.map((r) => ({ kind: "reminder" as const, id: r.id, title: r.title, sub: `Reminder · ${fmtDateTime(r.dueAt, a.timeZone)}`, href: "/reminders" })),
  ];
}
