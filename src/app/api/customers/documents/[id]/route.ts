import { apiAuth } from "@/lib/auth";
import { json } from "@/lib/http";
import { documentForStaff, fileResponse } from "@/lib/services/shopOrders";

// Staff open an attached pro forma or invoice.
export async function GET(_req: Request, ctx: RouteContext<"/api/customers/documents/[id]">) {
  const auth = await apiAuth("shop.orders");
  if (!auth) return json({ error: "Sign in required" }, 401);
  const { id } = await ctx.params;
  const d = await documentForStaff(auth.user, id);
  return d ? fileResponse(d) : json({ error: "Not found" }, 404);
}
