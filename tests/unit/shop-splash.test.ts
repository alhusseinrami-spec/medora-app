import { describe, expect, it } from "vitest";
import { injectPush } from "@/lib/services/push";
import { SPLASH_BODY, SPLASH_HEAD } from "@/lib/shop-splash";

const PAGE = `<!doctype html><html><head><title>Shop</title><script>var t="<body class=x>";</script></head><body class="shop"><p>hi</p></body></html>`;

describe("Animated logo on the shop", () => {
  it("puts the logo styles in the head and the logo script first in the real body", () => {
    const out = injectPush(PAGE, "KEY");
    expect(out.indexOf(SPLASH_HEAD)).toBeLessThan(out.indexOf("</head>"));
    expect(out).toContain(`<body class="shop">${SPLASH_BODY}<p>hi</p>`);
    expect(out).toContain('var t="<body class=x>";</script>');
  });

  it("adds it only once, even to a page saved from the live shop", () => {
    const twice = injectPush(injectPush(PAGE, "KEY"), "KEY");
    expect(twice.split('id="medora-splash-js"')).toHaveLength(2);
    expect(twice.split('id="medora-splash-css"')).toHaveLength(2);
  });

  it("only runs for app launches, once per launch, and lasts about 3 seconds", () => {
    expect(SPLASH_BODY).toContain("display-mode: standalone");
    expect(SPLASH_BODY).toContain("navigator.standalone");
    expect(SPLASH_BODY).toContain("android-app://");
    expect(SPLASH_BODY).toContain('sessionStorage.getItem("medora_splash")');
    expect(SPLASH_BODY).toContain("setTimeout(hide,2650)");
  });
});
