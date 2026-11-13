"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { ShopOrderStatus } from "@prisma/client";
import { createProformaAction, createShopOrderAction, customerLinkAction, removeShopDocumentAction, saveShopOrderLinesAction, setShopOrderStatusAction, type Res } from "@/app/(app)/customers/orders/actions";

function Msg({ r }: { r: Res }) {
  if (r.error) return <p role="alert" className="err mt-2">{r.error}</p>;
  if (r.ok) return <p role="status" className="text-sm font-semibold text-ok mt-2">{r.ok}</p>;
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
function tomorrowAt(h: number) {
  const d = new Date(Date.now() + 86400_000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(h)}:00`;
}

// Set where the order stands. Every change shows in the customer's My orders and reaches their phone.
export function StatusPanel({ id, status }: { id: string; status: ShopOrderStatus }) {
  const router = useRouter();
  const [r, setR] = useState<Res>({});
  const [pending, start] = useTransition();
  const [eta, setEta] = useState(tomorrowAt(14));
  const [reason, setReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const go = (s: ShopOrderStatus, etaV = "", note = "") => start(async () => {
    const res = await setShopOrderStatusAction(id, s, etaV, note);
    setR(res);
    if (res.ok) { setCancelling(false); setReason(""); router.refresh(); }
  });
  const done = status === "DELIVERED" || status === "CANCELLED";
  return (
    <section className="card p-3">
      <h2 className="font-semibold mb-3">Status</h2>
      <div className="grid gap-3">
        {status === "PLACED" && (
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-primary" disabled={pending} onClick={() => go("CONFIRMED")}>Confirm order</button>
            <span className="text-sm text-muted">After you checked stock and prices with the customer.</span>
          </div>
        )}
        {!done && (
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid">
              <span className="label">{status === "TO_DELIVER" ? "Change the estimated delivery time" : "Estimated delivery time"}</span>
              <input type="datetime-local" className="input !w-auto" value={eta} onChange={(e) => setEta(e.target.value)} />
            </label>
            <button className={`btn ${status === "CONFIRMED" ? "btn-primary" : ""}`} disabled={pending} onClick={() => go("TO_DELIVER", eta)}>{status === "TO_DELIVER" ? "Update time" : "Mark to be delivered"}</button>
          </div>
        )}
        {(status === "CONFIRMED" || status === "TO_DELIVER") && (
          <div><button className={`btn ${status === "TO_DELIVER" ? "btn-primary" : ""}`} disabled={pending} onClick={() => go("DELIVERED")}>Mark delivered</button></div>
        )}
        {!done && (cancelling ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="grid flex-1 min-w-[220px]"><span className="label">Reason the customer will see (optional)</span><input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Out of stock" /></label>
            <button className="btn btn-danger" disabled={pending} onClick={() => go("CANCELLED", "", reason)}>Cancel the order</button>
            <button className="btn btn-ghost" onClick={() => setCancelling(false)}>Keep it</button>
          </div>
        ) : <div><button className="btn btn-sm btn-ghost text-danger" onClick={() => setCancelling(true)}>Cancel order…</button></div>)}
        {done && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{status === "DELIVERED" ? "This order is delivered." : "This order is cancelled."}</span>
            <button className="btn btn-sm" disabled={pending} onClick={() => go("CONFIRMED")}>Reopen as confirmed</button>
          </div>
        )}
      </div>
      <Msg r={r} />
    </section>
  );
}

export function DocumentList({ docs }: { docs: { id: string; kind: string; name: string; meta: string }[] }) {
  const router = useRouter();
  const [r, setR] = useState<Res>({});
  const [pending, start] = useTransition();
  if (!docs.length) return <p className="text-sm text-muted mb-3">Nothing attached yet.</p>;
  return (
    <>
      <ul className="grid gap-2 mb-3">
        {docs.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 text-sm border border-line rounded-xl p-2">
            <span className="chip chip-teal">{d.kind}</span>
            <a className="font-medium underline break-all" href={`/api/customers/documents/${d.id}`} target="_blank" rel="noopener">{d.name}</a>
            <span className="text-muted text-xs flex-1">{d.meta}</span>
            <button className="btn btn-sm btn-ghost text-danger" disabled={pending} onClick={() => { if (confirm(`Remove ${d.name}? The customer will no longer see it.`)) start(async () => { const res = await removeShopDocumentAction(d.id); setR(res); if (res.ok) router.refresh(); }); }}>Remove</button>
          </li>
        ))}
      </ul>
      <Msg r={r} />
    </>
  );
}

export function DocumentUpload({ id }: { id: string }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("PROFORMA");
  const [r, setR] = useState<Res>({});
  const [busy, setBusy] = useState(false);
  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const f = file.current?.files?.[0];
    if (!f) return setR({ error: "Choose a file." });
    if (f.size > 4_000_000) return setR({ error: "The file is larger than 4 MB." });
    setBusy(true); setR({});
    const fd = new FormData();
    fd.append("kind", kind);
    fd.append("file", f);
    try {
      const res = await fetch(`/api/customers/orders/${id}/documents`, { method: "POST", body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setR({ error: j.error ?? "The file could not be saved." });
      else { setR({ ok: `Attached. The customer can open it in My orders.${j.phones ? " Their phone was notified." : ""}` }); if (file.current) file.current.value = ""; router.refresh(); }
    } catch { setR({ error: "No connection. Please try again." }); }
    setBusy(false);
  }
  return (
    <form onSubmit={upload} className="flex flex-wrap items-end gap-2">
      <label className="grid"><span className="label">Type</span>
        <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)}><option value="PROFORMA">Pro forma</option><option value="INVOICE">Invoice</option></select>
      </label>
      <label className="grid flex-1 min-w-[220px]"><span className="label">File (PDF, PNG or JPG, up to 4 MB)</span><input ref={file} type="file" accept="application/pdf,image/png,image/jpeg" className="input" /></label>
      <button className="btn btn-primary" disabled={busy}>{busy ? "Uploading…" : "Attach"}</button>
      <div className="w-full"><Msg r={r} /></div>
    </form>
  );
}

export function CustomerLink({ customerId, phone }: { customerId: string; phone: string }) {
  const [link, setLink] = useState("");
  const [r, setR] = useState<Res>({});
  const [pending, start] = useTransition();
  const get = () => start(async () => { const res = await customerLinkAction(customerId); if (res.link) setLink(res.link); else setR(res); });
  if (!link) return <><button className="btn btn-sm" disabled={pending} onClick={get}>Show link</button><Msg r={r} /></>;
  const text = `Medora Care: follow your orders, pro formas and invoices here (open it on your phone): ${link}`;
  return (
    <div className="grid gap-2">
      <input className="input text-xs" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="My orders link" dir="ltr" />
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(link).then(() => setR({ ok: "Copied." }), () => setR({ error: "Copy it from the box." }))}>Copy</button>
        {phone && <a className="btn btn-sm btn-primary" href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">Send on WhatsApp</a>}
      </div>
      <p className="text-xs text-muted">Anyone with this link sees this customer&apos;s orders, so send it only to them.</p>
      <Msg r={r} />
    </div>
  );
}

type Row = { code: string; name: string; qty: string; price: string };
const blank = (): Row => ({ code: "", name: "", qty: "1", price: "" });

// For orders that came in by phone or WhatsApp: saved as confirmed, and shown in the customer's My orders.
export function NewShopOrderForm() {
  const router = useRouter();
  const [c, setC] = useState({ name: "", phone: "", note: "" });
  const [rows, setRows] = useState<Row[]>([blank(), blank(), blank()]);
  const [r, setR] = useState<Res>({});
  const [pending, start] = useTransition();
  const set = (i: number, k: keyof Row, v: string) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const lines = rows.filter((x) => x.name.trim() || x.code.trim()).map((x) => ({ code: x.code.trim().toUpperCase(), name: x.name.trim() || x.code.trim(), qty: Number(x.qty) || 0, price: Number(x.price) || 0 }));
    start(async () => {
      const res = await createShopOrderAction({ ...c, lines });
      setR(res);
      if (res.id) router.push(`/customers/orders/${res.id}`);
    });
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="card p-3 grid gap-3 sm:grid-cols-2">
        <label><span className="label">Customer name</span><input className="input" required maxLength={100} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></label>
        <label><span className="label">Phone (WhatsApp)</span><input className="input" required inputMode="tel" maxLength={30} value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="+961 3 123 456" dir="ltr" /></label>
        <p className="text-xs text-muted sm:col-span-2">If this phone number already ordered from the shop, the order goes into the same My orders.</p>
      </div>
      <div className="card p-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="p-1 font-medium">Code</th><th className="p-1 font-medium">Item</th><th className="p-1 font-medium w-20">Qty</th><th className="p-1 font-medium w-24">Price $</th><th /></tr></thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={i}>
                <td className="p-1 w-28"><input className="input" value={x.code} onChange={(e) => set(i, "code", e.target.value)} placeholder="RH-012" aria-label={`Code, line ${i + 1}`} dir="ltr" /></td>
                <td className="p-1 min-w-[180px]"><input className="input" value={x.name} onChange={(e) => set(i, "name", e.target.value)} aria-label={`Item, line ${i + 1}`} /></td>
                <td className="p-1"><input className="input" type="number" min={1} value={x.qty} onChange={(e) => set(i, "qty", e.target.value)} aria-label={`Quantity, line ${i + 1}`} /></td>
                <td className="p-1"><input className="input" type="number" min={0} step="0.01" value={x.price} onChange={(e) => set(i, "price", e.target.value)} aria-label={`Price, line ${i + 1}`} /></td>
                <td className="p-1"><button type="button" className="btn btn-sm btn-ghost" aria-label={`Remove line ${i + 1}`} onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [blank()])}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="btn btn-sm mt-2" onClick={() => setRows([...rows, blank()])}>Add line</button>
        <p className="text-xs text-muted mt-2">Use the shop&apos;s reference codes (such as RH-012) so the customer can order the same items again with one tap.</p>
      </div>
      <label className="card p-3"><span className="label">Note (optional)</span><textarea className="input min-h-16" maxLength={500} value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} /></label>
      <div><button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Save order"}</button></div>
      <Msg r={r} />
    </form>
  );
}

type PLine = { code: string; name: string; nameAr: string; qty: string; price: string; shopPrice: number };
const usd = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The order's items as an editable pro forma: change quantities, enter prices, add or remove lines,
// then make the PDF. It goes straight into the customer's My orders.
export function ProformaEditor({ id, lines, number, validUntil, note, hasProforma }: {
  id: string;
  lines: { code: string; name: string; nameAr: string; qty: number; price: number; shopPrice: number }[];
  number: string; validUntil: string; note: string; hasProforma: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<PLine[]>(lines.map((l) => ({ ...l, qty: String(l.qty), price: l.price ? String(l.price) : "" })));
  const [f, setF] = useState({ number, validUntil, note });
  const [r, setR] = useState<Res>({});
  const [pending, start] = useTransition();
  const set = (i: number, k: "code" | "name" | "qty" | "price", v: string) => { setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setR({}); };
  const clean = () => rows.filter((x) => x.name.trim() || x.code.trim()).map((x) => ({ code: x.code.trim().toUpperCase(), name: x.name.trim() || x.code.trim(), nameAr: x.nameAr, qty: Math.round(Number(x.qty)) || 0, price: Number(x.price) || 0 }));
  const total = rows.reduce((s, x) => s + (Number(x.qty) || 0) * (Number(x.price) || 0), 0);
  const save = () => start(async () => { const res = await saveShopOrderLinesAction(id, clean()); setR(res); if (res.ok) router.refresh(); });
  const create = () => start(async () => {
    const res = await createProformaAction(id, { ...f, lines: clean() });
    setR(res);
    if (res.ok) router.refresh();
  });
  return (
    <section className="card mt-4">
      <div className="p-3 pb-0 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Items and pro forma</h2>
        <p className="text-xs text-muted">Change quantities, enter prices, then press Create pro forma.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="p-2 pl-3 font-medium">Code</th><th className="p-2 font-medium">Item</th><th className="p-2 font-medium w-24">Qty</th><th className="p-2 font-medium w-28">Unit price $</th><th className="p-2 font-medium text-right w-24">Total</th><th className="w-10" /></tr></thead>
          <tbody>
            {rows.map((x, i) => (
              <tr key={i} className="border-t border-line align-top">
                <td className="p-2 pl-3 w-28"><input className="input" value={x.code} onChange={(e) => set(i, "code", e.target.value)} aria-label={`Code, line ${i + 1}`} dir="ltr" /></td>
                <td className="p-2 min-w-[200px]"><input className="input" value={x.name} onChange={(e) => set(i, "name", e.target.value)} aria-label={`Item, line ${i + 1}`} />{x.shopPrice > 0 && <span className="text-xs text-muted">Shop price {usd(x.shopPrice)}</span>}</td>
                <td className="p-2"><input className="input" type="number" min={1} inputMode="numeric" value={x.qty} onChange={(e) => set(i, "qty", e.target.value)} aria-label={`Quantity, line ${i + 1}`} /></td>
                <td className="p-2"><input className={`input ${x.price && Number(x.price) > 0 ? "" : "!border-warn"}`} type="number" min={0} step="0.01" inputMode="decimal" value={x.price} placeholder="0.00" onChange={(e) => set(i, "price", e.target.value)} aria-label={`Unit price, line ${i + 1}`} /></td>
                <td className="p-2 text-right pt-4 whitespace-nowrap">{usd((Number(x.qty) || 0) * (Number(x.price) || 0))}</td>
                <td className="p-2"><button type="button" className="btn btn-sm btn-ghost" aria-label={`Remove line ${i + 1}`} onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : rows)}>✕</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-line font-semibold"><td className="p-3" colSpan={4}><button type="button" className="btn btn-sm font-normal" onClick={() => setRows([...rows, { code: "", name: "", nameAr: "", qty: "1", price: "", shopPrice: 0 }])}>Add line</button></td><td className="p-3 text-right whitespace-nowrap">{usd(total)}</td><td /></tr></tfoot>
        </table>
      </div>
      <div className="p-3 border-t border-line grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <label><span className="label">Pro forma no.</span><input className="input" value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} dir="ltr" /></label>
        <label><span className="label">Valid until</span><input className="input" type="date" value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} /></label>
        <label><span className="label">Note on the pro forma</span><input className="input" maxLength={400} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      </div>
      <div className="p-3 pt-0 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={create}>{pending ? "Working…" : hasProforma ? "Create pro forma again" : "Create pro forma"}</button>
        <button type="button" className="btn" disabled={pending} onClick={save}>Save changes only</button>
        {r.id && <a className="btn btn-ghost underline" href={`/api/customers/documents/${r.id}`} target="_blank" rel="noopener">Open the PDF</a>}
      </div>
      <div className="px-3 pb-3"><Msg r={r} /></div>
    </section>
  );
}
