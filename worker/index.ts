// Background worker: run as its own process (`npm run worker`) next to the web app.
// Every 30 s it turns due reminders into notifications; once a night it removes data past the retention period.
import { db } from "../src/lib/db";
import { log } from "../src/lib/log";
import { audit } from "../src/lib/audit";
import { fireDueReminders } from "../src/lib/services/reminders";

const TICK_MS = 30_000;
let lastPrune = 0;
let stopping = false;

export async function pruneByRetention(now = new Date()) {
  const s = await db.setting.findFirst({ where: { userId: null, key: "retention.days" } });
  const days = Number(s?.value ?? 180);
  const before = new Date(now.getTime() - days * 864e5);
  const [execs, notes, attempts, audits, sessions] = await db.$transaction([
    db.executionLog.deleteMany({ where: { at: { lt: before } } }),
    db.notification.deleteMany({ where: { readAt: { not: null, lt: before } } }),
    db.loginAttempt.deleteMany({ where: { at: { lt: before } } }),
    db.auditLog.deleteMany({ where: { at: { lt: before } } }),
    db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: before } }] } }),
  ]);
  const removed = { execs: execs.count, notifications: notes.count, attempts: attempts.count, audit: audits.count, sessions: sessions.count };
  await audit({ actorKind: "worker", action: "retention.prune", entity: "system", meta: { days, ...removed } });
  log.info("worker.pruned", { days, ...removed });
  return removed;
}

async function tick() {
  try {
    await fireDueReminders();
    // Heartbeat so /api/health can show the worker is alive (kept out of the audit log to avoid noise).
    const at = new Date().toISOString();
    const hb = await db.setting.findFirst({ where: { userId: null, key: "worker.heartbeat" } });
    if (hb) await db.setting.update({ where: { id: hb.id }, data: { value: at } });
    else await db.setting.create({ data: { key: "worker.heartbeat", value: at } });
    if (Date.now() - lastPrune > 24 * 3600_000) { lastPrune = Date.now(); await pruneByRetention(); }
  } catch (e) {
    log.error("worker.tick_failed", { error: String(e) });
  }
}

async function main() {
  log.info("worker.started", { tickMs: TICK_MS });
  while (!stopping) {
    await tick();
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  await db.$disconnect();
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopping = true; log.info("worker.stopping"); });
if (process.argv[1]?.includes("worker")) main();
