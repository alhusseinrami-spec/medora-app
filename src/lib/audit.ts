import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { log } from "./log";

export async function audit(a: {
  actorId?: string | null; actorKind?: "user" | "ai" | "worker" | "system";
  action: string; entity: string; entityId?: string | null; ip?: string | null; meta?: Prisma.InputJsonValue;
}) {
  try {
    await db.auditLog.create({ data: { actorId: a.actorId ?? null, actorKind: a.actorKind ?? "user", action: a.action, entity: a.entity, entityId: a.entityId ?? null, ip: a.ip ?? null, meta: a.meta } });
  } catch (e) {
    log.error("audit.write_failed", { action: a.action, error: String(e) });
  }
}

export async function execLog<T>(kind: string, name: string, userId: string | null, input: unknown, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    await db.executionLog.create({ data: { kind, name, status: "ok", userId, input: toJson(input), output: toJson(out), durationMs: Date.now() - t0 } }).catch(() => {});
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.executionLog.create({ data: { kind, name, status: "error", userId, input: toJson(input), error: msg, durationMs: Date.now() - t0 } }).catch(() => {});
    log.error(`${kind}.${name}.failed`, { error: msg });
    throw e;
  }
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined) return undefined;
  try { return JSON.parse(JSON.stringify(v)); } catch { return String(v); }
}
