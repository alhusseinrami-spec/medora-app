import { beforeEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { db } from "@/lib/db";
import { injectPush, isPushEndpoint, saveShopPage, saveSubscriber, sendCampaign, shopHtml, vapidKeys } from "@/lib/services/push";
import { makeUser, reset } from "./helpers";

beforeEach(async () => { await reset(); vi.restoreAllMocks(); });

const sub = (n: number) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/abc${n}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } });

describe("customer phone notifications", () => {
  it("accepts only real push service addresses", () => {
    expect(isPushEndpoint("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isPushEndpoint("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(isPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(isPushEndpoint("https://localhost/x")).toBe(false);
  });

  it("saves a subscriber once, even when the phone sends it again", async () => {
    await saveSubscriber(sub(1), "ar", "UA");
    await saveSubscriber(sub(1), "en", "UA");
    expect(await db.pushSubscriber.count()).toBe(1);
    await expect(saveSubscriber({ endpoint: "https://169.254.169.254/x", keys: sub(1).keys }, "en", "")).rejects.toThrow();
  });

  it("makes the keys once and keeps the private key encrypted", async () => {
    const a = await vapidKeys();
    const row = await db.setting.findUniqueOrThrow({ where: { id: "push-vapid" } });
    expect(JSON.stringify(row.value)).not.toContain(a.privateKey);
    expect(a.publicKey.length).toBeGreaterThan(80);
  });

  it("sends to every phone, removes the ones that turned it off, and records the result", async () => {
    const owner = await makeUser("OWNER", "Rami");
    for (const n of [1, 2, 3]) await saveSubscriber(sub(n), "en", "");
    const spy = vi.spyOn(webpush, "sendNotification").mockImplementation((async (s: { endpoint: string }) => {
      if (s.endpoint.endsWith("abc2")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (s.endpoint.endsWith("abc3")) throw Object.assign(new Error("busy"), { statusCode: 503 });
      return { statusCode: 201, body: "", headers: {} };
    }) as unknown as typeof webpush.sendNotification);
    const c = await sendCampaign(owner.id, { title: "New stock", body: "Oxygen concentrators are in.", link: "/shop#shop" });
    expect(spy).toHaveBeenCalledTimes(3);
    expect(JSON.parse(spy.mock.calls[0][1] as string)).toMatchObject({ title: "New stock", url: "/shop#shop" });
    expect(c).toMatchObject({ total: 3, delivered: 1, removed: 1, failed: 1 });
    expect(await db.pushSubscriber.count()).toBe(2);
  });

  it("refuses links that leave the site", async () => {
    const owner = await makeUser("OWNER");
    await saveSubscriber(sub(1), "en", "");
    for (const link of ["https://evil.example", "//evil.example", "/\\evil.example"])
      await expect(sendCampaign(owner.id, { title: "x", body: "y", link })).rejects.toThrow();
  });

  it("serves the uploaded shop with the notification button added", async () => {
    await expect(saveShopPage("hello", "Rami")).rejects.toThrow(/not the shop page/);
    await saveShopPage("<!doctype html><html><head><title>Shop</title></head><body><p>hi</p></body></html>", "Rami");
    const html = (await shopHtml())!;
    expect(html).toContain('<link rel="manifest" href="/shop.webmanifest">');
    expect(html.indexOf("/shop-push.js")).toBeLessThan(html.lastIndexOf("</body>"));
    expect(html.indexOf("rel=\"manifest\"")).toBeLessThan(html.indexOf("</head>"));
  });

  it("puts the button in the last body when the page has two", () => {
    const out = injectPush("<html><head></head><body><template><body></body></template></body></html>", "KEY");
    expect(out.endsWith('<script src="/shop-push.js" defer></script></body></html>')).toBe(true);
  });
});
