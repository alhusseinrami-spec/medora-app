import { apiAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { json, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { MAX_SHOP_BYTES, saveShopPage } from "@/lib/services/push";
import { UserError } from "@/lib/services/errors";

// Replaces the public shop page with the index.html downloaded from the shop's Admin.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const auth = await apiAuth("customers.notify");
  if (!auth) return json({ error: "You can't update the shop." }, 403);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_SHOP_BYTES + 1000) return json({ error: "The shop file is larger than 4 MB. Shrink some photos in the shop's Admin, then download it again." }, 413);
  const html = await req.text();
  try {
    await saveShopPage(html, auth.user.name);
    await audit({ actorId: auth.user.id, action: "shop.page_updated", entity: "ShopPage", entityId: "main", meta: { bytes: Buffer.byteLength(html) } });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    log.error("shop.upload_failed", { error: String(e) });
    return json({ error: "The shop page could not be saved. Please try again." }, 500);
  }
}
