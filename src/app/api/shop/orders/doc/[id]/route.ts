import { documentForCustomer, fileResponse } from "@/lib/services/shopOrders";
import { rateLimited } from "@/lib/http";

// Opens a pro forma or invoice for the customer it belongs to. The link carries a token made for this one document.
export async function GET(req: Request, ctx: RouteContext<"/api/shop/orders/doc/[id]">) {
  const { id } = await ctx.params;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (rateLimited("shop-doc:" + ip, 60, 60_000)) return new Response("Too many requests", { status: 429 });
  const d = await documentForCustomer(id, new URL(req.url).searchParams.get("t") ?? "");
  if (!d) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  return fileResponse(d);
}
