import { db } from "@/lib/db";
import { json } from "@/lib/http";

// For uptime checks and the hosting platform. Reports nothing sensitive.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const hb = await db.setting.findFirst({ where: { userId: null, key: "worker.heartbeat" } });
    const last = typeof hb?.value === "string" ? hb.value : null;
    // Jobs run every 30 s with the worker, at least daily with Vercel Cron, and whenever the app is open.
    const jobsOk = !!last && Date.now() - Date.parse(last) < 26 * 3600_000;
    return json({ ok: true, db: "up", jobs: jobsOk ? "running" : "not seen in 26 hours", jobsLastRun: last });
  } catch {
    return json({ ok: false, db: "down" }, 503);
  }
}
