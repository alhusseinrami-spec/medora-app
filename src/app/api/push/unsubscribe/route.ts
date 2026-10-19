import { z } from "zod";
import { apiAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { json, sameOrigin } from "@/lib/http";

export const dynamic = "force-dynamic";

const Body = z.object({ endpoint: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const auth = await apiAuth();
  if (!auth) return json({ error: "Sign in required" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid request." }, 400);
  const { count } = await db.pushSubscription.deleteMany({ where: { userId: auth.user.id, endpoint: parsed.data.endpoint } });
  if (count) await audit({ actorId: auth.user.id, action: "push.unsubscribe", entity: "push_subscription" });
  return json({ ok: true, removed: count });
}
