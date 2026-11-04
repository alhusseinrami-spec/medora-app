import { shopHtml } from "@/lib/services/push";
import { log } from "@/lib/log";

// The public customer shop. The page itself is uploaded from Customer alerts in the Command Center.
export const dynamic = "force-dynamic";

const PLACEHOLDER = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Medora Care</title>
<style>body{margin:0;font:16px/1.5 system-ui,sans-serif;background:#f1f7f8;color:#12363b;display:grid;place-items:center;min-height:100vh;padding:16px;text-align:center}a{color:#0f5f66;font-weight:600}</style></head>
<body><main><h1>Medora Care</h1><p>Our online shop is being updated. Order on WhatsApp or call <a href="https://wa.me/9613928784">03 928 784</a>.</p></main></body></html>`;

export async function GET() {
  let html: string | null = null;
  try { html = await shopHtml(); } catch (e) { log.error("shop.load_failed", { error: String(e) }); }
  return new Response(html ?? PLACEHOLDER, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Phones may keep it a minute; a new upload shows within about a minute.
      "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
