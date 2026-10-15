"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { createEventAction, deleteEventAction, updateEventAction } from "@/app/(app)/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Drawer } from "@/components/ui/Drawer";

export type Ev = { id: string; title: string; date: string; start: string; end: string; allDay: boolean; location: string; notes: string; contactId: string | null; contact: string | null; source: string };

const addDays = (k: string, n: number) => { const [y, m, d] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const addMonths = (k: string, n: number) => { const [y, m] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); };
const fmt = (k: string, o: Intl.DateTimeFormatOptions) => new Date(k + "T12:00:00Z").toLocaleDateString("en-GB", { ...o, timeZone: "UTC" });
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00–21:00
const PX = 48;
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

export function CalendarView({ view, date, from, days, today, events, tz, contacts, startNew }: { view: "month" | "week"; date: string; from: string; days: number; today: string; events: Ev[]; tz: string; contacts: { id: string; name: string }[]; startNew: boolean }) {
  const [editing, setEditing] = useState<Ev | { date: string; start?: string } | null>(null);
  useEffect(() => { if (startNew) setEditing({ date: today }); }, [startNew, today]);
  const keys = Array.from({ length: days }, (_, i) => addDays(from, i));
  const on = (k: string) => events.filter((e) => e.date === k).sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start));
  const prev = view === "week" ? addDays(date, -7) : addMonths(date, -1);
  const next = view === "week" ? addDays(date, 7) : addMonths(date, 1);
  const title = view === "week" ? `${fmt(keys[0], { day: "numeric", month: "short" })} – ${fmt(keys[6], { day: "numeric", month: "short", year: "numeric" })}` : fmt(date.slice(0, 8) + "01", { month: "long", year: "numeric" });
  const month = date.slice(0, 7);
  const href = (d: string, v = view) => `/calendar?date=${d}&view=${v}`;

  return (
    <>
      <PageHeader title="Calendar" sub={`Times in ${tz.replace("_", " ")}. Entries here are private to you; nobody is invited.`}
        actions={<button className="btn btn-primary" onClick={() => setEditing({ date: today })}><Icon name="plus" size={18} />New entry</button>} />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Link className="btn btn-sm" href={href(prev)} aria-label="Previous">‹</Link>
        <Link className="btn btn-sm" href={href(today)}>Today</Link>
        <Link className="btn btn-sm" href={href(next)} aria-label="Next">›</Link>
        <h2 className="font-bold text-lg ms-1" aria-live="polite">{title}</h2>
        <div className="flex-1" />
        <div className="inline-flex rounded-lg border border-line overflow-hidden" role="group" aria-label="View">
          {(["month", "week"] as const).map((v) => <Link key={v} href={href(date, v)} aria-current={view === v ? "true" : undefined} className={`px-3 h-9 grid place-items-center text-sm ${view === v ? "bg-teal text-white" : "bg-surface"}`}>{v === "month" ? "Month" : "Week"}</Link>)}
        </div>
      </div>

      {view === "month" ? (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 text-xs font-semibold text-muted border-b border-line">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {keys.map((k) => {
              const list = on(k);
              return (
                <div key={k} className={`min-h-[78px] md:min-h-[108px] border-b border-r border-line p-1 md:p-1.5 ${k.slice(0, 7) !== month ? "bg-surface-2/60" : ""}`} data-day={k}>
                  <button onClick={() => setEditing({ date: k })} className={`text-xs font-semibold w-6 h-6 rounded-full ${k === today ? "bg-teal text-white" : "hover:bg-surface-2"} ${k.slice(0, 7) !== month ? "text-muted" : ""}`} aria-label={`Add on ${fmt(k, { day: "numeric", month: "long" })}`}>{Number(k.slice(8))}</button>
                  <ul className="space-y-0.5 mt-0.5">
                    {list.slice(0, 3).map((e) => (
                      <li key={e.id}><button onClick={() => setEditing(e)} className="w-full text-left truncate text-[11.5px] md:text-xs px-1.5 py-0.5 rounded bg-teal-soft text-teal-strong font-medium">{!e.allDay && <span className="hidden md:inline tabular-nums">{e.start} </span>}{e.title}</button></li>
                    ))}
                    {list.length > 3 && <li><Link href={href(k, "week")} className="text-[11px] text-muted px-1">+{list.length - 3} more</Link></li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-line">
              <div />
              {keys.map((k) => (
                <button key={k} onClick={() => setEditing({ date: k })} className={`px-2 py-2 text-left text-sm border-l border-line ${k === today ? "text-teal-strong font-bold" : "font-semibold"}`}>
                  {fmt(k, { weekday: "short" })} <span className="text-muted font-normal">{fmt(k, { day: "numeric", month: "short" })}</span>
                  {on(k).filter((e) => e.allDay).map((e) => <span key={e.id} onClick={(ev) => { ev.stopPropagation(); setEditing(e); }} className="block truncate text-xs mt-1 px-1.5 py-0.5 rounded bg-teal-soft text-teal-strong font-medium">{e.title}</span>)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[52px_repeat(7,1fr)] relative">
              <div className="relative" style={{ height: PX * HOURS.length }}>{HOURS.map((h, i) => <div key={h} style={{ top: i * PX - 7 }} className="absolute right-0 text-[11px] text-muted pe-2">{String(h).padStart(2, "0")}:00</div>)}</div>
              {keys.map((k) => {
                const timed = on(k).filter((e) => !e.allDay);
                return (
                  <div key={k} className="relative border-l border-line" style={{ height: PX * HOURS.length }} data-day={k}>
                    {HOURS.map((h) => <button key={h} onClick={() => setEditing({ date: k, start: `${String(h).padStart(2, "0")}:00` })} style={{ height: PX }} className="block w-full border-b border-line/60 hover:bg-teal-soft/40" aria-label={`Add at ${h}:00 on ${fmt(k, { day: "numeric", month: "short" })}`} />)}
                    {timed.map((e) => {
                      const top = Math.max(0, ((mins(e.start) - 7 * 60) / 60) * PX);
                      const h = Math.max(22, ((Math.min(mins(e.end) || 24 * 60, 22 * 60) - Math.max(mins(e.start), 7 * 60)) / 60) * PX);
                      const clash = timed.some((o) => o.id !== e.id && o.start < e.end && e.start < o.end);
                      return (
                        <button key={e.id} onClick={() => setEditing(e)} style={{ top, height: h }} className={`absolute left-1 right-1 rounded-md px-1.5 py-0.5 text-left text-xs overflow-hidden bg-teal text-white shadow ${clash ? "ring-2 ring-warn" : ""}`} title={clash ? "Overlaps another entry" : undefined}>
                          <div className="font-semibold truncate">{e.title}</div><div className="opacity-85 tabular-nums">{e.start}–{e.end}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {editing && <EventEditor ev={"id" in editing ? editing : null} defaults={"id" in editing ? null : editing} contacts={contacts} onClose={() => setEditing(null)} />}
    </>
  );
}

function EventEditor({ ev, defaults, contacts, onClose }: { ev: Ev | null; defaults: { date: string; start?: string } | null; contacts: { id: string; name: string }[]; onClose: () => void }) {
  const start0 = defaults?.start ?? "09:00";
  const end0 = `${String(Math.min(23, Number(start0.slice(0, 2)) + 1)).padStart(2, "0")}:${start0.slice(3)}`;
  const [f, setF] = useState({ title: ev?.title ?? "", date: ev?.date ?? defaults?.date ?? "", start: ev?.start ?? start0, end: ev?.end ?? end0, allDay: ev?.allDay ?? false, location: ev?.location ?? "", notes: ev?.notes ?? "", contactId: ev?.contactId ?? "" });
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  const save = () => start(async () => {
    const data = { ...f, contactId: f.contactId || null, start: f.allDay ? "00:00" : f.start, end: f.allDay ? "23:59" : f.end };
    const r = ev ? await updateEventAction(ev.id, data) : await createEventAction(data);
    if (r.error) setErr(r.error); else onClose();
  });
  const remove = () => { if (!ev || !confirm(`Delete "${ev.title}"?`)) return; start(async () => { const r = await deleteEventAction(ev.id); if (r.error) setErr(r.error); else onClose(); }); };
  return (
    <Drawer title={ev ? "Edit calendar entry" : "New calendar entry"} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="block"><span className="label">Title</span><input className="input" value={f.title} onChange={set("title")} required /></label>
        <label className="block"><span className="label">Date</span><input className="input" type="date" value={f.date} onChange={set("date")} required /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.allDay} onChange={set("allDay")} />All day</label>
        {!f.allDay && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">Starts</span><input className="input" type="time" value={f.start} onChange={set("start")} required /></label>
            <label className="block"><span className="label">Ends</span><input className="input" type="time" value={f.end} onChange={set("end")} required /></label>
          </div>
        )}
        <label className="block"><span className="label">Location</span><input className="input" value={f.location} onChange={set("location")} placeholder="Office, hospital, video call…" /></label>
        <label className="block"><span className="label">Contact</span><select className="select" value={f.contactId} onChange={set("contactId")}><option value="">None</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block"><span className="label">Notes</span><textarea className="textarea" value={f.notes} onChange={set("notes")} /></label>
        {ev?.source === "assistant" && <p className="text-xs text-muted">Added by the assistant.</p>}
        {err && <p role="alert" className="err">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : ev ? "Save" : "Add to calendar"}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <div className="flex-1" />
          {ev && <button type="button" className="btn btn-danger" onClick={remove} disabled={pending}><Icon name="trash" size={16} />Delete</button>}
        </div>
      </form>
    </Drawer>
  );
}
