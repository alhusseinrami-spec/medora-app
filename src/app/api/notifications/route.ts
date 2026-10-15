import { apiAuth } from "@/lib/auth";
import { json, sameOrigin } from "@/lib/http";
import { listNotifications, markRead, unreadCount } from "@/lib/services/notifications";

export async function GET() {
  const auth = await apiAuth();
  if (!auth) return json({ error: "Sign in required" }, 401);
  const [items, unread] = await Promise.all([listNotifications(auth.user.id), unreadCount(auth.user.id)]);
  return json({ unread, items });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const auth = await apiAuth();
  if (!auth) return json({ error: "Sign in required" }, 401);
  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 200) : undefined;
  await markRead(auth.user.id, ids);
  return json({ ok: true });
}
