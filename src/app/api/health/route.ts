import { db } from "@/lib/db";
import { json } from "@/lib/http";

// For uptime checks and the hosting platform. Reports nothing sensitive.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const hb = await db.setting.findFirst({ where: { userId: null, key: "worker.heartbeat" } });
    const last = typeof hb?.value === "string" ? hb.value : null;
    const workerOk = !!last && Date.now() - Date.parse(last) < 5 * 60_000;
    return json({ ok: true, db: "up", worker: workerOk ? "up" : "not seen in 5 minutes", workerLastRun: last });
  } catch {
    return json({ ok: false, db: "down" }, 503);
  }
}
