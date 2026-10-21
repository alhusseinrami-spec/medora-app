"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { assignDriverAction } from "@/app/(field)/actions";

type Props = {
  id: string;
  driverId: string | null;
  drivers: { id: string; name: string }[];
  assigned: string | null;
  delivered: { at: string; verified: boolean; distance: string | null; note: string } | null;
};

// Who takes this approved order to the client, and whether it got there.
export function DeliveryAssign({ id, driverId, drivers, assigned, delivered }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const change = async (v: string) => {
    setBusy(true);
    const r = await assignDriverAction(id, v || null);
    setBusy(false);
    setMsg(r.error ?? r.ok ?? "");
    if (!r.error) router.refresh();
  };
  if (delivered) {
    return (
      <div className="card p-3 text-sm flex flex-wrap items-center gap-2">
        <span className={`chip ${delivered.verified ? "chip-ok" : "chip-warn"}`}>Delivered</span>
        <span className="flex-1 min-w-[200px]">
          {delivered.at}{delivered.verified ? " · at the client" : delivered.distance ? ` · ${delivered.distance} from the client's pin` : " · location not checked"}
          {delivered.note && <> · &ldquo;{delivered.note}&rdquo;</>}
        </span>
      </div>
    );
  }
  return (
    <div className="card p-3 text-sm flex flex-wrap items-center gap-2">
      <span className={`chip ${driverId ? "chip-warn" : ""}`}>Delivery</span>
      {drivers.length === 0 ? (
        <span className="flex-1 min-w-[200px]">No drivers yet. Add one under <Link href="/settings" className="underline">Settings → Team</Link> with the Driver role.</span>
      ) : (
        <>
          <label htmlFor="driver" className="text-muted">Driver</label>
          <select id="driver" className="input !w-auto" value={driverId ?? ""} disabled={busy} onChange={(e) => change(e.target.value)}>
            <option value="">Not assigned</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <span className="flex-1 min-w-[160px] text-muted">{driverId ? `On the way${assigned ? `, assigned ${assigned}` : ""}. Not delivered yet.` : "Pick who takes it to the client."}</span>
        </>
      )}
      {msg && <span role="status" className="w-full text-muted">{msg}</span>}
    </div>
  );
}
