import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { audit } from "@/lib/audit";
import { nourAuth } from "@/lib/nour";
import { listEvents, overlaps } from "@/lib/services/events";
import { listTasks } from "@/lib/services/tasks";
import { listReminders } from "@/lib/services/reminders";
import { addDaysKey, dayKey, fmtDate, fmtDateTime, fmtTime, startOfDayUtc } from "@/lib/time";

export const dynamic = "force-dynamic";

// Everything Nour needs to answer "what's on today?", in short spoken-friendly fields.
export async function GET(req: Request) {
  const auth = await nourAuth(req);
  if ("error" in auth) return auth.error;
  const u = auth.owner, tz = u.timeZone;
  const today = dayKey(new Date(), tz);
  const from = startOfDayUtc(today, tz), weekEnd = startOfDayUtc(addDaysKey(today, 7), tz), tomorrow = startOfDayUtc(addDaysKey(today, 1), tz);
  const [events, tasks, reminders, approvals, unread] = await Promise.all([
    listEvents(u, from, weekEnd),
    listTasks(u, { status: ["TODO", "DOING", "WAITING"], dueBefore: weekEnd, take: 50 }),
    listReminders(u),
    db.approval.findMany({ where: { userId: u.id, stage: { in: ["DRAFT", "SUGGESTION"] } }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.notification.count({ where: { userId: u.id, readAt: null } }),
  ]);
  const todays = events.filter((e) => e.start < tomorrow);
  await audit({ actorKind: "ai", actorId: u.id, action: "nour.briefing", entity: "system" });
  return json({
    now: fmtDateTime(new Date(), tz),
    today: fmtDate(from, tz),
    schedule_today: todays.map((e) => ({ title: e.title, when: e.allDay ? "all day" : `${fmtTime(e.start, tz)} to ${fmtTime(e.end, tz)}`, where: e.location || null, with: e.contact?.name ?? null })),
    clashes_today: overlaps(todays).map(([a, b]) => `${a.title} overlaps ${b.title}`),
    rest_of_week: events.filter((e) => e.start >= tomorrow).map((e) => ({ title: e.title, when: e.allDay ? fmtDate(e.start, tz) : fmtDateTime(e.start, tz) })),
    tasks_due: tasks.filter((t) => t.due).map((t) => ({ title: t.title, due: fmtDate(t.due!, tz), overdue: t.due! < from, priority: t.priority, assignee: t.assignee?.name ?? null })),
    reminders: reminders.slice(0, 10).map((r) => ({ title: r.title, when: fmtDateTime(r.dueAt, tz), status: r.status.toLowerCase() })),
    waiting_for_approval: approvals.map((a) => a.title),
    unread_notifications: unread,
  });
}
