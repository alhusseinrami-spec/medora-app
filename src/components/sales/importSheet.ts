// Turns an accounting export (CSV or Excel) into product rows, guessing which column is which.

export type Field = "sku" | "name" | "unit" | "price" | "stock" | "minStock";
export type Cell = string | number | null;
export type Mapping = Record<Field, number | null>;

export const FIELDS: { key: Field; label: string; required?: boolean }[] = [
  { key: "sku", label: "Code", required: true },
  { key: "name", label: "Name", required: true },
  { key: "price", label: "Price", required: true },
  { key: "unit", label: "Unit" },
  { key: "stock", label: "Stock" },
  { key: "minStock", label: "Low-stock level" },
];

// Checked in this order, so "min stock" isn't taken for stock, "unit price" for unit, or "item code" for name.
const HINTS: [Field, RegExp][] = [
  ["minStock", /\b(min|minimum|reorder|re order|alert|low stock|safety)\b|حد/],
  ["price", /\b(price|prix|pu|rate|tarif|selling|sale|cost)\b|سعر/],
  ["sku", /\b(code|sku|ref|reference|référence|item no|item number|part|article|barcode)\b|رمز|كود/],
  ["stock", /\b(stock|qty|quantity|quantité|on hand|available|balance|inventory)\b|كمية|مخزون/],
  ["unit", /\b(unit|uom|unité|pack)\b|وحدة/],
  ["name", /\b(name|description|desc|item|product|designation|désignation|libellé|libelle)\b|اسم|صنف/],
];

const norm = (v: Cell) => String(v ?? "").toLowerCase().replace(/[_.\-/#:]+/g, " ").replace(/\s+/g, " ").trim();

export function guessMapping(header: Cell[]): Mapping {
  const m: Mapping = { sku: null, name: null, unit: null, price: null, stock: null, minStock: null };
  const used = new Set<number>();
  for (const [field, re] of HINTS) {
    const i = header.findIndex((h, j) => !used.has(j) && re.test(norm(h)));
    if (i >= 0) { m[field] = i; used.add(i); }
  }
  return m;
}

// The header is the first of the top rows that names at least two of the fields; exports often start with a title or date.
export function findHeader(rows: Cell[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const m = guessMapping(rows[i]);
    if (Object.values(m).filter((v) => v != null).length >= 2) return i;
  }
  return 0;
}

export function parseCsv(text: string): Cell[][] {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0];
  const delim = [";", "\t", ","].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: Cell[][] = [];
  let row: Cell[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
}

export async function readFile(file: File): Promise<Cell[][]> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    return data
      .map((r) => r.map((c): Cell => (c == null ? null : typeof c === "number" ? c : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))))
      .filter((r) => r.some((c) => c != null && String(c).trim() !== ""));
  }
  if (/\.xls$/i.test(file.name)) throw new Error("This is an old Excel file (.xls). Open it in Excel and save it as .xlsx or CSV, then import that.");
  return parseCsv(await file.text());
}

export function toRows(rows: Cell[][], header: number, m: Mapping) {
  const pick = (r: Cell[], f: Field) => (m[f] == null ? null : r[m[f]!] ?? null);
  return rows.slice(header + 1).map((r) => ({ sku: pick(r, "sku"), name: pick(r, "name"), unit: pick(r, "unit"), price: pick(r, "price"), stock: pick(r, "stock"), minStock: pick(r, "minStock") }));
}
