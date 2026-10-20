"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { reviewOrderAction } from "@/app/(field)/actions";
import { usd } from "@/components/field/gps";

type Line = { id: string; description: string; sku: string; unit: string; quantity: number; unitPrice: number; requestedQty: number; requestedPrice: number };

// Accounting edits quantities and prices in place, then approves or rejects. A quantity of 0 drops the line.
export function OrderReview({ id, open, note: savedNote, reviewed, lines: initial }: { id: string; open: boolean; note: string; reviewed: string | null; lines: Line[] }) {
  const router = useRouter();
  const [lines, setLines] = useState(initial.map((l) => ({ ...l, qtyText: String(l.quantity), priceText: l.unitPrice.toFixed(2) })));
  const [note, setNote] = useState(savedNote);
  const [res, setRes] = useState<{ ok?: string; error?: string } | null>(null);
  const [busy, setBusy] = useState("");
  const num = (s: string) => Number(s.replace(",", "."));
  const total = lines.reduce((t, l) => t + (Math.max(0, Math.floor(num(l.qtyText))) || 0) * (num(l.priceText) || 0), 0);
  const set = (i: number, p: Partial<(typeof lines)[number]>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function decide(decision: "APPROVE" | "REJECT" | "SAVE") {
    if (decision === "REJECT" && !note.trim()) return setRes({ error: "Add a note saying why, so the rep can tell the client." });
    for (const l of lines) {
      if (!/^\d+$/.test(l.qtyText.trim())) return setRes({ error: `Quantity for ${l.description} must be a whole number.` });
      if (!(num(l.priceText) >= 0)) return setRes({ error: `Check the price for ${l.description}.` });
    }
    setBusy(decision); setRes(null);
    const r = await reviewOrderAction(id, { decision, note, lines: lines.map((l) => ({ id: l.id, quantity: parseInt(l.qtyText, 10), unitPrice: num(l.priceText) })) });
    setBusy(""); setRes(r);
    if (!r.error) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Item</th><th className="p-3 font-medium">Rep asked</th><th className="p-3 font-medium w-28">Quantity</th><th className="p-3 font-medium w-32">Unit price ($)</th><th className="p-3 font-medium text-right">Line total</th></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const q = Math.floor(num(l.qtyText)) || 0, p = num(l.priceText) || 0;
              const changed = q !== l.requestedQty || Math.abs(p - l.requestedPrice) > 0.004;
              return (
                <tr key={l.id} className={`border-t border-line ${q === 0 ? "opacity-50 line-through" : ""}`}>
                  <td className="p-3"><div className="font-medium">{l.description}</div>{l.sku && <div className="text-xs text-muted">{l.sku} · {l.unit}</div>}</td>
                  <td className={`p-3 whitespace-nowrap ${changed ? "text-warn" : "text-muted"}`}>{l.requestedQty} × {usd(l.requestedPrice)}</td>
                  <td className="p-3"><input className="input !min-h-[32px]" inputMode="numeric" disabled={!open} value={l.qtyText} onChange={(e) => set(i, { qtyText: e.target.value })} aria-label={`Quantity of ${l.description}`} /></td>
                  <td className="p-3"><input className="input !min-h-[32px]" inputMode="decimal" disabled={!open} value={l.priceText} onChange={(e) => set(i, { priceText: e.target.value })} aria-label={`Unit price of ${l.description}`} /></td>
                  <td className="p-3 text-right font-semibold">{usd(q * p)}</td>
                </tr>
              );
            })}
            <tr className="border-t border-line font-bold"><td className="p-3" colSpan={4}>Total</td><td className="p-3 text-right">{usd(total)}</td></tr>
          </tbody>
        </table>
      </div>
      {open && <p className="text-xs text-muted">Set a quantity to 0 to remove that item. Changes are highlighted for the rep.</p>}
      <label className="block max-w-xl"><span className="label">Note to the rep</span>
        <textarea className="textarea" disabled={!open} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Required when rejecting. For example: price is the tender price, delivery Thursday." />
      </label>
      {reviewed && <p className="text-sm text-muted">Reviewed by {reviewed}.</p>}
      {res && (res.error ? <p role="alert" className="err">{res.error}</p> : <p role="status" className="text-sm font-semibold text-ok">{res.ok}</p>)}
      {open && (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={!!busy} onClick={() => decide("APPROVE")}>{busy === "APPROVE" ? "Approving…" : "Approve"}</button>
          <button className="btn" disabled={!!busy} onClick={() => decide("SAVE")}>{busy === "SAVE" ? "Saving…" : "Save changes, decide later"}</button>
          <button className="btn btn-danger" disabled={!!busy} onClick={() => decide("REJECT")}>{busy === "REJECT" ? "Rejecting…" : "Reject"}</button>
        </div>
      )}
    </div>
  );
}
