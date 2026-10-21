"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { createOrderAction } from "@/app/(field)/actions";
import { usd } from "./gps";
import { ProductPicker, type Product } from "./ProductPicker";

type Line = { key: string; productId: string | null; description: string; unit: string; quantity: number; unitPrice: number; listPrice: number | null };

let seq = 0;

export function OrderForm({ clientId, clientName, visitId, initialKind, products }: { clientId: string; clientName: string; visitId: string | null; initialKind: "ORDER" | "PROFORMA"; products: Product[] }) {
  const router = useRouter();
  const [kind, setKind] = useState(initialKind);
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState(false);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const counts = Object.fromEntries(lines.filter((l) => l.productId).map((l) => [l.productId!, l.quantity]));
  const closePicker = useCallback(() => setPicking(false), []);
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  const add = (p: Product) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.productId === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { key: `l${++seq}`, productId: p.id, description: p.name, unit: p.unit, quantity: 1, unitPrice: p.price, listPrice: p.price }];
    });
  };
  const addFree = (description: string) => setLines((ls) => [...ls, { key: `l${++seq}`, productId: null, description, unit: "unit", quantity: 1, unitPrice: 0, listPrice: null }]);
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const remove = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  async function submit() {
    setErr(""); setSaving(true);
    const r = await createOrderAction({
      contactId: clientId, kind, notes, visitId,
      lines: lines.map((l) => ({ productId: l.productId, description: l.description, quantity: l.quantity, unitPrice: l.unitPrice })),
    });
    setSaving(false);
    if (r.error) return setErr(r.error);
    router.push(`/field/orders/${r.id}?sent=1`);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-bold">{kind === "ORDER" ? "Order" : "Proforma request"} for {clientName}</h1>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-surface-2" role="radiogroup" aria-label="Type">
        {(["ORDER", "PROFORMA"] as const).map((k) => (
          <button key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`h-10 rounded-lg text-sm font-semibold ${kind === k ? "bg-surface shadow text-ink" : "text-muted"}`}>{k === "ORDER" ? "Order" : "Proforma request"}</button>
        ))}
      </div>
      <p className="text-sm text-ink-2">{kind === "ORDER" ? "The client is buying. Accounting checks quantities and prices, then approves." : "The client wants a price offer first. Accounting prepares the proforma from this request."}</p>

      <button onClick={() => setPicking(true)} className="btn w-full !min-h-[50px] !border-dashed !border-teal !text-teal !text-[15px]">
        <Icon name="plus" />{lines.length ? "Add another item" : "Add item"}
      </button>
      {picking && <ProductPicker products={products} counts={counts} onPick={add} onFree={addFree} onClose={closePicker} />}

      {lines.length === 0 ? <p className="empty card text-center">No items yet.</p> : (
        <ul className="card">
          {lines.map((l) => (
            <li key={l.key} className="row !items-start !flex-wrap !py-3">
              <div className="flex-1 min-w-[60%]">
                {l.productId ? <div className="font-medium">{l.description}</div>
                  : <input className="input !min-h-[34px]" value={l.description} onChange={(e) => patch(l.key, { description: e.target.value })} aria-label="Item description" placeholder="Item description" />}
                <div className="text-xs text-muted mt-0.5">{usd(l.quantity * l.unitPrice)}{l.listPrice != null && l.unitPrice !== l.listPrice ? ` · list ${usd(l.listPrice)}` : ""}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => remove(l.key)} aria-label={`Remove ${l.description || "item"}`}><Icon name="trash" size={16} /></button>
              <div className="w-full flex items-center gap-2 mt-2">
                <div className="flex items-center">
                  <button className="btn btn-sm !rounded-r-none" onClick={() => patch(l.key, { quantity: Math.max(1, l.quantity - 1) })} aria-label="Fewer">−</button>
                  <input className="input !min-h-[30px] !w-16 !rounded-none text-center" inputMode="numeric" value={l.quantity} onChange={(e) => patch(l.key, { quantity: Math.max(1, parseInt(e.target.value.replace(/\D/g, "")) || 1) })} aria-label={`Quantity of ${l.description}`} />
                  <button className="btn btn-sm !rounded-l-none" onClick={() => patch(l.key, { quantity: l.quantity + 1 })} aria-label="More">+</button>
                </div>
                <span className="text-xs text-muted">{l.unit} at $</span>
                <input className="input !min-h-[30px] !w-24" inputMode="decimal" defaultValue={l.unitPrice || ""} onChange={(e) => patch(l.key, { unitPrice: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) })} aria-label={`Unit price of ${l.description}`} />
              </div>
            </li>
          ))}
          <li className="row !justify-between font-bold"><span>Total</span><span>{usd(total)}</span></li>
        </ul>
      )}

      <label className="block"><span className="label">Notes for accounting</span><textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Delivery date, payment terms, discount the client asked for" /></label>
      {err && <p role="alert" className="err">{err}</p>}
      <button onClick={submit} disabled={saving || lines.length === 0} className="btn btn-primary w-full !min-h-[50px] !text-[16px]">
        <Icon name="send" size={18} />{saving ? "Sending…" : kind === "ORDER" ? "Send order to accounting" : "Send proforma request"}
      </button>
    </div>
  );
}
