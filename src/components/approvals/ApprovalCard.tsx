"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { approveAction, rejectAction } from "@/app/(app)/actions";
import { Icon } from "@/components/ui/Icon";

export type ApprovalView = {
  id: string; kind: string; kindLabel: string; title: string; detail: string; stage: string; payload: Record<string, unknown>;
  requestedBy: string; owner: string; mine: boolean; created: string; decided: string | null; result: string; resultLink: string; names: Record<string, string>;
};
const STAGE: Record<string, [string, string]> = { SUGGESTION: ["Suggestion", "chip"], DRAFT: ["Waiting for approval", "chip-teal"], APPROVED: ["Approved", "chip-warn"], COMPLETED: ["Completed", "chip-ok"], REJECTED: ["Rejected", "chip-danger"] };
const FIELD: Record<string, string> = { title: "Title", notes: "Notes", due: "Due", priority: "Priority", taskId: "Task", assigneeId: "Assign to", eventId: "Calendar entry", contactId: "Contact", content: "Remember", kind: "Type" };
// Fields the approver may adjust before approving.
const EDITABLE: Record<string, string[]> = { "task.create": ["title", "due", "priority", "notes"], "memory.save": ["content"] };

export function ApprovalCard({ a }: { a: ApprovalView }) {
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pending, start] = useTransition();
  const open = a.stage === "DRAFT" || a.stage === "SUGGESTION";
  const editable = EDITABLE[a.kind] ?? [];
  const val = (k: string) => (k in edits ? edits[k] : a.payload[k] == null ? "" : String(a.payload[k]));
  const approve = () => start(async () => {
    const e = Object.fromEntries(Object.entries(edits).map(([k, v]) => [k, k === "due" ? v || null : v]));
    setMsg(await approveAction(a.id, Object.keys(e).length ? e : undefined));
  });
  const [label, chip] = STAGE[a.stage] ?? [a.stage, "chip"];

  return (
    <article className="card p-4" data-approval={a.id}>
      <div className="flex flex-wrap items-start gap-2">
        <Icon name="shield" className="text-teal mt-0.5" />
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-semibold">{a.title}</h2>
          <div className="text-xs text-muted">{a.kindLabel} · {a.requestedBy === "ai" ? "Prepared by the assistant" : a.requestedBy === "automation" ? "From an automation" : "Requested"}{!a.mine && ` for ${a.owner}`} · {a.created}</div>
        </div>
        <span className={`chip ${chip}`}>{label}</span>
      </div>
      {a.detail && <p className="text-sm text-ink-2 mt-2">{a.detail}</p>}
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm bg-surface-2 rounded-lg p-3">
        {Object.entries(a.payload).filter(([, v]) => v !== "" && v != null).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{FIELD[k] ?? k}</dt>
            <dd className="min-w-0 break-words">{editing && editable.includes(k) ? null : a.names[String(v)] ?? String(v)}</dd>
          </div>
        ))}
      </dl>
      {editing && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {editable.map((k) => (
            <label key={k} className={k === "notes" || k === "content" ? "sm:col-span-2" : ""}>
              <span className="label">{FIELD[k]}</span>
              {k === "priority" ? <select className="select" value={val(k) || "P3"} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })}>{["P1", "P2", "P3", "P4"].map((p) => <option key={p}>{p}</option>)}</select>
                : k === "due" ? <input type="date" className="input" value={val(k)} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} />
                : k === "notes" || k === "content" ? <textarea className="textarea" value={val(k)} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} />
                : <input className="input" value={val(k)} onChange={(e) => setEdits({ ...edits, [k]: e.target.value })} />}
            </label>
          ))}
        </div>
      )}
      {a.decided && <p className="text-xs text-muted mt-2">Decided by {a.decided}</p>}
      {a.result && <p className={`text-sm mt-1 font-medium ${a.result.startsWith("Failed") ? "text-danger" : "text-ok"}`}>{a.result}{a.resultLink && <> · <Link className="text-teal" href={a.resultLink}>Open</Link></>}</p>}
      {open && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button className="btn btn-primary" onClick={approve} disabled={pending}><Icon name="check" size={16} />{pending ? "Working…" : editing ? "Approve with changes" : "Approve"}</button>
          {editable.length > 0 && <button className="btn" onClick={() => setEditing((e) => !e)} disabled={pending}><Icon name="edit" size={16} />{editing ? "Cancel edit" : "Edit"}</button>}
          <button className="btn btn-danger" onClick={() => start(async () => setMsg(await rejectAction(a.id)))} disabled={pending}>Reject</button>
        </div>
      )}
      {(msg.error || msg.ok) && <p role={msg.error ? "alert" : "status"} className={`text-sm font-semibold mt-2 ${msg.error ? "text-danger" : "text-ok"}`}>{msg.error ?? msg.ok}</p>}
    </article>
  );
}
