// Medora service worker: shows Web Push notifications and opens the right page when one is tapped.
// It does no caching, so the app always loads fresh from the server.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const link = typeof data.link === "string" && data.link.startsWith("/") && !data.link.startsWith("//") ? data.link : "/";
  event.waitUntil(self.registration.showNotification(data.title || "Medora", {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag || undefined,
    data: { link },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.link) || "/", self.location.origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = windows.filter((c) => new URL(c.url).origin === target.origin);
    const client = same.find((c) => c.url === target.href) || same[0];
    if (client) {
      await client.focus();
      if (client.url !== target.href && "navigate" in client) {
        try { await client.navigate(target.href); } catch { /* not controlled by this worker yet */ }
      }
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});
