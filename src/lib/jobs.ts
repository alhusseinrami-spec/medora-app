// Scheduled jobs, shared by the Vercel Cron route (/api/cron/tick) and the standalone worker (`npm run worker`).
// Due reminders become notifications; approved orders go to the accounting system; once a day, data past the retention period is removed.
import { db } from "./db";
import { log } from "./log";
import { audit } from "./audit";
import { fireDueReminders } from "./services/reminders";
import { pushApprovedOrders } from "./services/accountingSync";

const PRUNE_EVERY_MS = 24 * 3600_000;

async function setSystem(key: string, value: string) {
  const s = await db.setting.findFirst({ where: { userId: null, key } });
  if (s) await db.setting.update({ where: { id: s.id }, data: { value } });
  else await db.setting.create({ data: { key, value } });
}

async function getSystem(key: string): Promise<string | null> {
  const s = await db.setting.findFirst({ where: { userId: null, key } });
  return typeof s?.value === "string" ? s.value : null;
}

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

// One pass of every scheduled job. Safe to run from several places at once:
// reminders are claimed row by row, and pruning only deletes what is already past retention.
export async function runJobs(now = new Date()) {
  const fired = await fireDueReminders(now);
  // A failing accounting system must not stop reminders or clean-up.
  const synced = await pushApprovedOrders(now).catch((e) => { log.error("accounting.sync_pass_failed", { error: String(e) }); return { sent: 0, failed: 0 }; });
  // Heartbeat so /api/health can show scheduled jobs are running (kept out of the audit log to avoid noise).
  await setSystem("worker.heartbeat", now.toISOString());
  const last = await getSystem("worker.lastPrune");
  let pruned = false;
  if (!last || now.getTime() - Date.parse(last) > PRUNE_EVERY_MS) {
    await setSystem("worker.lastPrune", now.toISOString());
    await pruneByRetention(now);
    pruned = true;
  }
  return { fired, pruned, synced };
}
