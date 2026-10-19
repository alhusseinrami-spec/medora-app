import { apiAuth } from "@/lib/auth";
import { json, rateLimited, sameOrigin } from "@/lib/http";
import { sendPush } from "@/lib/push";

export const dynamic = "force-dynamic";

// Sends a test push to every phone and browser the signed-in user has enabled.
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const auth = await apiAuth();
  if (!auth) return json({ error: "Sign in required" }, 401);
  if (rateLimited(`push-test:${auth.user.id}`, 5, 60_000)) return json({ error: "Too many tests, try again in a minute." }, 429);
  const r = await sendPush(auth.user.id, { title: "Medora test", body: "Phone notifications are working.", link: "/settings#phone" });
  if (!r.sent) return json({ error: r.failed ? "The push service refused the test. Try Disable, then Enable again." : "No device is enabled. Press Enable first." }, 400);
  return json({ ok: true, ...r });
}
