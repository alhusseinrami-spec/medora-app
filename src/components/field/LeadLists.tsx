"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { importLeadListAction } from "@/app/(field)/actions";

type List = { id: string; title: string; total: number; added: number };

// Managers add a researched list of places to the pipeline as leads.
export function LeadLists({ lists }: { lists: List[] }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok?: string; error?: string; warn?: string } | null>(null);
  const [busy, setBusy] = useState("");
  const [, start] = useTransition();

  async function add(id: string) {
    setBusy(id); setMsg(null);
    try { const r = await importLeadListAction(id); setMsg(r); if (!r.error) start(() => router.refresh()); }
    catch (e) { setMsg({ error: (e as Error).message }); }
    setBusy("");
  }

  return (
    <section className="card">
      <h2 className="px-4 pt-3 pb-1 font-bold">Lead lists</h2>
      <ul>
        {lists.map((l) => (
          <li key={l.id} className="row">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{l.title}</div>
              <div className="text-xs text-muted">{l.added ? `${l.added} of ${l.total} in the pipeline` : `${l.total} places`}</div>
            </div>
            <button onClick={() => add(l.id)} disabled={!!busy || l.added >= l.total} className="btn btn-primary shrink-0">
              {busy === l.id ? "Adding…" : l.added >= l.total ? "Added" : l.added ? "Add the rest" : "Add as leads"}
            </button>
          </li>
        ))}
      </ul>
      {msg && (
        <div role={msg.error ? "alert" : "status"} className="text-sm px-4 pb-3">
          {msg.error ? <p className="err">{msg.error}</p> : <p className="font-semibold text-ok">{msg.ok}</p>}
          {msg.warn && <p className="text-warn font-semibold mt-0.5">{msg.warn}</p>}
        </div>
      )}
    </section>
  );
}
