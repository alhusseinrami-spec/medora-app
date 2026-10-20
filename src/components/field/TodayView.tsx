"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { nearestRoute } from "@/lib/geo";
import { checkInNearestAction } from "@/app/(field)/actions";
import { getFix, stageOf, usd } from "./gps";

type Stop = { id: string; name: string; stage: string; placeType: string; lat: number | null; lng: number | null; due: boolean; visitedToday: boolean };

export function TodayView({ greeting, verifiedToday, salesMonth, ordersMonth, route }: { greeting: string; verifiedToday: number; salesMonth: number; ordersMonth: number; route: Stop[] }) {
  const router = useRouter();
  const [stops, setStops] = useState(route);
  const [msg, setMsg] = useState<{ ok?: string; error?: string; addNew?: boolean } | null>(null);
  const [busy, setBusy] = useState<"" | "log" | "sort">("");
  const [, start] = useTransition();

  async function logVisit() {
    setBusy("log"); setMsg(null);
    try {
      const fix = await getFix();
      const r = await checkInNearestAction(fix);
      if (r.error) setMsg({ error: r.error, addNew: true });
      else { setMsg({ ok: r.ok }); start(() => router.refresh()); }
    } catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy("");
  }

  async function optimize() {
    setBusy("sort"); setMsg(null);
    try { const fix = await getFix(); setStops((s) => nearestRoute(fix, s)); }
    catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy("");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-bold tracking-tight">{greeting}</h1>
      <div className="card p-4 grid grid-cols-2 gap-2">
        <div><div className="text-[34px] font-bold leading-none">{verifiedToday}</div><div className="text-ink-2 text-sm mt-1">verified visits today</div></div>
        <div className="text-right"><div className="text-[34px] font-bold leading-none">{usd(salesMonth)}</div><div className="text-ink-2 text-sm mt-1">{ordersMonth} approved order{ordersMonth === 1 ? "" : "s"} this month</div></div>
      </div>
      <div className="flex gap-2">
        <button onClick={logVisit} disabled={!!busy} className="btn btn-primary flex-1 !min-h-[52px] !text-[16px] !rounded-xl">
          <Icon name="pin" />{busy === "log" ? "Finding where you are…" : "Log visit"}
        </button>
        <Link href="/field/clients/new" className="btn !min-h-[52px] !w-[52px] !rounded-xl !p-0" aria-label="Add a client here"><Icon name="plus" /></Link>
      </div>
      {msg && (
        <div role={msg.error ? "alert" : "status"} className={`card p-3 text-sm ${msg.error ? "!border-warn" : "!border-ok"}`}>
          <p className={msg.error ? "text-warn font-semibold" : "text-ok font-semibold"}>{msg.error ?? msg.ok}</p>
          {msg.addNew && <Link href="/field/clients/new" className="btn btn-sm btn-primary mt-2"><Icon name="plus" size={16} />Add a new client here</Link>}
        </div>
      )}
      <section className="card">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <h2 className="font-bold text-[17px]">Today&apos;s route</h2>
          <button onClick={optimize} disabled={!!busy || stops.length < 2} className="btn btn-ghost btn-sm"><Icon name="route" size={18} />{busy === "sort" ? "Sorting…" : "Optimize order"}</button>
        </div>
        {stops.length === 0 ? (
          <p className="empty">Nothing due today. Follow-ups you set and leads you haven&apos;t seen in two weeks show up here.</p>
        ) : (
          <ol>
            {stops.map((s, i) => {
              const st = stageOf(s.stage);
              return (
                <li key={s.id} className="row !px-4 !py-3">
                  <span className={`w-8 h-8 shrink-0 rounded-full grid place-items-center text-sm font-semibold ${s.visitedToday ? "bg-ok-soft text-ok" : "bg-surface-2 text-ink-2"}`} aria-label={s.visitedToday ? "Visited today" : undefined}>
                    {s.visitedToday ? <Icon name="check" size={16} /> : i + 1}
                  </span>
                  <Link href={`/field/clients/${s.id}`} className="flex-1 min-w-0">
                    <div className="font-medium truncate">{s.name}</div>
                    <div className="text-xs text-muted truncate">{[s.placeType, s.due ? "Follow-up due" : "", s.lat == null ? "No location yet" : ""].filter(Boolean).join(" · ")}</div>
                  </Link>
                  <span className={`chip ${st.chip}`}>{st.label}</span>
                  <Icon name="expand" size={18} className="text-muted" />
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
