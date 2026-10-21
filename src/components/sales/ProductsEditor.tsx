"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveProductAction } from "@/app/(field)/actions";
import { isLowStock, priceInput, stockLabel, usd } from "@/components/field/gps";
import { ProductImport } from "./ProductImport";

type P = { id: string; sku: string; name: string; unit: string; price: number; active: boolean; stock: number | null; minStock: number | null };
type Draft = { sku: string; name: string; unit: string; price: string; stock: string; minStock: string; active: boolean };
const blank: Draft = { sku: "", name: "", unit: "box", price: "", stock: "", minStock: "", active: true };
const whole = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(",", "."))));

export function ProductsEditor({ initial }: { initial: P[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<string | null>(null);
  const [d, setD] = useState<Draft>(blank);
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: k === "active" ? e.target.checked : e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    const r = await saveProductAction({ ...d, price: Number(d.price.replace(",", ".")), stock: whole(d.stock), minStock: whole(d.minStock) }, edit ?? undefined);
    setBusy(false); setRes(r);
    if (!r.error) { setD(blank); setEdit(null); router.refresh(); }
  }

  return (
    <div className="space-y-4">
      <ProductImport />
      <form onSubmit={save} className="card p-4 grid gap-3 sm:grid-cols-[1fr_2fr_1fr_1fr] items-end">
        <label><span className="label">Code</span><input className="input" required value={d.sku} onChange={set("sku")} placeholder="GLV-M" /></label>
        <label><span className="label">Name</span><input className="input" required value={d.name} onChange={set("name")} placeholder="Nitrile gloves, medium" /></label>
        <label><span className="label">Unit</span><input className="input" value={d.unit} onChange={set("unit")} /></label>
        <label><span className="label">Price ($)</span><input className="input" required inputMode="decimal" value={d.price} onChange={set("price")} /></label>
        <label><span className="label">In stock</span><input className="input" inputMode="numeric" value={d.stock} onChange={set("stock")} placeholder="Leave blank if unknown" /></label>
        <label><span className="label">Low-stock level</span><input className="input" inputMode="numeric" value={d.minStock} onChange={set("minStock")} placeholder="e.g. 10" /></label>
        <div className="flex gap-2 items-center sm:col-span-2">
          {edit && <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={d.active} onChange={set("active")} />Active</label>}
          <button className="btn btn-primary" disabled={busy}>{edit ? "Save" : "Add"}</button>
          {edit && <button type="button" className="btn btn-ghost" onClick={() => { setEdit(null); setD(blank); }}>Cancel</button>}
        </div>
      </form>
      {res && (res.error ? <p role="alert" className="err">{res.error}</p> : <p role="status" className="text-sm font-semibold text-ok">{res.ok}</p>)}
      <div className="card overflow-x-auto">
        {initial.length === 0 ? <p className="empty">No products yet. Import the item list from your accounting system above, or add products one by one. Until then reps type items by hand.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Code</th><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Unit</th><th className="p-3 font-medium text-right">Price</th><th className="p-3 font-medium text-right">Stock</th><th className="p-3" /></tr></thead>
            <tbody>
              {initial.map((p) => (
                <tr key={p.id} className={`border-t border-line ${p.active ? "" : "text-muted"}`}>
                  <td className="p-3 font-mono text-xs">{p.sku}</td>
                  <td className="p-3">{p.name}{!p.active && <span className="chip ml-2">Hidden</span>}</td>
                  <td className="p-3">{p.unit}</td>
                  <td className="p-3 text-right">{p.price ? usd(p.price) : <span className="text-muted">No price</span>}</td>
                  <td className={`p-3 text-right whitespace-nowrap ${isLowStock(p) ? "text-danger font-semibold" : ""}`}>{p.stock == null ? <span className="text-muted">–</span> : stockLabel(p)?.replace(" in stock", "")}{p.minStock != null && <span className="block text-xs text-muted font-normal">low at {p.minStock}</span>}</td>
                  <td className="p-3 text-right"><button className="btn btn-sm" onClick={() => { setEdit(p.id); setD({ sku: p.sku, name: p.name, unit: p.unit, price: p.price ? priceInput(p.price) : "", stock: p.stock == null ? "" : String(p.stock), minStock: p.minStock == null ? "" : String(p.minStock), active: p.active }); setRes(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
