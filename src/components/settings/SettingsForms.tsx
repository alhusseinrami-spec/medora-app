"use client";
import { useState, useTransition } from "react";
import type { Role } from "@prisma/client";
import { ASSIGNABLE_ROLES, ROLE_LABEL } from "@/lib/rbac";
import { addMemoryAction, changePasswordAction, createUserAction, deleteMemoryAction, deleteMyDataAction, revokeSessionAction, setRetentionAction, updateProfileAction, updateUserAction, type Res } from "@/app/(app)/actions";
import { Icon } from "@/components/ui/Icon";

function Msg({ r }: { r: Res }) {
  if (r.error) return <p role="alert" className="err mt-2">{r.error}</p>;
  if (r.ok) return <p role="status" className="text-sm font-semibold text-ok mt-2">{r.ok}</p>;
  return null;
}
function useAct() {
  const [r, setR] = useState<Res>({});
  const [pending, start] = useTransition();
  return { r, pending, run: (fn: () => Promise<Res>) => start(async () => setR(await fn())) };
}

export function ProfileForm({ name, timeZone, zones }: { name: string; timeZone: string; zones: string[] }) {
  const [f, setF] = useState({ name, timeZone });
  const { r, pending, run } = useAct();
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(() => updateProfileAction(f)); }} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
      <label><span className="label">Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
      <label><span className="label">Time zone</span><select className="select" value={f.timeZone} onChange={(e) => setF({ ...f, timeZone: e.target.value })}>{zones.map((z) => <option key={z}>{z}</option>)}</select></label>
      <button className="btn btn-primary" disabled={pending}>Save</button>
      <div className="sm:col-span-3"><Msg r={r} /></div>
    </form>
  );
}

export function ChangePassword() {
  const [f, setF] = useState({ current: "", next: "" });
  const { r, pending, run } = useAct();
  return (
    <form onSubmit={(e) => { e.preventDefault(); run(async () => { const x = await changePasswordAction(f); if (!x.error) setF({ current: "", next: "" }); return x; }); }} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end">
      <label><span className="label">Current password</span><input className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
      <label><span className="label">New password</span><input className="input" type="password" autoComplete="new-password" minLength={12} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></label>
      <button className="btn" disabled={pending}>Change password</button>
      <div className="sm:col-span-3"><Msg r={r} /></div>
    </form>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const { r, pending, run } = useAct();
  return <span className="flex items-center gap-2"><button className="btn btn-sm btn-danger" disabled={pending} onClick={() => run(() => revokeSessionAction(id))}>Sign out</button>{r.error && <span className="err">{r.error}</span>}</span>;
}

export function MemoryList({ items }: { items: { id: string; content: string; source: string; approved: boolean }[] }) {
  const [text, setText] = useState("");
  const { r, pending, run } = useAct();
  return (
    <>
      <ul className="border border-line rounded-xl mb-3">
        {items.map((m) => (
          <li key={m.id} className="row">
            <span className="flex-1 text-sm">{m.content}</span>
            <span className="chip">{m.source === "assistant" ? "Approved suggestion" : "Added by you"}</span>
            <button className="btn btn-ghost btn-sm" aria-label="Forget this" disabled={pending} onClick={() => run(() => deleteMemoryAction(m.id))}><Icon name="trash" size={16} /></button>
          </li>
        ))}
        {!items.length && <li className="empty">Nothing saved. Example: “Draft customer replies in French for Hôtel-Dieu.”</li>}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); run(async () => { const x = await addMemoryAction(text); if (!x.error) setText(""); return x; }); }}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a preference or fact for the assistant" aria-label="New memory" />
        <button className="btn" disabled={pending || !text.trim()}>Add</button>
      </form>
      <Msg r={r} />
    </>
  );
}

type U = { id: string; name: string; email: string; role: string; disabled: boolean; mfaEnabled: boolean; createdAt: string };
export function TeamManager({ users, me, isOwner }: { users: U[]; me: string; isOwner: boolean }) {
  const [f, setF] = useState({ name: "", email: "", role: "SALESPERSON", password: "" });
  const { r, pending, run } = useAct();
  const roles = ASSIGNABLE_ROLES.filter((x) => isOwner || x !== "ADMIN");
  return (
    <>
      <div className="overflow-x-auto border border-line rounded-xl mb-4">
        <table className="w-full text-sm min-w-[620px]">
          <thead><tr className="text-left text-muted"><th className="p-2.5 font-medium">Person</th><th className="p-2.5 font-medium">Role</th><th className="p-2.5 font-medium">2-step</th><th className="p-2.5 font-medium">Status</th><th /></tr></thead>
          <tbody>{users.map((u) => {
            const locked = u.role === "OWNER" || u.id === me || (u.role === "ADMIN" && !isOwner);
            return (
              <tr key={u.id} className="border-t border-line">
                <td className="p-2.5"><div className="font-medium">{u.name}</div><div className="text-xs text-muted">{u.email}</div></td>
                <td className="p-2.5">{locked ? ROLE_LABEL[u.role as Role] : (
                  <select className="select !w-auto !min-h-[30px] !py-0" defaultValue={u.role} disabled={pending} onChange={(e) => run(() => updateUserAction(u.id, { role: e.target.value as never }))} aria-label={`Role for ${u.name}`}>{roles.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}</select>)}</td>
                <td className="p-2.5">{u.mfaEnabled ? <span className="chip chip-ok">On</span> : <span className="chip">Off</span>}</td>
                <td className="p-2.5">{u.disabled ? <span className="chip chip-danger">Disabled</span> : <span className="chip chip-ok">Active</span>}</td>
                <td className="p-2.5 text-right whitespace-nowrap">{!locked && <>
                  <button className="btn btn-sm" disabled={pending} onClick={() => run(() => updateUserAction(u.id, { disabled: !u.disabled }))}>{u.disabled ? "Enable" : "Disable"}</button>{" "}
                  <button className="btn btn-sm" disabled={pending} onClick={() => { const p = prompt(`New temporary password for ${u.name} (12+ characters, letters and a number):`); if (p) run(() => updateUserAction(u.id, { password: p })); }}>Reset password</button>
                </>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <h3 className="font-semibold mb-2">Add a person</h3>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(async () => { const x = await createUserAction(f as never); if (!x.error) setF({ name: "", email: "", role: "SALESPERSON", password: "" }); return x; }); }}>
        <label><span className="label">Name</span><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
        <label><span className="label">Email</span><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
        <label><span className="label">Role</span><select className="select" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((x) => <option key={x} value={x}>{ROLE_LABEL[x]}</option>)}</select></label>
        <label><span className="label">Temporary password</span><input className="input" type="text" autoComplete="off" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={12} /></label>
        <p className="text-xs text-muted sm:col-span-2">Salespeople and drivers sign in on their phone and open straight into the field app. Accountants, admins and the owner also need an authenticator app.</p>
        <div><button className="btn btn-primary" disabled={pending}>Add person</button></div>
      </form>
      <Msg r={r} />
    </>
  );
}

export function Retention({ days }: { days: number }) {
  const { r, pending, run } = useAct();
  return (
    <div>
      <label className="flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold">Keep logs and read notifications for</span>
        <select className="select !w-auto" defaultValue={days} disabled={pending} onChange={(e) => run(() => setRetentionAction(Number(e.target.value)))}>{[30, 90, 180, 365].map((d) => <option key={d} value={d}>{d} days</option>)}</select>
      </label>
      <p className="text-xs text-muted mt-1">Applies company-wide. Audit entries for approvals and sign-ins are kept for the same period.</p>
      <Msg r={r} />
    </div>
  );
}

export function DeleteMyData() {
  const [text, setText] = useState("");
  const { r, pending, run } = useAct();
  return (
    <div className="border border-danger/40 rounded-xl p-4">
      <h3 className="font-semibold text-danger">Delete my data</h3>
      <p className="text-sm text-ink-2 mb-2">Permanently deletes your tasks, calendar, contacts, reminders, conversations, memory and approvals. Your account stays so you can sign in. Type <strong>DELETE MY DATA</strong> to confirm.</p>
      <div className="flex gap-2"><input className="input" value={text} onChange={(e) => setText(e.target.value)} aria-label="Type DELETE MY DATA to confirm" /><button className="btn btn-danger" disabled={pending || text !== "DELETE MY DATA"} onClick={() => run(() => deleteMyDataAction(text))}>Delete</button></div>
      <Msg r={r} />
    </div>
  );
}
