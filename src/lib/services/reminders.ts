import type { User } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { log } from "../log";
import { TZ_DEFAULT, zonedToUtc, fmtTime } from "../time";
import { ReminderInput } from "../validation";
import { UserError } from "./errors";
import { notify } from "./notifications";

type Actor = Pick<User, "id" | "timeZone">;

export function listReminders(a: Actor, includeDone = false) {
  return db.reminder.findMany({
    where: { userId: a.id, ...(includeDone ? {} : { status: { in: ["PENDING", "SENT"] } }) },
    include: { task: { select: { id: true, title: true } }, event: { select: { id: true, title: true } } },
    orderBy: { dueAt: "asc" }, take: 300,
  });
}

export async function createReminder(a: Actor, raw: unknown, by: "user" | "ai" = "user") {
  const p = ReminderInput.safeParse(raw);
  if (!p.success) throw new UserError(p.error.issues[0]?.message ?? "Invalid reminder.");
  const i = p.data;
  const r = await db.reminder.create({ data: { title: i.title, dueAt: zonedToUtc(i.date, i.time, a.timeZone || TZ_DEFAULT), userId: a.id, taskId: i.taskId ?? null, eventId: i.eventId ?? null } });
  await audit({ actorId: a.id, actorKind: by, action: "reminder.create", entity: "reminder", entityId: r.id, meta: { title: r.title } });
  return r;
}

export async function setReminderStatus(a: Actor, id: string, status: "DONE" | "DISMISSED") {
  const r = await db.reminder.findFirst({ where: { id, userId: a.id } });
  if (!r) throw new UserError("That reminder doesn't exist.", "not_found");
  await db.reminder.update({ where: { id }, data: { status } });
  await audit({ actorId: a.id, action: `reminder.${status.toLowerCase()}`, entity: "reminder", entityId: id });
}

export async function snoozeReminder(a: Actor, id: string, minutes: number) {
  const r = await db.reminder.findFirst({ where: { id, userId: a.id } });
  if (!r) throw new UserError("That reminder doesn't exist.", "not_found");
  await db.reminder.update({ where: { id }, data: { status: "PENDING", firedAt: null, dueAt: new Date(Date.now() + minutes * 60000) } });
  await audit({ actorId: a.id, action: "reminder.snooze", entity: "reminder", entityId: id, meta: { minutes } });
}

// Run by the background worker: turns due reminders into notifications exactly once.
export async function fireDueReminders(now = new Date()): Promise<number> {
  const due = await db.reminder.findMany({ where: { status: "PENDING", dueAt: { lte: now } }, include: { user: { select: { timeZone: true } } }, take: 200 });
  let n = 0;
  for (const r of due) {
    const claimed = await db.reminder.updateMany({ where: { id: r.id, status: "PENDING" }, data: { status: "SENT", firedAt: now } });
    if (!claimed.count) continue;
    await notify(r.userId, { kind: "reminder", title: r.title, body: `Reminder set for ${fmtTime(r.dueAt, r.user.timeZone)}`, link: "/reminders" });
    await audit({ actorKind: "worker", action: "reminder.fire", entity: "reminder", entityId: r.id });
    n++;
  }
  if (n) log.info("worker.reminders_fired", { n });
  return n;
}
