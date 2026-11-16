import { apiAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { json, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { MAX_SHOP_BYTES, saveShopPage, ShopConflictError } from "@/lib/services/push";
import { UserError } from "@/lib/services/errors";

// Replaces the public shop page: from the shop's own ⚙ Admin (Save & publish, which sends the version it was opened on
// in x-shop-version), or with an index.html downloaded from it (Customer alerts). ?force=1 uploads a file even though
// the live shop has newer products, after the person confirmed it.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const auth = await apiAuth("customers.notify");
  if (!auth) return json({ error: "You can't update the shop." }, 403);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_SHOP_BYTES + 1000) return json({ error: "The shop file is larger than 4 MB. Shrink some photos in the shop's Admin, then download it again." }, 413);
  const baseVersion = req.headers.get("x-shop-version")?.trim() || undefined;
  const force = new URL(req.url).searchParams.get("force") === "1";
  const html = await req.text();
  try {
    const version = await saveShopPage(html, auth.user.name, { baseVersion, force });
    await audit({ actorId: auth.user.id, action: "shop.page_updated", entity: "ShopPage", entityId: "main", meta: { bytes: Buffer.byteLength(html), from: baseVersion ? "admin" : "file", forced: force } });
    return json({ ok: true, version });
  } catch (e) {
    if (e instanceof ShopConflictError) return json({ error: e.message, conflict: e.kind }, 409);
    if (e instanceof UserError) return json({ error: e.message }, 400);
    log.error("shop.upload_failed", { error: String(e) });
    return json({ error: "The shop page could not be saved. Please try again." }, 500);
  }
}
