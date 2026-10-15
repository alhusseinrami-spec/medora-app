import { requireAuth } from "@/lib/auth";
import { addDaysKey, dayKey, startOfDayUtc, timeKey } from "@/lib/time";
import { listEvents } from "@/lib/services/events";
import { listContacts } from "@/lib/services/contacts";
import { CalendarView, type Ev } from "@/components/calendar/CalendarView";

export const metadata = { title: "Calendar" };

// Monday-based weeks. Keys are YYYY-MM-DD in the user's time zone.
const weekday = (k: string) => (new Date(k + "T12:00:00Z").getUTCDay() + 6) % 7;

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const { user } = await requireAuth();
  const sp = await searchParams;
  const tz = user.timeZone;
  const today = dayKey(new Date(), tz);
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const view = sp.view === "week" ? "week" : "month";
  let from: string, days: number;
  if (view === "week") { from = addDaysKey(date, -weekday(date)); days = 7; }
  else { const first = date.slice(0, 8) + "01"; from = addDaysKey(first, -weekday(first)); days = 42; }
  const [events, contacts] = await Promise.all([
    listEvents(user, startOfDayUtc(from, tz), startOfDayUtc(addDaysKey(from, days), tz)),
    listContacts(user, undefined, 300),
  ]);
  const evs: Ev[] = events.map((e) => ({
    id: e.id, title: e.title, date: dayKey(e.start, tz), start: timeKey(e.start, tz), end: timeKey(e.end, tz), allDay: e.allDay,
    location: e.location, notes: e.notes, contactId: e.contactId, contact: e.contact?.name ?? null, source: e.source,
  }));
  return (
    <CalendarView view={view} date={date} from={from} days={days} today={today} events={evs} tz={tz}
      contacts={contacts.map((c) => ({ id: c.id, name: c.name }))} startNew={sp.new === "1"} />
  );
}
