import { z } from "zod";
import { apiAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { json, sameOrigin } from "@/lib/http";
import { isPushEndpoint } from "@/lib/push";

export const dynamic = "force-dynamic";

// The shape of PushSubscription.toJSON() in the browser.
const Body = z.object({
  endpoint: z.string().max(2000).refine(isPushEndpoint, "That isn't a push service address."),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const auth = await apiAuth();
  if (!auth) return json({ error: "Sign in required" }, 401);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid subscription." }, 400);
  const { endpoint, keys } = parsed.data;
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  // An endpoint belongs to one browser; if someone else signs in on it, it moves to them.
  const sub = await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: auth.user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: auth.user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
  await audit({ actorId: auth.user.id, action: "push.subscribe", entity: "push_subscription", entityId: sub.id });
  return json({ ok: true }, 201);
}
