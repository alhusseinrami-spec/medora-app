"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveProductAction } from "@/app/(field)/actions";

type P = { id: string; sku: string; name: string; unit: string; price: number; active: boolean };
type Draft = { sku: string; name: string; unit: string; price: string; active: boolean };
const blank: Draft = { sku: "", name: "", unit: "box", price: "", active: true };

export function ProductsEditor({ initial }: { initial: P[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<string | null>(null);
  const [d, setD] = useState<Draft>(blank);
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: k === "active" ? e.target.checked : e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await saveProductAction({ ...d, price: Number(d.price.replace(",", ".")) }, edit ?? undefined);
    setBusy(false); setRes(r);
    if (!r.error) { setD(blank); setEdit(null); router.refresh(); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={save} className="card p-4 grid gap-3 sm:grid-cols-[1fr_2fr_1fr_1fr_auto] items-end">
        <label><span className="label">Code</span><input className="input" required value={d.sku} onChange={set("sku")} placeholder="GLV-M" /></label>
        <label><span className="label">Name</span><input className="input" required value={d.name} onChange={set("name")} placeholder="Nitrile gloves, medium" /></label>
        <label><span className="label">Unit</span><input className="input" value={d.unit} onChange={set("unit")} /></label>
        <label><span className="label">Price ($)</span><input className="input" required inputMode="decimal" value={d.price} onChange={set("price")} /></label>
        <div className="flex gap-2 items-center">
          {edit && <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={d.active} onChange={set("active")} />Active</label>}
          <button className="btn btn-primary" disabled={busy}>{edit ? "Save" : "Add"}</button>
          {edit && <button type="button" className="btn btn-ghost" onClick={() => { setEdit(null); setD(blank); }}>Cancel</button>}
        </div>
      </form>
      {res && (res.error ? <p role="alert" className="err">{res.error}</p> : <p role="status" className="text-sm font-semibold text-ok">{res.ok}</p>)}
      <div className="card overflow-x-auto">
        {initial.length === 0 ? <p className="empty">No products yet. Reps can still type items by hand; add your catalogue here so prices fill in.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Code</th><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Unit</th><th className="p-3 font-medium text-right">Price</th><th className="p-3" /></tr></thead>
            <tbody>
              {initial.map((p) => (
                <tr key={p.id} className={`border-t border-line ${p.active ? "" : "text-muted"}`}>
                  <td className="p-3 font-mono text-xs">{p.sku}</td>
                  <td className="p-3">{p.name}{!p.active && <span className="chip ml-2">Hidden</span>}</td>
                  <td className="p-3">{p.unit}</td>
                  <td className="p-3 text-right">${p.price.toFixed(2)}</td>
                  <td className="p-3 text-right"><button className="btn btn-sm" onClick={() => { setEdit(p.id); setD({ sku: p.sku, name: p.name, unit: p.unit, price: p.price.toFixed(2), active: p.active }); setRes(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
