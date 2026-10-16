import { apiAuth } from "@/lib/auth";
import { json, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { runJobs } from "@/lib/jobs";
import { listNotifications, markRead, unreadCount } from "@/lib/services/notifications";

// The bell polls this route, so it also runs due jobs (at most every 30 s per instance).
// On a Vercel plan whose cron only runs daily, this keeps reminders on time while the app is open.
let lastJobs = 0;
async function catchUpJobs() {
  if (Date.now() - lastJobs < 30_000) return;
  lastJobs = Date.now();
  try { await runJobs(); } catch (e) { log.error("jobs.catch_up_failed", { error: String(e) }); }
}

export async function GET() {
  const auth = await apiAuth();
  if (!auth) return json({ error: "Sign in required" }, 401);
  await catchUpJobs();
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
