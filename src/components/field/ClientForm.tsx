"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { createClientAction, updateClientAction } from "@/app/(field)/actions";
import { getFix, PLACE_TYPES, STAGES, type Fix, type Stage } from "./gps";

type Values = { name: string; placeType: string; phone: string; whatsapp: string; email: string; address: string; stage: Stage; notes: string };
const EMPTY: Values = { name: "", placeType: "Clinic", phone: "", whatsapp: "", email: "", address: "", stage: "LEAD", notes: "" };

// New clients are pinned where the rep is standing; editing never moves the pin.
export function ClientForm({ id, initial }: { id?: string; initial?: Values }) {
  const router = useRouter();
  const [f, setF] = useState<Values>(initial ?? EMPTY);
  const [fix, setFix] = useState<Fix | null>(null);
  const [gps, setGps] = useState<"" | "busy" | string>(id ? "" : "busy");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const locate = () => { setGps("busy"); getFix().then((x) => { setFix(x); setGps(""); }, (e: Error) => setGps(e.message)); };
  useEffect(() => { if (!id) locate(); }, [id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setSaving(true);
    const r = id ? await updateClientAction(id, f) : await createClientAction({ ...f, location: fix });
    setSaving(false);
    if (r.error) return setErr(r.error);
    router.push(`/field/clients/${id ?? r.id}`);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {!id && (
        <div className={`card p-3 flex items-center gap-3 ${fix ? "!border-ok" : ""}`}>
          <Icon name="pin" className={fix ? "text-ok" : "text-muted"} />
          <div className="flex-1 text-sm">
            {fix ? <><b>Location captured</b><div className="text-muted">Accurate to about {Math.round(fix.accuracy)} m{fix.accuracy > 100 ? ". Move outside for a better fix." : ""}</div></>
              : gps === "busy" ? "Finding where you are…"
              : <span className="text-warn font-semibold">{gps || "No location yet."} The client will be saved without a pin.</span>}
          </div>
          {gps !== "busy" && <button type="button" className="btn btn-sm" onClick={locate}>{fix ? "Retry" : "Try again"}</button>}
        </div>
      )}
      <label className="block"><span className="label">Name</span><input className="input" required value={f.name} onChange={set("name")} placeholder="Dr Maroun Bou Hareb" autoComplete="off" /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">Type</span><select className="select" value={f.placeType} onChange={set("placeType")}>{PLACE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="block"><span className="label">Stage</span><select className="select" value={f.stage} onChange={set("stage")}>{STAGES.map((s) => <option key={s.v} value={s.v}>{s.label}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">Phone</span><input className="input" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} placeholder="+961 …" /></label>
        <label className="block"><span className="label">WhatsApp</span><input className="input" type="tel" inputMode="tel" value={f.whatsapp} onChange={set("whatsapp")} placeholder="Same as phone?" /></label>
      </div>
      <label className="block"><span className="label">Email</span><input className="input" type="email" value={f.email} onChange={set("email")} /></label>
      <label className="block"><span className="label">Address or landmark</span><input className="input" value={f.address} onChange={set("address")} placeholder="Saida, Riad El Solh St, 2nd floor" /></label>
      <label className="block"><span className="label">Notes</span><textarea className="textarea" value={f.notes} onChange={set("notes")} placeholder="Products they use, who decides, best time to visit" /></label>
      {err && <p role="alert" className="err">{err}</p>}
      <button className="btn btn-primary w-full !min-h-[48px]" disabled={saving || gps === "busy"}>{saving ? "Saving…" : id ? "Save" : "Add client"}</button>
    </form>
  );
}
