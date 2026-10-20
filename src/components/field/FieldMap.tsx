"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui/Icon";
import { checkInAction } from "@/app/(field)/actions";
import { getFix, STAGES, stageOf } from "./gps";

export type MapClient = { id: string; name: string; stage: string; placeType: string; lat: number; lng: number };

// South Lebanon coast, where the team works, until the rep's own position arrives.
const START: [number, number] = [33.56, 35.38];

export function FieldMap({ clients }: { clients: MapClient[] }) {
  const router = useRouter();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const me = useRef<L.CircleMarker | null>(null);
  const [sel, setSel] = useState<MapClient | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string; warn?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView(START, 10);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(m);
    L.control.zoom({ position: "topright" }).addTo(m);
    map.current = m;
    const pts = clients.map((c) => [c.lat, c.lng] as [number, number]);
    if (pts.length) m.fitBounds(pts, { padding: [40, 40], maxZoom: 15 });
    return () => { m.remove(); map.current = null; };
    // Markers are drawn in the effect below; the map itself is created once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const layer = L.layerGroup(clients.map((c) =>
      L.circleMarker([c.lat, c.lng], { radius: 10, color: "#fff", weight: 2.5, fillColor: stageOf(c.stage).color, fillOpacity: 1 })
        .bindTooltip(c.name, { direction: "top", offset: [0, -8] })
        .on("click", () => { setSel(c); setMsg(null); }),
    )).addTo(m);
    return () => { layer.remove(); };
  }, [clients]);

  async function locate() {
    try {
      const f = await getFix();
      const m = map.current!;
      me.current?.remove();
      me.current = L.circleMarker([f.lat, f.lng], { radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1 }).addTo(m);
      m.setView([f.lat, f.lng], 15);
    } catch (e) { setMsg({ error: (e as Error).message }); }
  }

  async function checkIn(c: MapClient) {
    setBusy(true); setMsg(null);
    try { const r = await checkInAction(c.id, await getFix()); setMsg(r); if (!r.error) start(() => router.refresh()); }
    catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy(false);
  }

  return (
    <div className="relative flex-1 min-h-[calc(100dvh-56px-62px)]">
      <div ref={el} className="absolute inset-0 z-0" role="application" aria-label="Map of your clients" />
      <div className="absolute top-3 left-3 z-[500] card px-3 py-2 text-sm space-y-0.5">
        {STAGES.map((s) => <div key={s.v} className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: s.color }} />{s.label}</div>)}
      </div>
      {clients.length === 0 && <p className="absolute top-3 right-14 left-32 z-[500] card p-2 text-sm">No clients with a location yet. Add one where you stand with +.</p>}
      <div className="absolute right-3 bottom-24 z-[500] flex flex-col gap-3">
        <button onClick={locate} className="w-12 h-12 rounded-xl bg-surface shadow-lg grid place-items-center border border-line" aria-label="Show where I am"><Icon name="target" /></button>
        <Link href="/field/clients/new" className="w-12 h-12 rounded-xl bg-teal text-white shadow-lg grid place-items-center" aria-label="Add a client here"><Icon name="plus" /></Link>
      </div>
      {sel && (
        <div className="absolute left-3 right-3 bottom-24 z-[600] card p-3 mr-16">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0"><div className="font-semibold truncate">{sel.name}</div><div className="text-xs text-muted">{[sel.placeType, stageOf(sel.stage).label].filter(Boolean).join(" · ")}</div></div>
            <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)} aria-label="Close"><Icon name="close" size={16} /></button>
          </div>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-primary flex-1" disabled={busy} onClick={() => checkIn(sel)}><Icon name="login" size={18} />{busy ? "Locating…" : "Check in"}</button>
            <Link className="btn flex-1" href={`/field/clients/${sel.id}`}>Open</Link>
          </div>
          {msg && <div role={msg.error ? "alert" : "status"} className="text-sm mt-2">{msg.error ? <p className="err">{msg.error}</p> : <p className="text-ok font-semibold">{msg.ok}</p>}{msg.warn && <p className="text-warn font-semibold">{msg.warn}</p>}</div>}
        </div>
      )}
      {!sel && msg?.error && <p role="alert" className="absolute left-3 right-20 bottom-24 z-[500] card p-2 err">{msg.error}</p>}
    </div>
  );
}
