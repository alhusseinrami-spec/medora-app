import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { buildProformaPdf } from "@/lib/proformaPdf";

describe("Pro forma PDF", () => {
  it("builds a PDF with the number, the customer and every line, Arabic names included", async () => {
    const lines = Array.from({ length: 3 }, (_, i) => ({ code: `RH-0${10 + i}`, name: `Gauze swabs 10x10 cm, pack ${i + 1}`, qty: i + 2, price: 4.5 + i }));
    lines.push({ code: "RH-317", name: "شرشف ماص 40×60 سم", qty: 1, price: 12 });
    const pdf = await buildProformaPdf({
      number: "PF-2026-0008", date: new Date("2026-11-13T08:00:00Z"), validUntil: new Date("2026-11-27T08:00:00Z"),
      customer: { name: "صيدلية نور Pharmacy", phone: "+9613123456" }, lines, note: "Prices in US dollars. Delivery within 2 working days after confirmation.", orderRef: "MC-ABC234",
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    if (process.env.PF_OUT) writeFileSync(process.env.PF_OUT, pdf);
  });
});
