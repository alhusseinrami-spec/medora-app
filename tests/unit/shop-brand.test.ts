import { describe, expect, it } from "vitest";
import { applyBrand, BRAND_CSS, FAVICON_LINK } from "@/lib/shop-brand";

const OLD = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Medora Care | Medical Supplies in Lebanon</title>
<style id="css">
.logo{text-decoration:none;font-weight:700;font-size:21px;color:var(--prd);line-height:1}
.logo small{display:block;font-size:10px;font-weight:600;letter-spacing:.32em;color:var(--pr);margin-top:3px}
</style></head>
<body>
<template id="tpl"><header class="top"><div class="wrap bar">
<a class="logo" href="#top">Medora<small>CARE</small></a>
</div></header>
<footer id="contact"><div class="wrap">
<div><div class="lg">Medora Care</div><p>Medical and laboratory supplies | Lebanon</p></div>
</div></footer></template>
<script id="code">const HEAD="<meta charset=\\"utf-8\\">\\n<title>Medora Care | Medical Supplies in Lebanon</title>\\n";</script>
</body></html>`;

describe("shop logo", () => {
  it("swaps the old text logo for the new logo in the header and footer", () => {
    const out = applyBrand(OLD);
    expect(out).not.toContain("Medora<small>CARE</small>");
    expect(out).not.toContain('<div class="lg">Medora Care</div>');
    expect(out.match(/<svg class="brand"/g)).toHaveLength(2);
    expect(out).toContain(BRAND_CSS);
    expect(out).not.toContain("letter-spacing:.32em");
  });

  it("adds the cross as the tab icon, also to the copy the shop's Download site file writes", () => {
    const out = applyBrand(OLD);
    expect(out.indexOf(FAVICON_LINK)).toBeLessThan(out.indexOf("</head>"));
    expect(out).toContain(FAVICON_LINK.replace(/"/g, '\\"'));
  });

  it("changes nothing the second time", () => {
    const once = applyBrand(OLD);
    expect(applyBrand(once)).toBe(once);
  });

  it("leaves a page without the old logo alone, apart from the tab icon", () => {
    const page = "<html><head><title>x</title></head><body><h1>Shop</h1></body></html>";
    expect(applyBrand(page)).toBe(`<html><head><title>x</title>${FAVICON_LINK}\n</head><body><h1>Shop</h1></body></html>`);
  });
});
