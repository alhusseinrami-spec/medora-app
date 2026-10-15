"use client";
import { useState, useTransition } from "react";
import { createReminderAction } from "@/app/(app)/actions";

export function NewReminder({ today, tomorrow, open }: { today: string; tomorrow: string; open: boolean }) {
  const [f, setF] = useState({ title: "", date: tomorrow, time: "09:00" });
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  return (
    <form className="card p-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] items-end" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createReminderAction(f); setMsg(r); if (!r.error) setF({ ...f, title: "" }); }); }}>
      <label className="block"><span className="label">Remind me to</span><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required autoFocus={open} placeholder="Call the supplier about the delivery" /></label>
      <label className="block"><span className="label">Date</span><input className="input" type="date" min={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></label>
      <label className="block"><span className="label">Time</span><input className="input" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} required /></label>
      <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Set reminder"}</button>
      {(msg.error || msg.ok) && <p role={msg.error ? "alert" : "status"} className={`sm:col-span-4 text-sm font-semibold ${msg.error ? "text-danger" : "text-ok"}`}>{msg.error ?? msg.ok}</p>}
    </form>
  );
}
