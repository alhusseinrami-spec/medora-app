// Privacy policy for the public Medora Care shop and its Android app.
// Google Play links to this page from the store listing.
export const dynamic = "force-static";

const UPDATED = "5 November 2026";

const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Privacy policy | Medora Care</title><meta name="theme-color" content="#0f5f66"><link rel="icon" href="/shop-icon-192.png">
<style>
:root{--bg:#f1f7f8;--card:#fff;--tx:#12363b;--mu:#5d7b80;--bd:#dbe7e9;--pr:#0f5f66}
@media(prefers-color-scheme:dark){:root{--bg:#0d1f22;--card:#142b2f;--tx:#e6f2f3;--mu:#93b0b4;--bd:#23424a;--pr:#7fd3dd}}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;background:var(--bg);color:var(--tx)}
main{max-width:720px;margin:0 auto;padding:24px 16px 48px}.card{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:20px 22px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:24px 0 6px}p,li{margin:6px 0}.mu{color:var(--mu);font-size:14px}a{color:var(--pr);font-weight:600}
</style></head><body><main><div class="card">
<h1>Privacy policy</h1>
<p class="mu">Medora Care online shop and Android app. Last updated ${UPDATED}.</p>

<p>Medora Care sells medical and laboratory supplies in Lebanon. This policy explains what information our shop website and our Android app use, and why. The Android app opens the same shop as our website, so this policy covers both.</p>

<h2>What we collect</h2>
<ul>
<li><b>Your order.</b> You don't need an account to use the shop. When you send an order, it goes to us on WhatsApp or by phone, with the items you chose and the name, phone number and delivery address you give us. We use this only to confirm, deliver and support your order. WhatsApp's own privacy policy applies to messages sent through WhatsApp.</li>
<li><b>Notifications, if you turn them on.</b> If you allow notifications, your phone or browser gives us a notification address and keys, plus your language and browser type. We use them only to send you Medora Care news and offers. You can turn notifications off at any time in the shop or in your phone's settings, and the address is then deleted.</li>
<li><b>Technical logs.</b> Our hosting provider keeps standard server logs, such as IP address, device and browser type and the pages requested, to keep the site secure and working.</li>
</ul>

<h2>What we don't do</h2>
<ul>
<li>We don't sell your information or share it for advertising.</li>
<li>We don't use advertising or tracking tools in the shop or the app.</li>
<li>The app doesn't access your contacts, photos, camera, microphone or location.</li>
</ul>

<h2>Who we share it with</h2>
<p>Only the services needed to run the shop: our website hosting and database providers, the browser's notification service (for example Google for Chrome on Android), and the delivery and payment services you choose for your order, such as Whish Money.</p>

<h2>How long we keep it</h2>
<p>We keep order details for as long as we need them for delivery, support and our accounting records. Notification addresses are kept until you turn notifications off or the address stops working.</p>

<h2>Your choices</h2>
<p>You can ask us what information we hold about you, or ask us to correct or delete it, by contacting us below. We'll answer within 30 days.</p>

<h2>Children</h2>
<p>The shop is meant for adults and healthcare buyers. We don't knowingly collect information from children under 13.</p>

<h2>Contact</h2>
<p>Medora Care, Lebanon. Phone and WhatsApp: <a href="https://wa.me/9613928784">03 928 784</a>.</p>

<h2>Changes</h2>
<p>If we change this policy, we'll update this page and the date at the top.</p>
<p class="mu"><a href="/shop">Back to the shop</a></p>
</div></main></body></html>`;

export function GET() {
  return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
