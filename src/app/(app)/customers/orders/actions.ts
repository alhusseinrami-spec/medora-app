"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { ZodError } from "zod";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";
import { UserError } from "@/lib/services/errors";
import { createStaffShopOrder, customerLink, removeShopOrderDocument, setShopOrderStatus, SHOP_STATUS } from "@/lib/services/shopOrders";
import { zonedToUtc, TZ_DEFAULT } from "@/lib/time";

export type Res = { error?: string; ok?: string; id?: string; link?: string };

function fail(e: unknown, what: string): Res {
  if (e instanceof UserError) return { error: e.message };
  if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the details." };
  log.error(`shop_order.${what}_failed`, { error: String(e) });
  return { error: "That didn't work. Please try again." };
}

const reached = (n: number) => (n ? ` The customer's phone was notified.` : "");

// eta: "YYYY-MM-DDTHH:mm" in the signed-in person's time zone, or "".
export async function setShopOrderStatusAction(id: string, status: string, eta: string, note: string): Promise<Res> {
  const { user } = await requireAuth({ permission: "shop.orders" });
  try {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(eta);
    const estimatedAt = m ? zonedToUtc(m[1], m[2], user.timeZone || TZ_DEFAULT) : null;
    const r = await setShopOrderStatus(user, id, { status, estimatedAt, note });
    await audit({ actorId: user.id, action: "shop_order.status", entity: "ShopOrder", entityId: id, meta: { status, eta: estimatedAt?.toISOString() ?? null } });
    revalidatePath(`/customers/orders/${id}`);
    revalidatePath("/customers/orders");
    return { ok: `Marked ${SHOP_STATUS[r.order.status].label.toLowerCase()}.${reached(r.phones)}` };
  } catch (e) { return fail(e, "status"); }
}

export async function removeShopDocumentAction(docId: string): Promise<Res> {
  const { user } = await requireAuth({ permission: "shop.orders" });
  try {
    const d = await removeShopOrderDocument(user, docId);
    await audit({ actorId: user.id, action: "shop_order.document_removed", entity: "ShopOrder", entityId: d.orderId, meta: { file: d.fileName } });
    revalidatePath(`/customers/orders/${d.orderId}`);
    return { ok: "Removed." };
  } catch (e) { return fail(e, "document_remove"); }
}

export async function createShopOrderAction(raw: unknown): Promise<Res> {
  const { user } = await requireAuth({ permission: "shop.orders" });
  try {
    const o = await createStaffShopOrder(user, raw);
    await audit({ actorId: user.id, action: "shop_order.created", entity: "ShopOrder", entityId: o.id, meta: { ref: o.ref } });
    revalidatePath("/customers/orders");
    return { ok: "Saved.", id: o.id };
  } catch (e) { return fail(e, "create"); }
}

export async function customerLinkAction(customerId: string): Promise<Res> {
  const { user } = await requireAuth({ permission: "shop.orders" });
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
    const origin = process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL.replace(/\/$/, "") : `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
    return { link: await customerLink(user, customerId, origin) };
  } catch (e) { return fail(e, "link"); }
}
