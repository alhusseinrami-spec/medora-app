import { requireAuth } from "@/lib/auth";
import { addDaysKey, dayKey, fmtDate, fmtTime } from "@/lib/time";
import { listReminders } from "@/lib/services/reminders";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { ReminderActions } from "@/components/reminders/ReminderActions";
import { NewReminder } from "@/components/reminders/NewReminder";

export const metadata = { title: "Reminders" };

export default async function RemindersPage({ searchParams }: PageProps<"/reminders">) {
  const { user } = await requireAuth();
  const sp = await searchParams;
  const tz = user.timeZone;
  const all = await listReminders(user, true);
  const due = all.filter((r) => r.status === "SENT");
  const upcoming = all.filter((r) => r.status === "PENDING");
  const past = all.filter((r) => r.status === "DONE" || r.status === "DISMISSED").reverse().slice(0, 20);
  const today = dayKey(new Date(), tz);
  const Row = ({ r, actions }: { r: (typeof all)[number]; actions: boolean }) => (
    <li className="row flex-wrap">
      <Icon name="clock" size={18} className={r.status === "SENT" ? "text-warn" : "text-muted"} />
      <div className="flex-1 min-w-[160px]">
        <div className={`font-medium ${actions ? "" : "text-muted line-through"}`}>{r.title}</div>
        <div className="text-xs text-muted">{fmtDate(r.dueAt, tz)}, {fmtTime(r.dueAt, tz)}{r.task ? ` · Task: ${r.task.title}` : ""}{r.event ? ` · Event: ${r.event.title}` : ""}</div>
      </div>
      {actions ? <ReminderActions id={r.id} /> : <span className="chip">{r.status === "DONE" ? "Done" : "Dismissed"}</span>}
    </li>
  );
  return (
    <>
      <PageHeader title="Reminders" sub={`Reminders arrive in the bell and as a desktop alert when you allow it. Times are in ${tz.replace("_", " ")}.`} />
      <NewReminder today={today} tomorrow={addDaysKey(today, 1)} open={sp.new === "1"} />
      {due.length > 0 && (
        <section className="card overflow-hidden mt-4" aria-labelledby="due-h"><div className="card-h"><h2 id="due-h" className="card-t text-warn">Due now</h2></div><ul>{due.map((r) => <Row key={r.id} r={r} actions />)}</ul></section>
      )}
      <section className="card overflow-hidden mt-4" aria-labelledby="up-h">
        <div className="card-h"><h2 id="up-h" className="card-t">Upcoming</h2></div>
        <ul>{upcoming.map((r) => <Row key={r.id} r={r} actions />)}</ul>
        {!upcoming.length && <p className="empty">No upcoming reminders.</p>}
      </section>
      {past.length > 0 && (
        <section className="card overflow-hidden mt-4" aria-labelledby="past-h"><div className="card-h"><h2 id="past-h" className="card-t">Recently cleared</h2></div><ul>{past.map((r) => <Row key={r.id} r={r} actions={false} />)}</ul></section>
      )}
    </>
  );
}
