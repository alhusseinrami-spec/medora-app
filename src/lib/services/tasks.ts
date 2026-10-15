import type { Prisma, TaskStatus, User } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { can } from "../rbac";
import { TZ_DEFAULT, zonedToUtc, dayKey } from "../time";
import { TaskInput, TaskPatch } from "../validation";
import { UserError } from "./errors";
import { notify } from "./notifications";

type Actor = Pick<User, "id" | "role" | "timeZone" | "name">;
type By = "user" | "ai";

// A task is visible to its owner, its assignee, and to roles allowed to see the team.
export function taskScope(a: Pick<User, "id" | "role">): Prisma.TaskWhereInput {
  return can(a.role, "team.view") ? {} : { OR: [{ ownerId: a.id }, { assigneeId: a.id }] };
}

async function getVisible(a: Actor, id: string) {
  const t = await db.task.findFirst({ where: { id, ...taskScope(a) } });
  if (!t) throw new UserError("That task doesn't exist or isn't yours.", "not_found");
  return t;
}

const dueToDate = (due: string | null | undefined, tz: string) => (due ? zonedToUtc(due, "12:00", tz) : null);

export async function listTasks(a: Actor, f: { status?: TaskStatus[]; dueBefore?: Date; q?: string; take?: number } = {}) {
  return db.task.findMany({
    // AND keeps the visibility rule from being overwritten by the text-search OR.
    where: {
      AND: [taskScope(a)],
      ...(f.status ? { status: { in: f.status } } : {}),
      ...(f.dueBefore ? { due: { lte: f.dueBefore } } : {}),
      ...(f.q ? { OR: [{ title: { contains: f.q, mode: "insensitive" as const } }, { notes: { contains: f.q, mode: "insensitive" as const } }] } : {}),
    },
    include: { assignee: { select: { id: true, name: true } }, project: { select: { id: true, name: true } }, contact: { select: { id: true, name: true } } },
    orderBy: [{ status: "asc" }, { position: "asc" }, { createdAt: "asc" }],
    take: f.take ?? 500,
  });
}

export async function createTask(a: Actor, raw: unknown, by: By = "user") {
  const p = TaskInput.safeParse(raw);
  if (!p.success) throw new UserError(p.error.issues[0]?.message ?? "Invalid task.");
  const i = p.data;
  if (i.assigneeId && i.assigneeId !== a.id && !can(a.role, "team.assign")) throw new UserError("Your role can't assign tasks to others.", "forbidden");
  const last = await db.task.findFirst({ where: { ownerId: a.id, status: i.status }, orderBy: { position: "desc" }, select: { position: true } });
  const task = await db.task.create({
    data: {
      title: i.title, notes: i.notes, priority: i.priority, status: i.status, due: dueToDate(i.due, a.timeZone || TZ_DEFAULT),
      ownerId: a.id, assigneeId: i.assigneeId ?? null, projectId: i.projectId ?? null, contactId: i.contactId ?? null,
      position: (last?.position ?? 0) + 1, source: by === "ai" ? "assistant" : "app", doneAt: i.status === "DONE" ? new Date() : null,
    },
  });
  await audit({ actorId: a.id, actorKind: by, action: "task.create", entity: "task", entityId: task.id, meta: { title: task.title } });
  if (task.assigneeId && task.assigneeId !== a.id) await notify(task.assigneeId, { kind: "task", title: `${a.name} assigned you: ${task.title}`, link: "/tasks" });
  return task;
}

export async function updateTask(a: Actor, id: string, raw: unknown, by: By = "user") {
  const before = await getVisible(a, id);
  const p = TaskPatch.safeParse(raw);
  if (!p.success) throw new UserError(p.error.issues[0]?.message ?? "Invalid task.");
  const i = p.data;
  if (i.assigneeId !== undefined && i.assigneeId !== before.assigneeId && i.assigneeId !== a.id && !can(a.role, "team.assign")) throw new UserError("Your role can't assign tasks to others.", "forbidden");
  const task = await db.task.update({
    where: { id },
    data: {
      ...(i.title !== undefined && { title: i.title }), ...(i.notes !== undefined && { notes: i.notes }),
      ...(i.priority && { priority: i.priority }),
      ...(i.status && { status: i.status, doneAt: i.status === "DONE" ? before.doneAt ?? new Date() : null }),
      ...(i.due !== undefined && { due: dueToDate(i.due, a.timeZone || TZ_DEFAULT) }),
      ...(i.assigneeId !== undefined && { assigneeId: i.assigneeId }), ...(i.projectId !== undefined && { projectId: i.projectId }),
      ...(i.contactId !== undefined && { contactId: i.contactId }),
    },
  });
  await audit({ actorId: a.id, actorKind: by, action: "task.update", entity: "task", entityId: id, meta: { changed: Object.keys(i) } });
  return task;
}

// Drag and drop: put a task in a column at a position between its new neighbours.
export async function moveTask(a: Actor, id: string, status: TaskStatus, beforeId: string | null) {
  await getVisible(a, id);
  const col = await db.task.findMany({ where: { ...taskScope(a), status, NOT: { id } }, orderBy: { position: "asc" }, select: { id: true, position: true } });
  let position: number;
  if (!beforeId) position = (col.at(-1)?.position ?? 0) + 1;
  else {
    const i = col.findIndex((t) => t.id === beforeId);
    if (i < 0) position = (col.at(-1)?.position ?? 0) + 1;
    else position = i === 0 ? col[0].position - 1 : (col[i - 1].position + col[i].position) / 2;
  }
  const t = await db.task.update({ where: { id }, data: { status, position, doneAt: status === "DONE" ? new Date() : null } });
  await audit({ actorId: a.id, action: "task.move", entity: "task", entityId: id, meta: { status } });
  return t;
}

export async function deleteTask(a: Actor, id: string) {
  const t = await getVisible(a, id);
  if (t.ownerId !== a.id && !can(a.role, "team.assign")) throw new UserError("Only the task's owner can delete it.", "forbidden");
  await db.task.delete({ where: { id } });
  await audit({ actorId: a.id, action: "task.delete", entity: "task", entityId: id, meta: { title: t.title } });
}

export function dueLabel(due: Date | null, tz = TZ_DEFAULT) {
  if (!due) return null;
  const k = dayKey(due, tz), today = dayKey(new Date(), tz);
  return { key: k, overdue: k < today, today: k === today };
}
