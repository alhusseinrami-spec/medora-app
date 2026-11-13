import { ZodError } from "zod";
import { json, rateLimited, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { customerOrders, placeShopOrder } from "@/lib/services/shopOrders";
import { UserError } from "@/lib/services/errors";

// The shop's My orders. No sign-in: the phone's own customer key comes in the x-medora-customer header.
function ip(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
}

export async function GET(req: Request) {
  if (rateLimited("shop-orders:" + ip(req), 60, 60_000)) return json({ error: "Too many requests" }, 429);
  const data = await customerOrders(req.headers.get("x-medora-customer"));
  return data ? json(data) : json({ customer: null, orders: [] });
}

// Sent by the shop when the customer taps "Send order on WhatsApp".
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  if (rateLimited("shop-order:" + ip(req), 15, 10 * 60_000)) return json({ error: "Too many orders. Please wait a few minutes." }, 429);
  const body = await req.json().catch(() => null);
  try {
    const o = await placeShopOrder(body);
    return json({ ok: true, ref: o.ref });
  } catch (e) {
    if (e instanceof ZodError) return json({ error: e.issues[0]?.message ?? "Check the order." }, 400);
    if (e instanceof UserError) return json({ error: e.message }, 400);
    log.error("shop.order_failed", { error: String(e) });
    return json({ error: "The order could not be saved." }, 500);
  }
}
