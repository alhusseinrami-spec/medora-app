import "server-only";
import path from "node:path";
import { readFileSync } from "node:fs";
import PDFDocument from "pdfkit";

// The Medora Care pro forma, laid out like the ones already sent to customers (PF-2026-0007):
// company block and title, customer and number boxes, the items table, total, terms, and a faint
// PRO FORMA watermark. DejaVu Sans is embedded so Arabic names print correctly.

export type ProformaInput = {
  number: string;
  date: Date;
  validUntil: Date;
  customer: { name: string; phone: string };
  lines: { code: string; name: string; qty: number; price: number }[];
  note: string;
  orderRef: string;
};

const TEAL = "#0f6a72", INK = "#1d2a2c", MUTED = "#6b7b7e", LINE = "#cfdcdf", HEAD_BG = "#eef6f7", BOX = "#b9c9cc";
const FONT_DIR = path.join(process.cwd(), "src/assets/fonts");
let fonts: { r: Buffer; b: Buffer } | null = null;
const loadFonts = () => (fonts ??= { r: readFileSync(path.join(FONT_DIR, "DejaVuSans.ttf")), b: readFileSync(path.join(FONT_DIR, "DejaVuSans-Bold.ttf")) });

const money = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const isoDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Beirut" }); // YYYY-MM-DD
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

// pdfkit shapes a run of Arabic correctly but not a line that mixes Arabic and Latin, so a mixed
// line is drawn run by run, in visual order. Mixed lines are kept to one line (names, phone).
function runs(s: string): string[] {
  const out: string[] = [];
  const re = /([؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿][؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿\s]*)|([^؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+)/g;
  for (const m of s.matchAll(re)) out.push(m[0]);
  return ARABIC.test(s[0] ?? "") ? out.reverse() : out;
}

function fit(doc: PDFKit.PDFDocument, s: string, width: number): string {
  if (doc.widthOfString(s) <= width) return s;
  let t = s;
  while (t.length > 1 && doc.widthOfString(t + "…") > width) t = t.slice(0, -1);
  return t + "…";
}

function textLine(doc: PDFKit.PDFDocument, s: string, x: number, y: number, width: number) {
  s = fit(doc, s, width);
  if (!ARABIC.test(s)) { doc.text(s, x, y, { width, lineBreak: false }); return; }
  const parts = runs(s);
  if (parts.length === 1) { doc.text(s.trim(), x, y, { width, lineBreak: false, features: ["rlig", "liga", "init", "medi", "fina"] }); return; }
  let cx = x;
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    doc.text(t, cx, y, { lineBreak: false, features: ["rlig", "liga", "init", "medi", "fina"] });
    cx += doc.widthOfString(t) + doc.widthOfString(" ");
  }
}

export function buildProformaPdf(p: ProformaInput): Promise<Buffer> {
  const { r, b } = loadFonts();
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: `Pro forma invoice ${p.number}`, Author: "Medora Care", Subject: `Order ${p.orderRef}` } });
  doc.registerFont("R", r);
  doc.registerFont("B", b);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res, rej) => { doc.on("end", () => res(Buffer.concat(chunks))); doc.on("error", rej); });

  const L = 40, R = doc.page.width - 40, W = R - L;
  const watermark = () => {
    doc.save();
    doc.rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.font("B").fontSize(72).fillColor(TEAL).fillOpacity(0.07);
    const w = doc.widthOfString("PRO FORMA");
    doc.text("PRO FORMA", (doc.page.width - w) / 2, doc.page.height / 2 - 50, { lineBreak: false });
    doc.restore();
    doc.fillOpacity(1);
  };
  watermark();
  doc.on("pageAdded", watermark);

  // Header
  doc.font("B").fontSize(20).fillColor(INK).text("Medora Care", L, 40, { lineBreak: false });
  doc.font("R").fontSize(10).fillColor(MUTED).text("Beirut, Lebanon", L, 66).text("Phone: 03 928 784 · info@medoracare.com", L, 80);
  doc.font("B").fontSize(22).fillColor(TEAL).text("Pro forma invoice", L, 38, { width: W, align: "right" });
  doc.font("B").fontSize(11).fillColor(INK).text(p.number, L, 66, { width: W, align: "right" });
  doc.font("R").fontSize(10).fillColor(INK).text(`Date: ${isoDay(p.date)}`, L, 82, { width: W, align: "right" });
  doc.moveTo(L, 108).lineTo(R, 108).lineWidth(1.5).strokeColor("#1a9aa8").stroke();

  // Customer and number boxes
  const bw = (W - 20) / 2, by = 124, bh = 84;
  doc.lineWidth(0.8).strokeColor(BOX).roundedRect(L, by, bw, bh, 6).stroke().roundedRect(L + bw + 20, by, bw, bh, 6).stroke();
  doc.font("R").fontSize(8).fillColor(MUTED).text("CUSTOMER", L + 12, by + 14, { characterSpacing: 0.6 });
  doc.font("B").fontSize(11).fillColor(INK); textLine(doc, p.customer.name, L + 12, by + 30, bw - 24);
  doc.font("R").fontSize(10).fillColor(INK); textLine(doc, p.customer.phone, L + 12, by + 48, bw - 24);
  const kv = (k: string, v: string, y: number) => {
    const x = L + bw + 32;
    doc.font("R").fontSize(8).fillColor(MUTED).text(k, x, y + 2, { continued: false, characterSpacing: 0.6, lineBreak: false });
    doc.font("B").fontSize(10.5).fillColor(INK).text(v, x + doc.font("R").fontSize(8).widthOfString(k) + 10, y, { lineBreak: false });
  };
  kv("NUMBER", p.number, by + 13);
  kv("DATE", isoDay(p.date), by + 31);
  kv("VALID UNTIL", isoDay(p.validUntil), by + 49);
  doc.font("R").fontSize(8).fillColor(MUTED).text(`Order ${p.orderRef}`, L + bw + 32, by + 67, { lineBreak: false });

  // Items table
  const col = { n: L + 8, d: L + 36, q: L + W * 0.58, u: L + W * 0.72, t: L + W * 0.86 };
  const qW = W * 0.12, uW = W * 0.13, tW = R - 8 - col.t;
  let y = by + bh + 22;
  const head = () => {
    doc.rect(L, y, W, 22).fill(HEAD_BG);
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor("#9fb3b7").stroke();
    doc.font("B").fontSize(9).fillColor(INK);
    doc.text("#", col.n, y + 7, { lineBreak: false }).text("Description", col.d, y + 7, { lineBreak: false });
    doc.text("Quantity", col.q, y + 7, { width: qW, align: "right" });
    doc.text("Unit price", col.u, y + 7, { width: uW, align: "right" });
    doc.text("Total", col.t, y + 7, { width: tW, align: "right" });
    y += 22;
  };
  head();
  const dW = col.q - col.d - 10;
  let total = 0;
  p.lines.forEach((l, i) => {
    const lineTotal = Math.round(l.qty * l.price * 100) / 100;
    total += lineTotal;
    doc.font("R").fontSize(9.5);
    const desc = l.code ? `${l.code} ${l.name}` : l.name;
    const h = Math.max(20, (ARABIC.test(desc) ? 12 : doc.heightOfString(desc, { width: dW })) + 10);
    if (y + h > doc.page.height - 150) { doc.addPage(); y = 50; head(); }
    doc.fillColor(INK).font("R").fontSize(9.5).text(String(i + 1), col.n, y + 6, { lineBreak: false });
    if (ARABIC.test(desc)) {
      if (l.code) { doc.font("B"); doc.text(l.code, col.d, y + 6, { lineBreak: false }); }
      const off = l.code ? doc.font("B").widthOfString(l.code + " ") : 0;
      doc.font("R"); textLine(doc, l.name, col.d + off, y + 6, dW - off);
    } else if (l.code) {
      doc.font("B").text(l.code + " ", col.d, y + 6, { width: dW, continued: true }).font("R").text(l.name);
    } else {
      doc.text(l.name, col.d, y + 6, { width: dW });
    }
    doc.font("R").fontSize(9.5).fillColor(INK);
    doc.text(String(l.qty), col.q, y + 6, { width: qW, align: "right" });
    doc.text(money(l.price), col.u, y + 6, { width: uW, align: "right" });
    doc.text(money(lineTotal), col.t, y + 6, { width: tW, align: "right" });
    y += h;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.5).strokeColor(LINE).stroke();
  });

  // Total
  if (y + 120 > doc.page.height - 40) { doc.addPage(); y = 50; }
  y += 12;
  const tx = L + W * 0.62;
  doc.moveTo(tx, y).lineTo(R, y).lineWidth(1.5).strokeColor(INK).stroke();
  doc.font("B").fontSize(12).fillColor(INK).text("Total", tx + 8, y + 8, { lineBreak: false });
  doc.text(money(Math.round(total * 100) / 100), tx, y + 8, { width: R - 8 - tx, align: "right" });
  y += 40;

  // Terms
  const box = (draw: () => void, text: string) => {
    doc.font("R").fontSize(9.5);
    const h = doc.heightOfString(text, { width: W - 24 }) + 22;
    if (y + h > doc.page.height - 40) { doc.addPage(); y = 50; }
    doc.lineWidth(0.8).strokeColor(BOX).roundedRect(L, y, W, h, 6).stroke();
    doc.fillColor(INK);
    draw();
    y += h + 12;
  };
  if (p.note.trim()) box(() => doc.font("R").fontSize(9.5).text(p.note.trim(), L + 12, y + 11, { width: W - 24 }), p.note.trim());
  const legal = "Pro forma invoice: this is a quotation sent before the sale. It is not a tax invoice, creates no balance and does not reserve stock until the order is confirmed.";
  box(() => doc.font("B").fontSize(9.5).text("Pro forma invoice", L + 12, y + 11, { width: W - 24, continued: true }).font("R").text(legal.slice("Pro forma invoice".length)), legal);

  doc.end();
  return done;
}
