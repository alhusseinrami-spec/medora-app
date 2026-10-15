"use client";
import { useState, useTransition } from "react";
import { reminderStatusAction, snoozeReminderAction } from "@/app/(app)/actions";
import { Icon } from "@/components/ui/Icon";

const SNOOZE = [[10, "10 minutes"], [60, "1 hour"], [180, "3 hours"], [1440, "Tomorrow"]] as const;

export function ReminderActions({ id, compact = false }: { id: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => { const r = await fn(); setErr(r.error ?? ""); });
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button className="btn btn-sm" disabled={pending} onClick={() => run(() => reminderStatusAction(id, "DONE"))} aria-label="Mark done"><Icon name="check" size={16} />{!compact && "Done"}</button>
      <select className="select !w-auto !min-h-[30px] !py-0 text-sm" disabled={pending} value="" onChange={(e) => { const m = Number(e.target.value); if (m) run(() => snoozeReminderAction(id, m)); }} aria-label="Snooze">
        <option value="">Snooze</option>
        {SNOOZE.map(([m, l]) => <option key={m} value={m}>{l}</option>)}
      </select>
      {!compact && <button className="btn btn-sm btn-ghost" disabled={pending} onClick={() => run(() => reminderStatusAction(id, "DISMISSED"))}>Dismiss</button>}
      {err && <span role="alert" className="err">{err}</span>}
    </div>
  );
}
