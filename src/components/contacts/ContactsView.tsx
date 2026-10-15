"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createContactAction, deleteContactAction, updateContactAction } from "@/app/(app)/actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Icon } from "@/components/ui/Icon";
import { Drawer } from "@/components/ui/Drawer";

export type ContactRow = { id: string; name: string; company: string; jobTitle: string; email: string; phone: string; whatsapp: string; category: "CUSTOMER" | "SUPPLIER" | "STAFF" | "PARTNER" | "OTHER"; tags: string[]; notes: string; mine: boolean };
const CATS = [["CUSTOMER", "Customer"], ["SUPPLIER", "Supplier"], ["STAFF", "Staff"], ["PARTNER", "Partner"], ["OTHER", "Other"]] as const;
const catLabel = (c: string) => CATS.find(([k]) => k === c)?.[1] ?? c;

export function ContactsView({ initial, canDeleteAny, openId, startNew }: { initial: ContactRow[]; canDeleteAny: boolean; openId: string | null; startNew: boolean }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [editing, setEditing] = useState<ContactRow | "new" | null>(null);
  useEffect(() => { if (startNew) setEditing("new"); else if (openId) setEditing(initial.find((c) => c.id === openId) ?? null); }, [openId, startNew, initial]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return initial.filter((c) => (!cat || c.category === cat) && (!s || [c.name, c.company, c.email, c.phone, c.jobTitle, c.tags.join(" ")].join(" ").toLowerCase().includes(s)));
  }, [initial, q, cat]);

  return (
    <>
      <PageHeader title="Contacts" sub={`${initial.length} saved`} actions={<button className="btn btn-primary" onClick={() => setEditing("new")}><Icon name="plus" size={18} />New contact</button>} />
      <div className="flex flex-wrap gap-2 mb-4">
        <input className="input !w-[260px]" placeholder="Search name, company, email, phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search contacts" />
        <select className="select !w-auto" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">All categories</option>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <div className="card overflow-hidden">
        <ul>
          {list.map((c) => (
            <li key={c.id} className="row hover:bg-surface-2 cursor-pointer" onClick={() => setEditing(c)}>
              <span className="w-9 h-9 rounded-full bg-teal-soft text-teal-strong grid place-items-center font-bold text-sm shrink-0">{c.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}</span>
              <div className="flex-1 min-w-0">
                <button className="font-medium hover:underline text-left">{c.name}</button>
                <div className="text-xs text-muted truncate">{[c.jobTitle, c.company].filter(Boolean).join(" · ") || "No company"}</div>
              </div>
              <div className="hidden md:block text-sm text-ink-2 truncate max-w-[220px]">{c.email || c.phone}</div>
              <span className="chip">{catLabel(c.category)}</span>
            </li>
          ))}
          {!list.length && <li className="empty">{initial.length ? "No contacts match." : "No contacts yet. Add your key customers, suppliers and partners."}</li>}
        </ul>
      </div>
      {editing && <ContactEditor c={editing === "new" ? null : editing} canDelete={editing !== "new" && (editing.mine || canDeleteAny)} onClose={() => setEditing(null)} />}
    </>
  );
}

function ContactEditor({ c, canDelete, onClose }: { c: ContactRow | null; canDelete: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: c?.name ?? "", company: c?.company ?? "", jobTitle: c?.jobTitle ?? "", email: c?.email ?? "", phone: c?.phone ?? "", whatsapp: c?.whatsapp ?? "", category: c?.category ?? "CUSTOMER", tags: c?.tags.join(", ") ?? "", notes: c?.notes ?? "" });
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = () => start(async () => {
    const data = { ...f, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    const r = c ? await updateContactAction(c.id, data) : await createContactAction(data);
    if (r.error) setErr(r.error); else onClose();
  });
  const remove = () => { if (!c || !confirm(`Delete ${c.name}? This can't be undone.`)) return; start(async () => { const r = await deleteContactAction(c.id); if (r.error) setErr(r.error); else onClose(); }); };
  return (
    <Drawer title={c ? c.name : "New contact"} onClose={onClose}>
      {c && (c.email || c.phone || c.whatsapp) && (
        <div className="flex flex-wrap gap-2 mb-4">
          {c.email && <a className="btn btn-sm" href={`mailto:${c.email}`}>Email</a>}
          {c.phone && <a className="btn btn-sm" href={`tel:${c.phone.replace(/\s/g, "")}`}>Call</a>}
          {c.whatsapp && <a className="btn btn-sm" href={`https://wa.me/${c.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>}
        </div>
      )}
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="block"><span className="label">Name</span><input className="input" value={f.name} onChange={set("name")} required /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="label">Company</span><input className="input" value={f.company} onChange={set("company")} /></label>
          <label className="block"><span className="label">Role</span><input className="input" value={f.jobTitle} onChange={set("jobTitle")} /></label>
          <label className="block"><span className="label">Email</span><input className="input" type="email" value={f.email} onChange={set("email")} /></label>
          <label className="block"><span className="label">Phone</span><input className="input" type="tel" value={f.phone} onChange={set("phone")} /></label>
          <label className="block"><span className="label">WhatsApp</span><input className="input" type="tel" value={f.whatsapp} onChange={set("whatsapp")} /></label>
          <label className="block"><span className="label">Category</span><select className="select" value={f.category} onChange={set("category")}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        <label className="block"><span className="label">Tags</span><input className="input" value={f.tags} onChange={set("tags")} placeholder="hospital, lab, tender" /></label>
        <label className="block"><span className="label">Notes</span><textarea className="textarea" value={f.notes} onChange={set("notes")} rows={5} /></label>
        {err && <p role="alert" className="err">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : c ? "Save" : "Save contact"}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <div className="flex-1" />
          {c && canDelete && <button type="button" className="btn btn-danger" onClick={remove} disabled={pending}><Icon name="trash" size={16} />Delete</button>}
        </div>
      </form>
    </Drawer>
  );
}
