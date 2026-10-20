"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { retrySyncAction } from "@/app/(field)/actions";

type Props = { id: string; status: string; connected: boolean; syncedAt: string | null; error: string; attempts: number };

// Where this approved order stands with the external accounting system.
export function SyncStatus({ id, status, connected, syncedAt, error, attempts }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const retry = async () => { setBusy(true); const r = await retrySyncAction(id); setBusy(false); setMsg(r.error ?? r.ok ?? ""); if (!r.error) router.refresh(); };
  let text: React.ReactNode, chip = "";
  if (status === "sent") { text = <>Sent to the accounting system{syncedAt ? `, ${syncedAt}` : ""}.</>; chip = "chip-ok"; }
  else if (!connected) { text = "Waiting. The accounting system isn't connected yet; this goes out as soon as it is."; chip = "chip-warn"; }
  else if (status === "failed") { text = <>Couldn&apos;t send after {attempts} tries. {error}</>; chip = "chip-danger"; }
  else { text = attempts ? <>Sending again shortly ({attempts} tr{attempts === 1 ? "y" : "ies"} so far). {error}</> : "Sending within a minute."; chip = "chip-warn"; }
  return (
    <div className="card p-3 text-sm flex flex-wrap items-center gap-2">
      <span className={`chip ${chip}`}>Accounting system</span>
      <span className="flex-1 min-w-[200px]">{text}</span>
      {connected && (status === "failed" || (status === "pending" && attempts > 0)) && <button className="btn btn-sm" disabled={busy} onClick={retry}>{busy ? "Queuing…" : "Send now"}</button>}
      {msg && <span role="status" className="w-full text-muted">{msg}</span>}
    </div>
  );
}
