import { apiAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { json, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { addShopOrderDocument, MAX_DOC_BYTES } from "@/lib/services/shopOrders";
import { UserError } from "@/lib/services/errors";

// Attaches a pro forma or invoice to a shop order; the customer sees it in My orders straight away.
export async function POST(req: Request, ctx: RouteContext<"/api/customers/orders/[id]/documents">) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const auth = await apiAuth("shop.orders");
  if (!auth) return json({ error: "You can't manage shop orders." }, 403);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_DOC_BYTES + 20_000) return json({ error: "The file is larger than 4 MB." }, 413);
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) return json({ error: "Choose a file." }, 400);
  try {
    const r = await addShopOrderDocument(auth.user, id, { kind: String(form.get("kind") ?? ""), fileName: file.name, mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
    await audit({ actorId: auth.user.id, action: "shop_order.document_added", entity: "ShopOrder", entityId: id, meta: { kind: r.doc.kind, file: r.doc.fileName } });
    return json({ ok: true, phones: r.phones });
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.code === "not_found" ? 404 : 400);
    log.error("shop_order.document_failed", { error: String(e) });
    return json({ error: "The file could not be saved. Please try again." }, 500);
  }
}
