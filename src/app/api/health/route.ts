import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { encryptionKeyProblem } from "@/lib/crypto";

// For uptime checks and the hosting platform. Reports nothing sensitive.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const hb = await db.setting.findFirst({ where: { userId: null, key: "worker.heartbeat" } });
    const last = typeof hb?.value === "string" ? hb.value : null;
    // Jobs run every 30 s with the worker, at least daily with Vercel Cron, and whenever the app is open.
    const jobsOk = !!last && Date.now() - Date.parse(last) < 26 * 3600_000;
    // Which database changes are applied, so a deploy whose migrations didn't run is easy to spot.
    const [m] = await db.$queryRaw<{ name: string; failed: bigint }[]>`
      SELECT (SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1) AS name,
             (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS failed`;
    const keyProblem = encryptionKeyProblem();
    return json({
      ok: !keyProblem && !Number(m?.failed ?? 0), db: "up", schema: m?.name ?? "none", failedMigrations: Number(m?.failed ?? 0),
      encryptionKey: keyProblem ?? "ok", jobs: jobsOk ? "running" : "not seen in 26 hours", jobsLastRun: last,
    });
  } catch {
    return json({ ok: false, db: "down" }, 503);
  }
}
