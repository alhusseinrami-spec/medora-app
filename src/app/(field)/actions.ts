"use server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { log } from "@/lib/log";
import { fmtDistance } from "@/lib/geo";
import type { Permission } from "@/lib/rbac";
import { UserError } from "@/lib/services/errors";
import {
  cancelOrder, checkIn, checkInNearest, createClient, createOrder, relocateClient, reviewOrder, saveProduct, setFollowUp, updateClient,
} from "@/lib/services/sales";

export type Res = { error?: string; ok?: string; id?: string; warn?: string };

async function act(permission: Permission, paths: string[], fn: (u: Awaited<ReturnType<typeof requireAuth>>["user"]) => Promise<Res | void>): Promise<Res> {
  const { user } = await requireAuth({ permission });
  try {
    const r = (await fn(user)) ?? {};
    for (const p of paths) revalidatePath(p, "layout");
    return r;
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    log.error("action.failed", { error: String(e) });
    return { error: "Something went wrong. Please try again." };
  }
}

const verdict = (v: { verified: boolean; distanceM: number | null; accuracyM: number }) =>
  v.verified ? undefined
    : v.distanceM == null ? "Not verified: this client had no saved location, so this spot is now saved as theirs."
    : v.accuracyM > 100 ? `Not verified: your phone's location was only accurate to ${fmtDistance(v.accuracyM)}.`
    : `Not verified: you are ${fmtDistance(v.distanceM)} from the client's saved location.`;

// Rep actions
export const createClientAction = async (raw: unknown) => act("sales.field", ["/field"], async (u) => ({ id: (await createClient(u, raw)).id, ok: "Client added" }));
export const updateClientAction = async (id: string, raw: unknown) => act("sales.field", ["/field"], async (u) => { await updateClient(u, id, raw); return { ok: "Saved" }; });
export const relocateClientAction = async (id: string, fix: unknown) => act("sales.field", ["/field"], async (u) => { await relocateClient(u, id, fix); return { ok: "Location updated" }; });
export const followUpAction = async (id: string, date: string | null, time?: string) => act("sales.field", ["/field"], async (u) => {
  await setFollowUp(u, id, date, time);
  return { ok: date ? "Follow-up set. You'll get a reminder." : "Follow-up cleared" };
});

export const checkInAction = async (id: string, fix: unknown, note?: string) => act("sales.field", ["/field"], async (u) => {
  const r = await checkIn(u, id, fix, note);
  if (r.duplicate) return { ok: "You already checked in here in the last 30 minutes.", id: r.visit.id };
  return { ok: r.visit.verified ? "Checked in. Visit verified." : "Checked in.", warn: verdict(r.visit), id: r.visit.id };
});

export const checkInNearestAction = async (fix: unknown) => act("sales.field", ["/field"], async (u) => {
  const r = await checkInNearest(u, fix);
  if (!r.found) {
    return { error: r.nearest ? `None of your clients is here. The nearest is ${r.nearest.name}, ${fmtDistance(r.nearest.d)} away. Add this place as a new client?` : "None of your clients is here yet. Add this place as a new client?" };
  }
  if (r.duplicate) return { ok: `You already checked in at ${r.client.name} in the last 30 minutes.`, id: r.client.id };
  return { ok: `Checked in at ${r.client.name}. Visit verified.`, id: r.client.id };
});

export const createOrderAction = async (raw: unknown) => act("sales.field", ["/field", "/sales"], async (u) => {
  const o = await createOrder(u, raw);
  return { id: o.id, ok: o.kind === "ORDER" ? `Order #${o.number} sent to accounting` : `Proforma request #${o.number} sent to accounting` };
});
export const cancelOrderAction = async (id: string) => act("sales.field", ["/field", "/sales"], async (u) => { await cancelOrder(u, id); return { ok: "Cancelled" }; });

// Accounting actions
export const reviewOrderAction = async (id: string, raw: unknown) => act("sales.review", ["/sales", "/field"], async (u) => {
  const o = await reviewOrder(u, id, raw);
  return { ok: o.status === "APPROVED" ? "Approved. The rep has been told." : o.status === "REJECTED" ? "Rejected. The rep has been told." : "Changes saved" };
});
export const saveProductAction = async (raw: unknown, id?: string) => act("sales.review", ["/sales"], async (u) => { const p = await saveProduct(u, raw, id); return { id: p.id, ok: "Saved" }; });
