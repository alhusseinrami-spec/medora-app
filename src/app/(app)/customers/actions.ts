"use server";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";
import { UserError } from "@/lib/services/errors";
import { sendCampaign } from "@/lib/services/push";
import { ZodError } from "zod";

export type SendRes = { error?: string; ok?: string };

export async function sendCustomerAlertAction(raw: unknown): Promise<SendRes> {
  const { user } = await requireAuth({ permission: "customers.notify" });
  try {
    const c = await sendCampaign(user.id, raw);
    await audit({ actorId: user.id, action: "push.campaign_sent", entity: "PushCampaign", entityId: c.id, meta: { title: c.title, total: c.total, delivered: c.delivered } });
    revalidatePath("/customers/notify");
    const extra = [c.removed && `${c.removed} had turned them off and were removed`, c.failed && `${c.failed} could not be reached this time`].filter(Boolean).join(", ");
    return { ok: `Sent to ${c.delivered} of ${c.total} phones${extra ? ` (${extra})` : ""}.` };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Check the message." };
    log.error("push.campaign_failed", { error: String(e) });
    return { error: "The notification could not be sent. Please try again." };
  }
}
