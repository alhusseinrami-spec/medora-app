// Medora Field service worker: makes the field app installable as a phone app.
// Pages always come fresh from the network; with no signal, a short offline note shows instead of an error page.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

const OFFLINE = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Medora Field</title><body style="font-family:system-ui;background:#f1f7f8;color:#0d1f22;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">
<div><h1 style="color:#0f5f66;font-size:22px">No connection</h1><p>Medora Field needs the internet. It will work again as soon as you have signal.</p>
<button onclick="location.reload()" style="background:#0f5f66;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:16px">Try again</button></div>`;

self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { "content-type": "text/html; charset=utf-8" } })));
});
