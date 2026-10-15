import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDaysKey, dayKey, fmtDate, fmtTime, startOfDayUtc } from "@/lib/time";
import { listTasks } from "@/lib/services/tasks";
import { listEvents, overlaps } from "@/lib/services/events";
import { listReminders } from "@/lib/services/reminders";
import { listApprovals } from "@/lib/services/approvals";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { WeekChart } from "@/components/dashboard/WeekChart";
import { QuickAdd } from "@/components/dashboard/QuickAdd";
import { ReminderActions } from "@/components/reminders/ReminderActions";

export const metadata = { title: "Dashboard" };

const PRI: Record<string, string> = { P1: "chip-danger", P2: "chip-warn", P3: "", P4: "" };

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const { user } = await requireAuth();
  const sp = await searchParams;
  const tz = user.timeZone;
  const today = dayKey(new Date(), tz);
  const [todayEvents, openTasks, reminders, approvals, layoutRow] = await Promise.all([
    listEvents(user, startOfDayUtc(today, tz), startOfDayUtc(addDaysKey(today, 1), tz)),
    listTasks(user, { status: ["TODO", "DOING", "WAITING"] }),
    listReminders(user),
    listApprovals(user, "DRAFT"),
    db.setting.findUnique({ where: { userId_key: { userId: user.id, key: "dashboard.layout" } } }),
  ]);
  const mine = openTasks.filter((t) => t.ownerId === user.id || t.assigneeId === user.id);
  const overdue = mine.filter((t) => t.due && dayKey(t.due, tz) < today);
  const dueToday = mine.filter((t) => t.due && dayKey(t.due, tz) === today);
  const clashes = overlaps(todayEvents);
  const firedReminders = reminders.filter((r) => r.status === "SENT");
  const upcoming = reminders.filter((r) => r.status === "PENDING").slice(0, 6);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const week = Array.from({ length: 7 }, (_, i) => {
    const k = addDaysKey(today, i);
    const ts = mine.filter((t) => t.due && dayKey(t.due, tz) === k);
    return { key: k, label: fmtDate(startOfDayUtc(k, tz), tz), count: ts.length, high: ts.filter((t) => t.priority === "P1" || t.priority === "P2").length };
  });

  const attention = [
    ...overdue.map((t) => ({ id: `o${t.id}`, tone: "danger", text: `Overdue: ${t.title}`, sub: `Was due ${fmtDate(t.due!, tz)}`, href: `/tasks?open=${t.id}` })),
    ...approvals.slice(0, 5).map((a) => ({ id: `a${a.id}`, tone: "teal", text: `Waiting for approval: ${a.title}`, sub: a.requestedBy === "ai" ? "Prepared by the assistant" : "Requested", href: "/approvals" })),
    ...clashes.map(([a, b]) => ({ id: `c${a.id}${b.id}`, tone: "warn", text: `Overlap: ${a.title} and ${b.title}`, sub: `${fmtTime(b.start, tz)} today`, href: `/calendar?date=${today}` })),
    ...firedReminders.map((r) => ({ id: `r${r.id}`, tone: "warn", text: `Reminder: ${r.title}`, sub: `Due ${fmtTime(r.dueAt, tz)}`, href: "/reminders" })),
  ];

  const panels: Record<string, { title: string; wide?: boolean; node: React.ReactNode }> = {
    attention: {
      title: "Needs your attention", wide: true,
      node: attention.length ? (
        <ul>{attention.slice(0, 8).map((a) => (
          <li key={a.id} className="row">
            <span className={`w-2 h-2 rounded-full shrink-0 ${a.tone === "danger" ? "bg-danger" : a.tone === "warn" ? "bg-warn" : "bg-teal"}`} aria-hidden />
            <Link href={a.href} className="flex-1 min-w-0 hover:underline"><span className="font-medium">{a.text}</span><span className="block text-xs text-muted">{a.sub}</span></Link>
          </li>))}
        </ul>
      ) : <p className="empty">Nothing urgent. Overdue tasks, approvals, meeting overlaps and due reminders appear here.</p>,
    },
    schedule: {
      title: "Today's schedule",
      node: todayEvents.length ? (
        <ul>{todayEvents.map((e) => (
          <li key={e.id} className="row">
            <span className="w-14 text-sm font-semibold tabular-nums text-teal-strong shrink-0">{e.allDay ? "All day" : fmtTime(e.start, tz)}</span>
            <div className="min-w-0 flex-1"><div className="font-medium truncate">{e.title}</div>{(e.location || e.contact) && <div className="text-xs text-muted truncate">{[e.location, e.contact?.name].filter(Boolean).join(" · ")}</div>}</div>
          </li>))}
        </ul>
      ) : <p className="empty">No meetings today. <Link className="text-teal font-semibold" href="/calendar?new=1">Add one</Link></p>,
    },
    tasks: {
      title: "Due today and overdue",
      node: (
        <>
          {[...overdue, ...dueToday].length ? (
            <ul>{[...overdue, ...dueToday].slice(0, 8).map((t) => (
              <li key={t.id} className="row">
                <Link href={`/tasks?open=${t.id}`} className="flex-1 min-w-0 truncate hover:underline">{t.title}</Link>
                <span className={`chip ${PRI[t.priority]}`}>{t.priority}</span>
                {overdue.includes(t) && <span className="chip chip-danger">Overdue</span>}
              </li>))}
            </ul>
          ) : <p className="empty">You’re clear for today.</p>}
          <div className="px-4 pb-3 pt-1"><QuickAdd today={today} /></div>
        </>
      ),
    },
    week: { title: "Tasks due in the next 7 days", node: <WeekChart days={week} /> },
    reminders: {
      title: "Reminders",
      node: [...firedReminders, ...upcoming].length ? (
        <ul>{[...firedReminders, ...upcoming].map((r) => (
          <li key={r.id} className="row">
            <Icon name="clock" size={18} className={r.status === "SENT" ? "text-warn" : "text-muted"} />
            <div className="flex-1 min-w-0"><div className="truncate font-medium">{r.title}</div><div className="text-xs text-muted">{fmtDate(r.dueAt, tz)}, {fmtTime(r.dueAt, tz)}{r.status === "SENT" ? " · due now" : ""}</div></div>
            <ReminderActions id={r.id} compact />
          </li>))}
        </ul>
      ) : <p className="empty">No reminders set. Ask the assistant, or <Link className="text-teal font-semibold" href="/reminders?new=1">add one</Link>.</p>,
    },
    approvals: {
      title: "Approval Center",
      node: approvals.length ? (
        <ul>{approvals.slice(0, 5).map((a) => (
          <li key={a.id} className="row"><Icon name="shield" size={18} className="text-teal" /><span className="flex-1 min-w-0 truncate">{a.title}</span><Link href="/approvals" className="btn btn-sm">Review</Link></li>))}
        </ul>
      ) : <p className="empty">Nothing waiting. Actions the assistant prepares for you appear here before they run.</p>,
    },
  };

  const layout = (layoutRow?.value ?? null) as { order: string[]; hidden: string[] } | null;
  return (
    <>
      {sp.denied && <div role="alert" className="card p-3 mb-4 border-warn text-sm"><strong>That page needs a different role.</strong> Ask the owner if you need access.</div>}
      <PageHeader title={`${greet}, ${user.name.split(" ")[0]}`} sub={`${fmtDate(new Date(), tz)} · ${overdue.length} overdue · ${dueToday.length} due today · ${todayEvents.length} meeting${todayEvents.length === 1 ? "" : "s"} · ${approvals.length} waiting for approval`} />
      <DashboardGrid
        panels={Object.entries(panels).map(([id, p]) => ({ id, title: p.title, wide: !!p.wide, node: p.node }))}
        layout={layout}
      />
    </>
  );
}
