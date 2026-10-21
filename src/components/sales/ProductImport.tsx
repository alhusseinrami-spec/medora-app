"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { importProductsAction } from "@/app/(field)/actions";
import { FIELDS, findHeader, guessMapping, readFile, stockLooksUnused, toRows, type Cell, type Mapping } from "./importSheet";

type Sheet = { file: string; rows: Cell[][]; header: number; mapping: Mapping; zeroStock: boolean };

// Load the item list exported from the accounting system. Codes already here are updated, new ones added.
export function ProductImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [hideMissing, setHideMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok?: string; error?: string; warn?: string } | null>(null);

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setRes(null); setSheet(null);
    try {
      const rows = await readFile(f);
      if (rows.length < 2) return setRes({ error: "That file has no item rows." });
      const header = findHeader(rows);
      const mapping = guessMapping(rows[header]);
      const zeroStock = stockLooksUnused(rows, header, mapping.stock);
      if (zeroStock) mapping.stock = null;
      setSheet({ file: f.name, rows, header, mapping, zeroStock });
    } catch (err) {
      setRes({ error: err instanceof Error && /xls|save it/.test(err.message) ? err.message : "Couldn't read that file. Use the .xlsx or .csv export from your accounting system." });
    }
  }

  const missing = sheet ? FIELDS.filter((f) => f.required && sheet.mapping[f.key] == null) : [];
  const items = sheet ? sheet.rows.length - sheet.header - 1 : 0;
  const unpriced = sheet && sheet.mapping.price != null ? sheet.rows.slice(sheet.header + 1).filter((r) => String(r[sheet.mapping.price!] ?? "").trim() === "").length : 0;

  async function run() {
    if (!sheet) return;
    setBusy(true);
    const r = await importProductsAction({ rows: toRows(sheet.rows, sheet.header, sheet.mapping), hideMissing });
    setBusy(false); setRes(r);
    if (!r.error) { setSheet(null); router.refresh(); }
  }

  if (!open) {
    return <button className="btn" onClick={() => setOpen(true)}><Icon name="upload" size={16} />Import from Excel or CSV</button>;
  }
  const header = sheet?.rows[sheet.header] ?? [];
  const preview = sheet ? sheet.rows.slice(sheet.header + 1, sheet.header + 6) : [];
  const col = (r: Cell[], i: number | null) => (i == null ? "" : String(r[i] ?? ""));

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Import items from your accounting system</h2>
          <p className="text-sm text-ink-2">Export the item or price list as Excel (.xlsx) or CSV. It needs a code and name for each item; price, unit, stock and low-stock level are used if present. Codes already here are updated, new codes are added.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setOpen(false); setSheet(null); setRes(null); }} aria-label="Close"><Icon name="close" /></button>
      </div>
      <label className="btn btn-primary cursor-pointer w-fit">
        <Icon name="upload" size={16} />{sheet ? "Choose a different file" : "Choose file"}
        <input type="file" className="sr-only" accept=".xlsx,.xlsm,.csv,.txt,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={choose} />
      </label>

      {sheet && (
        <>
          <p className="text-sm"><strong>{sheet.file}</strong> · {items} row{items === 1 ? "" : "s"}. Check each field points at the right column:</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {FIELDS.map((f) => (
              <label key={f.key}>
                <span className="label">{f.label}{f.required ? "" : " (optional)"}</span>
                <select className="input" value={sheet.mapping[f.key] ?? ""} onChange={(e) => setSheet({ ...sheet, mapping: { ...sheet.mapping, [f.key]: e.target.value === "" ? null : Number(e.target.value) } })} aria-label={`Column for ${f.label}`}>
                  <option value="">{f.required ? "Choose a column" : "Not in this file"}</option>
                  {header.map((h, i) => <option key={i} value={i}>{String(h ?? "").trim() || `Column ${i + 1}`}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted">{FIELDS.map((f) => <th key={f.key} className="p-2 font-medium">{f.label}</th>)}</tr></thead>
              <tbody>{preview.map((r, i) => <tr key={i} className="border-t border-line">{FIELDS.map((f) => <td key={f.key} className="p-2">{col(r, sheet.mapping[f.key])}</td>)}</tr>)}</tbody>
            </table>
            {items > preview.length && <p className="text-xs text-muted mt-1">First {preview.length} of {items} rows shown.</p>}
          </div>
          {sheet.zeroStock && <p className="text-sm text-ink-2">Every item in this file has a stock of 0, so the stock column looks unused and isn&apos;t imported. Otherwise every product would show as out of stock. Choose the stock column above if the zeros are real.</p>}
          {unpriced > 0 && <p className="text-sm text-ink-2">{unpriced} of {items} items have no price. They are still added, and reps see &ldquo;Price from accounting&rdquo;; you set the price when you review the order.</p>}
          <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={hideMissing} onChange={(e) => setHideMissing(e.target.checked)} />Hide products that aren&apos;t in this file, so reps only see the current list</label>
          {missing.length > 0 && <p className="err">Choose the column for {missing.map((f) => f.label.toLowerCase()).join(" and ")}.</p>}
          <button className="btn btn-primary" disabled={busy || missing.length > 0} onClick={run}>{busy ? "Importing…" : `Import ${items} item${items === 1 ? "" : "s"}`}</button>
        </>
      )}
      {res && (res.error ? <p role="alert" className="err">{res.error}</p> : (
        <div role="status" className="text-sm space-y-1">
          <p className="font-semibold text-ok">{res.ok}</p>
          {res.warn && <p className="text-warn">{res.warn}</p>}
        </div>
      ))}
    </div>
  );
}
