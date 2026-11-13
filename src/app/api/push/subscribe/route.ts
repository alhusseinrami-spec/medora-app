import { json, rateLimited, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { removeSubscriber, saveSubscriber } from "@/lib/services/push";

// Called by the public shop when a customer turns phone notifications on or off. No sign-in.
function ip(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  if (rateLimited("push-sub:" + ip(req), 10, 60_000)) return json({ error: "Too many requests" }, 429);
  const body = await req.json().catch(() => null);
  try {
    await saveSubscriber(body?.subscription, String(body?.lang ?? "en"), req.headers.get("user-agent") ?? "", body?.customer);
    return json({ ok: true });
  } catch (e) {
    log.warn("push.subscribe_rejected", { error: String(e).slice(0, 200) });
    return json({ error: "That subscription was not accepted." }, 400);
  }
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  if (rateLimited("push-sub:" + ip(req), 10, 60_000)) return json({ error: "Too many requests" }, 429);
  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint === "string" && body.endpoint.length < 1000) await removeSubscriber(body.endpoint);
  return json({ ok: true });
}
