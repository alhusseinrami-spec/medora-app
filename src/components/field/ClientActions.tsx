"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { checkInAction, followUpAction, relocateClientAction, updateClientAction } from "@/app/(field)/actions";
import { addDaysKey } from "@/lib/time";
import { directionsLink, getFix, STAGES, telLink, waLink, type Stage } from "./gps";

type Props = {
  id: string; name: string; stage: Stage; phone: string; whatsapp: string;
  location: { lat: number; lng: number } | null; canMovePin: boolean; today: string; hasFollowUp: boolean;
};

export function ClientActions({ id, name, stage, phone, whatsapp, location, canMovePin, today, hasFollowUp }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok?: string; error?: string; warn?: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [fu, setFu] = useState({ date: addDaysKey(today, 1), time: "09:00" });
  const [, start] = useTransition();

  async function run(key: string, fn: () => Promise<{ ok?: string; error?: string; warn?: string }>) {
    setBusy(key); setMsg(null);
    try { const r = await fn(); setMsg(r); if (!r.error) start(() => router.refresh()); }
    catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy("");
  }
  const checkIn = () => run("in", async () => checkInAction(id, await getFix()));
  const pinHere = () => run("pin", async () => relocateClientAction(id, await getFix()));

  const tile = "flex flex-col items-center justify-center gap-1 rounded-xl min-h-[64px] text-[13px] font-medium";
  const off = "bg-surface-2 text-muted opacity-60 pointer-events-none";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <button onClick={checkIn} disabled={!!busy} className={`${tile} bg-teal text-white`}><Icon name="login" />{busy === "in" ? "Locating…" : "Check in"}</button>
        <a href={whatsapp ? waLink(whatsapp) : undefined} target="_blank" rel="noreferrer" className={`${tile} ${whatsapp ? "bg-surface-2" : off}`} aria-disabled={!whatsapp}><Icon name="whatsapp" />WhatsApp</a>
        <a href={phone ? telLink(phone) : undefined} className={`${tile} ${phone ? "bg-surface-2" : off}`} aria-disabled={!phone}><Icon name="phone" />Call</a>
        <a href={location ? directionsLink(location.lat, location.lng) : undefined} target="_blank" rel="noreferrer" className={`${tile} ${location ? "bg-surface-2" : off}`} aria-disabled={!location}><Icon name="directions" />Directions</a>
      </div>
      {msg && (
        <div role={msg.error ? "alert" : "status"} className="text-sm">
          {msg.error ? <p className="err">{msg.error}</p> : <p className="font-semibold text-ok">{msg.ok}</p>}
          {msg.warn && <p className="text-warn font-semibold mt-0.5">{msg.warn}</p>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Link href={`/field/clients/${id}/order`} className="btn btn-primary !min-h-[46px]"><Icon name="cart" size={18} />Take order</Link>
        <Link href={`/field/clients/${id}/order?kind=proforma`} className="btn !min-h-[46px]"><Icon name="box" size={18} />Request proforma</Link>
      </div>
      {(!location || canMovePin) && (
        <button onClick={pinHere} disabled={!!busy} className="btn w-full"><Icon name="pin" size={18} />{busy === "pin" ? "Locating…" : location ? "Move the pin to where I am" : "Save where I am as this client's location"}</button>
      )}

      <section className="card p-4 space-y-3">
        <label className="block"><span className="label">Stage</span>
          <select className="select" defaultValue={stage} onChange={(e) => run("stage", () => updateClientAction(id, { stage: e.target.value }))} aria-label={`Stage for ${name}`}>
            {STAGES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}
          </select>
        </label>
        <div>
          <span className="label">Follow-up reminder</span>
          <div className="flex flex-wrap gap-2 mb-2">
            {[["Tomorrow", 1], ["In 3 days", 3], ["Next week", 7], ["In a month", 30]].map(([l, n]) => (
              <button key={l} type="button" className="btn btn-sm" disabled={!!busy} onClick={() => run("fu", () => followUpAction(id, addDaysKey(today, n as number), "09:00"))}>{l}</button>
            ))}
            {hasFollowUp && <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => run("fu", () => followUpAction(id, null))}>Clear</button>}
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <input type="date" className="input min-w-0" value={fu.date} min={today} onChange={(e) => setFu({ ...fu, date: e.target.value })} aria-label="Follow-up date" />
            <input type="time" className="input !w-[104px]" value={fu.time} onChange={(e) => setFu({ ...fu, time: e.target.value })} aria-label="Follow-up time" />
            <button type="button" className="btn" disabled={!!busy || !fu.date} onClick={() => run("fu", () => followUpAction(id, fu.date, fu.time))}>Set</button>
          </div>
        </div>
      </section>
    </div>
  );
}
