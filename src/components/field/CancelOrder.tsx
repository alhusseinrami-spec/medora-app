"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelOrderAction } from "@/app/(field)/actions";

export function CancelOrder({ id }: { id: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <button className="btn btn-danger w-full" disabled={busy} onClick={async () => {
        if (!confirm("Cancel this before accounting reviews it?")) return;
        setBusy(true); const r = await cancelOrderAction(id); setBusy(false);
        if (r.error) setErr(r.error); else router.refresh();
      }}>{busy ? "Cancelling…" : "Cancel"}</button>
      {err && <p role="alert" className="err mt-1">{err}</p>}
    </div>
  );
}
