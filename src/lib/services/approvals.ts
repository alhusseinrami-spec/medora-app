import type { ApprovalStage, Prisma, User } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { audit } from "../audit";
import { can } from "../rbac";
import { UserError } from "./errors";
import { notify } from "./notifications";
import { createTask, deleteTask, updateTask } from "./tasks";
import { deleteContact } from "./contacts";
import { deleteEvent } from "./events";

type Actor = Pick<User, "id" | "role" | "timeZone" | "name">;

// Every kind the Approval Center can carry out, with the payload it needs.
// A kind that is not listed here cannot be proposed, so nothing waits on an action that can't run.
export const APPROVAL_KINDS = {
  "task.create": { label: "Add a task", payload: z.object({ title: z.string().min(1).max(200), notes: z.string().max(5000).default(""), due: z.string().nullable().optional(), priority: z.enum(["P1", "P2", "P3", "P4"]).default("P3") }) },
  "task.assign": { label: "Assign a task to someone", payload: z.object({ taskId: z.string(), assigneeId: z.string() }) },
  "task.delete": { label: "Delete a task", payload: z.object({ taskId: z.string() }) },
  "event.delete": { label: "Delete a calendar entry", payload: z.object({ eventId: z.string() }) },
  "contact.delete": { label: "Delete a contact", payload: z.object({ contactId: z.string() }) },
  "memory.save": { label: "Remember a preference", payload: z.object({ content: z.string().min(3).max(1000), kind: z.enum(["preference", "fact"]).default("preference") }) },
} as const;
export type ApprovalKind = keyof typeof APPROVAL_KINDS;
export const isApprovalKind = (k: string): k is ApprovalKind => k in APPROVAL_KINDS;

export async function proposeApproval(a: Actor, p: { kind: string; title: string; detail?: string; payload: unknown; stage?: "SUGGESTION" | "DRAFT"; requestedBy?: "ai" | "user" | "automation" }) {
  if (!isApprovalKind(p.kind)) throw new UserError(`"${p.kind}" is not something the Approval Center can carry out.`);
  const parsed = APPROVAL_KINDS[p.kind].payload.safeParse(p.payload);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Invalid approval details.");
  const ap = await db.approval.create({
    data: { userId: a.id, kind: p.kind, title: p.title.slice(0, 200), detail: (p.detail ?? "").slice(0, 2000), payload: parsed.data as Prisma.InputJsonValue, stage: p.stage ?? "DRAFT", requestedBy: p.requestedBy ?? "ai" },
  });
  await audit({ actorId: a.id, actorKind: p.requestedBy === "user" ? "user" : "ai", action: `approval.${ap.stage.toLowerCase()}`, entity: "approval", entityId: ap.id, meta: { kind: ap.kind, title: ap.title } });
  await notify(a.id, { kind: "approval", title: `Waiting for your approval: ${ap.title}`, link: "/approvals" });
  return ap;
}

export function listApprovals(a: Actor, stage?: ApprovalStage) {
  return db.approval.findMany({
    where: { ...(can(a.role, "approvals.decide") && a.role === "OWNER" ? {} : { userId: a.id }), ...(stage ? { stage } : {}) },
    include: { decidedBy: { select: { name: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" }, take: 300,
  });
}

export async function approvalCounts(userId: string) {
  const rows = await db.approval.groupBy({ by: ["stage"], where: { userId }, _count: true });
  const c: Record<ApprovalStage, number> = { SUGGESTION: 0, DRAFT: 0, APPROVED: 0, COMPLETED: 0, REJECTED: 0 };
  for (const r of rows) c[r.stage] = r._count;
  return c;
}

async function loadDecidable(a: Actor, id: string) {
  const ap = await db.approval.findUnique({ where: { id } });
  if (!ap) throw new UserError("That approval doesn't exist.", "not_found");
  if (ap.userId !== a.id && !can(a.role, "approvals.decide")) throw new UserError("Your role can't decide this approval.", "forbidden");
  if (ap.stage !== "DRAFT" && ap.stage !== "SUGGESTION") throw new UserError("This item has already been decided.");
  return ap;
}

export async function rejectApproval(a: Actor, id: string) {
  await loadDecidable(a, id);
  const ap = await db.approval.update({ where: { id }, data: { stage: "REJECTED", decidedById: a.id, decidedAt: new Date() } });
  await audit({ actorId: a.id, action: "approval.reject", entity: "approval", entityId: id, meta: { kind: ap.kind } });
  return ap;
}

// Approve, then carry the action out straight away. A failure leaves it APPROVED with the reason.
export async function approveApproval(a: Actor, id: string, edits?: Record<string, unknown>) {
  const ap0 = await loadDecidable(a, id);
  const kind = ap0.kind;
  if (!isApprovalKind(kind)) throw new UserError("Unknown approval kind.");
  const payload = APPROVAL_KINDS[kind].payload.safeParse({ ...(ap0.payload as object), ...(edits ?? {}) });
  if (!payload.success) throw new UserError(payload.error.issues[0]?.message ?? "Invalid details.");
  await db.approval.update({ where: { id }, data: { stage: "APPROVED", decidedById: a.id, decidedAt: new Date(), payload: payload.data as Prisma.InputJsonValue } });
  await audit({ actorId: a.id, action: "approval.approve", entity: "approval", entityId: id, meta: { kind } });
  try {
    const owner = await db.user.findUniqueOrThrow({ where: { id: ap0.userId } });
    const { result, link } = await execute(kind, payload.data, owner, a);
    const done = await db.approval.update({ where: { id }, data: { stage: "COMPLETED", completedAt: new Date(), result, resultLink: link ?? "" } });
    await audit({ actorId: a.id, action: "approval.complete", entity: "approval", entityId: id, meta: { kind, result } });
    return done;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.approval.update({ where: { id }, data: { result: `Failed: ${msg}` } });
    throw new UserError(`Approved, but it couldn't be carried out: ${msg}`);
  }
}

async function execute(kind: ApprovalKind, p: Record<string, unknown>, owner: User, decider: Actor): Promise<{ result: string; link?: string }> {
  switch (kind) {
    case "task.create": {
      const t = await createTask(owner, { title: p.title, notes: p.notes, due: p.due ?? null, priority: p.priority });
      return { result: `Task added: ${t.title}`, link: "/tasks" };
    }
    case "task.assign": {
      const assignee = await db.user.findUnique({ where: { id: String(p.assigneeId) } });
      if (!assignee || assignee.disabledAt) throw new Error("That person no longer has an account.");
      await updateTask(decider, String(p.taskId), { assigneeId: assignee.id });
      await notify(assignee.id, { kind: "task", title: `${decider.name} assigned you a task`, link: "/tasks" });
      return { result: `Assigned to ${assignee.name}`, link: "/tasks" };
    }
    case "task.delete": await deleteTask(decider, String(p.taskId)); return { result: "Task deleted" };
    case "event.delete": await deleteEvent(owner, String(p.eventId)); return { result: "Calendar entry deleted" };
    case "contact.delete": await deleteContact(decider, String(p.contactId)); return { result: "Contact deleted" };
    case "memory.save": {
      const m = await db.memory.create({ data: { userId: owner.id, content: String(p.content), kind: String(p.kind ?? "preference"), source: "assistant", approvedAt: new Date() } });
      await audit({ actorId: decider.id, action: "memory.create", entity: "memory", entityId: m.id });
      return { result: "Saved to the assistant's memory", link: "/settings#memory" };
    }
  }
}
