"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { markDeliveredAction } from "@/app/(field)/actions";
import { directionsLink, getFix, telLink, waLink } from "./gps";

// Call, WhatsApp and directions for the client, and "Delivered", which records where the phone is.
export function DeliverActions({ id, phone, whatsapp, location, delivered }: {
  id: string; phone: string; whatsapp: string; location: { lat: number; lng: number } | null; delivered: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string; warn?: string } | null>(null);
  const [, start] = useTransition();

  async function deliver() {
    setBusy(true); setMsg(null);
    try { const r = await markDeliveredAction(id, await getFix(), note); setMsg(r); if (!r.error) start(() => router.refresh()); }
    catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy(false);
  }

  const tile = "flex flex-col items-center justify-center gap-1 rounded-xl min-h-[64px] text-[13px] font-medium";
  const off = "bg-surface-2 text-muted opacity-60 pointer-events-none";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <a href={location ? directionsLink(location.lat, location.lng) : undefined} target="_blank" rel="noreferrer" className={`${tile} ${location ? "bg-surface-2" : off}`} aria-disabled={!location}><Icon name="directions" />Directions</a>
        <a href={phone ? telLink(phone) : undefined} className={`${tile} ${phone ? "bg-surface-2" : off}`} aria-disabled={!phone}><Icon name="phone" />Call</a>
        <a href={whatsapp ? waLink(whatsapp) : undefined} target="_blank" rel="noreferrer" className={`${tile} ${whatsapp ? "bg-surface-2" : off}`} aria-disabled={!whatsapp}><Icon name="whatsapp" />WhatsApp</a>
      </div>
      {!delivered && (
        <>
          <label className="block"><span className="label">Note (optional)</span>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Received by, paid in cash, left with reception…" />
          </label>
          <button onClick={deliver} disabled={busy} className="btn btn-primary w-full !min-h-[52px] !text-[16px]"><Icon name="check" />{busy ? "Getting your location…" : "Delivered"}</button>
          <p className="text-xs text-muted text-center">Tap at the client. Your location is saved as proof of delivery.</p>
        </>
      )}
      {msg && (
        <div role={msg.error ? "alert" : "status"} className="text-sm">
          {msg.error ? <p className="err">{msg.error}</p> : <p className="font-semibold text-ok">{msg.ok}</p>}
          {msg.warn && <p className="text-warn font-semibold mt-0.5">{msg.warn}</p>}
        </div>
      )}
    </div>
  );
}
