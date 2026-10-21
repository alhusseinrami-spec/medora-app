// Turns an accounting export (CSV or Excel) into product rows, guessing which column is which.

export type Field = "sku" | "name" | "unit" | "price" | "stock" | "minStock";
export type Cell = string | number | null;
export type Mapping = Record<Field, number | null>;

export const FIELDS: { key: Field; label: string; required?: boolean }[] = [
  { key: "sku", label: "Code", required: true },
  { key: "name", label: "Name", required: true },
  { key: "price", label: "Price" },
  { key: "unit", label: "Unit" },
  { key: "stock", label: "Stock" },
  { key: "minStock", label: "Low-stock level" },
];

// For each field, the patterns are tried best first across every column, and a column is never used twice.
// The skip pattern keeps "Cost price" or "Minimum selling price" from being read as the selling price,
// and "Minimum stock" or "Reorder quantity" from being read as the stock on hand.
const HINTS: { field: Field; best: RegExp[]; skip?: RegExp }[] = [
  { field: "sku", best: [/^(code|sku|ref|reference|référence|item code|product code|item no|item number|code article)$/, /\b(code|sku|ref|reference|référence|item no|item number|part|article)\b|رمز|كود/] },
  { field: "price", best: [/^(selling price|sale price|sales price|retail price|unit price|price|prix|prix de vente|pu)$/, /\b(selling|sale|sales|retail)\b.*\b(price|prix)\b|سعر البيع/, /\b(price|prix|pu|rate|tarif)\b|سعر/], skip: /\b(cost|purchase|buying|min|minimum|wholesale|achat)\b/ },
  { field: "minStock", best: [/\b(min|minimum|safety|low)\b.*\b(stock|qty|quantity|level)\b|\breorder (level|point)\b|\balert\b|حد/], skip: /\b(price|prix)\b/ },
  { field: "stock", best: [/^(stock|qty|quantity|quantité|on hand|qty on hand|quantity on hand|available|balance|in stock)$/, /\b(stock|qty|quantity|quantité|on hand|available|balance|inventory)\b|كمية|مخزون/], skip: /\b(min|minimum|reorder|safety|order|ordered|sold)\b/ },
  { field: "unit", best: [/^(unit|uom|unité|unit of measure)$/, /\b(unit|uom|unité)\b|وحدة/], skip: /\b(price|prix|cost)\b/ },
  { field: "name", best: [/^(name|item name|product name|product|item|description|designation|désignation|libellé|libelle)$/, /\b(name|description|desc|item|product|designation|désignation|libellé|libelle)\b|اسم|صنف/], skip: /\b(arabic|french|short|supplier|brand|category)\b/ },
];

const norm = (v: Cell) => String(v ?? "").toLowerCase().replace(/[_.\-/#:]+/g, " ").replace(/\s+/g, " ").trim();

export function guessMapping(header: Cell[]): Mapping {
  const m: Mapping = { sku: null, name: null, unit: null, price: null, stock: null, minStock: null };
  const used = new Set<number>();
  const cols = header.map(norm);
  for (const { field, best, skip } of HINTS) {
    for (const re of best) {
      const i = cols.findIndex((h, j) => !used.has(j) && re.test(h) && !skip?.test(h));
      if (i >= 0) { m[field] = i; used.add(i); break; }
    }
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
  // Judge the separator on the first lines together: a title line above the header has none.
  const top = text.split(/\r?\n/, 10).join("\n");
  const delim = [",", ";", "\t"].map((d) => [d, top.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
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

// A stock column where every item reads 0 is almost always a system that doesn't track stock;
// importing it would mark the whole catalogue "Out of stock".
export function stockLooksUnused(rows: Cell[][], header: number, col: number | null) {
  if (col == null) return false;
  return rows.slice(header + 1).every((r) => { const v = String(r[col] ?? "").trim(); return v === "" || Number(v) === 0; });
}
