"use server";
import { revalidatePath } from "next/cache";
import type { Prisma, Role, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { log } from "@/lib/log";
import { clientInfo, hashPassword, passwordProblem, requireAuth, verifyPassword } from "@/lib/auth";
import { can, type Permission } from "@/lib/rbac";
import { UserError } from "@/lib/services/errors";
import { createTask, deleteTask, moveTask, updateTask } from "@/lib/services/tasks";
import { createEvent, deleteEvent, updateEvent } from "@/lib/services/events";
import { createContact, deleteContact, updateContact } from "@/lib/services/contacts";
import { createReminder, setReminderStatus, snoozeReminder } from "@/lib/services/reminders";
import { approveApproval, rejectApproval } from "@/lib/services/approvals";

export type Res = { error?: string; ok?: string; id?: string };

// Runs an action for the signed-in user and turns failures into a message the screen can show.
async function act(permission: Permission | undefined, paths: string[], fn: (u: Awaited<ReturnType<typeof requireAuth>>["user"]) => Promise<Res | void>): Promise<Res> {
  const { user } = await requireAuth(permission ? { permission } : {});
  if (!can(user.role, "workspace.use")) return { error: "Your role can only view." };
  try {
    const r = (await fn(user)) ?? {};
    for (const p of paths) revalidatePath(p);
    return r;
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    log.error("action.failed", { error: String(e) });
    return { error: "Something went wrong. Please try again." };
  }
}
const ALL = ["/", "/tasks", "/calendar", "/contacts", "/reminders", "/approvals"];

// Tasks
export const createTaskAction = async (raw: unknown) => act(undefined, ALL, async (u) => ({ id: (await createTask(u, raw)).id, ok: "Task added" }));
export const updateTaskAction = async (id: string, raw: unknown) => act(undefined, ALL, async (u) => { await updateTask(u, id, raw); return { ok: "Saved" }; });
export const moveTaskAction = async (id: string, status: TaskStatus, beforeId: string | null) => act(undefined, ["/", "/tasks"], async (u) => { await moveTask(u, id, status, beforeId); });
export const deleteTaskAction = async (id: string) => act(undefined, ALL, async (u) => { await deleteTask(u, id); return { ok: "Task deleted" }; });

// Calendar
export const createEventAction = async (raw: unknown) => act(undefined, ALL, async (u) => ({ id: (await createEvent(u, raw)).id, ok: "Added to your calendar" }));
export const updateEventAction = async (id: string, raw: unknown) => act(undefined, ALL, async (u) => { await updateEvent(u, id, raw); return { ok: "Saved" }; });
export const deleteEventAction = async (id: string) => act(undefined, ALL, async (u) => { await deleteEvent(u, id); return { ok: "Deleted" }; });

// Contacts
export const createContactAction = async (raw: unknown) => act(undefined, ["/contacts"], async (u) => ({ id: (await createContact(u, raw)).id, ok: "Contact saved" }));
export const updateContactAction = async (id: string, raw: unknown) => act(undefined, ["/contacts"], async (u) => { await updateContact(u, id, raw); return { ok: "Saved" }; });
export const deleteContactAction = async (id: string) => act(undefined, ["/contacts"], async (u) => { await deleteContact(u, id); return { ok: "Contact deleted" }; });

// Reminders
export const createReminderAction = async (raw: unknown) => act(undefined, ["/", "/reminders"], async (u) => ({ id: (await createReminder(u, raw)).id, ok: "Reminder set" }));
export const reminderStatusAction = async (id: string, status: "DONE" | "DISMISSED") => act(undefined, ["/", "/reminders"], async (u) => { await setReminderStatus(u, id, status); });
export const snoozeReminderAction = async (id: string, minutes: number) => act(undefined, ["/", "/reminders"], async (u) => {
  if (![10, 60, 180, 1440].includes(minutes)) throw new UserError("Pick a snooze time from the list.");
  await snoozeReminder(u, id, minutes);
  return { ok: "Snoozed" };
});

// Approvals
export const approveAction = async (id: string, edits?: Record<string, unknown>) => act(undefined, ALL, async (u) => {
  const ap = await approveApproval(u, id, edits);
  return { ok: ap.result || "Approved" };
});
export const rejectAction = async (id: string) => act(undefined, ["/", "/approvals"], async (u) => { await rejectApproval(u, id); return { ok: "Rejected" }; });

// Dashboard layout (per user)
export async function saveLayoutAction(layout: { order: string[]; hidden: string[] }) {
  const { user } = await requireAuth();
  const value = { order: layout.order.slice(0, 20).map(String), hidden: layout.hidden.slice(0, 20).map(String) } as Prisma.InputJsonValue;
  await db.setting.upsert({ where: { userId_key: { userId: user.id, key: "dashboard.layout" } }, create: { userId: user.id, key: "dashboard.layout", value }, update: { value } });
  revalidatePath("/");
  return {};
}

// Profile and security
export async function updateProfileAction(raw: { name: string; timeZone: string }): Promise<Res> {
  const { user } = await requireAuth();
  const name = String(raw.name ?? "").trim().slice(0, 100);
  const tz = String(raw.timeZone ?? "");
  if (!name) return { error: "Add your name." };
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); } catch { return { error: "Pick a valid time zone." }; }
  await db.user.update({ where: { id: user.id }, data: { name, timeZone: tz } });
  await audit({ actorId: user.id, action: "user.profile_update", entity: "user", entityId: user.id });
  revalidatePath("/", "layout");
  return { ok: "Profile saved" };
}

export async function changePasswordAction(raw: { current: string; next: string }): Promise<Res> {
  const { user, session } = await requireAuth({ allowMfaSetup: true });
  if (!(await verifyPassword(user.passwordHash, raw.current))) return { error: "Your current password isn't right." };
  const bad = passwordProblem(raw.next);
  if (bad) return { error: bad };
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(raw.next) } });
  await db.session.updateMany({ where: { userId: user.id, id: { not: session.id }, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ actorId: user.id, action: "user.password_change", entity: "user", entityId: user.id, ip: (await clientInfo()).ip });
  return { ok: "Password changed. Other devices were signed out." };
}

export async function revokeSessionAction(id: string): Promise<Res> {
  const { user, session } = await requireAuth();
  if (id === session.id) return { error: "Use Sign out for this device." };
  await db.session.updateMany({ where: { id, userId: user.id }, data: { revokedAt: new Date() } });
  await audit({ actorId: user.id, action: "session.revoke", entity: "session", entityId: id });
  revalidatePath("/settings");
  return { ok: "Signed out that device" };
}

// Memory: only what the user adds or approves is ever used by the assistant.
export async function addMemoryAction(content: string): Promise<Res> {
  const { user } = await requireAuth();
  const c = String(content ?? "").trim();
  if (c.length < 3 || c.length > 1000) return { error: "Write between 3 and 1000 characters." };
  const m = await db.memory.create({ data: { userId: user.id, content: c, source: "user", approvedAt: new Date() } });
  await audit({ actorId: user.id, action: "memory.create", entity: "memory", entityId: m.id });
  revalidatePath("/settings");
  return { ok: "Saved" };
}
export async function deleteMemoryAction(id: string): Promise<Res> {
  const { user } = await requireAuth();
  await db.memory.deleteMany({ where: { id, userId: user.id } });
  await audit({ actorId: user.id, action: "memory.delete", entity: "memory", entityId: id });
  revalidatePath("/settings");
  return { ok: "Forgotten" };
}

export async function setRetentionAction(days: number): Promise<Res> {
  const { user } = await requireAuth({ permission: "settings.company" });
  if (![30, 90, 180, 365].includes(days)) return { error: "Pick a period from the list." };
  // Company-wide settings have no user, and Prisma can't upsert on a null key part, so find then write.
  const s = await db.setting.findFirst({ where: { userId: null, key: "retention.days" } });
  if (s) await db.setting.update({ where: { id: s.id }, data: { value: days } });
  else await db.setting.create({ data: { key: "retention.days", value: days } });
  await audit({ actorId: user.id, action: "settings.retention", entity: "setting", meta: { days } });
  revalidatePath("/settings");
  return { ok: `Logs and read notifications older than ${days} days will be removed nightly.` };
}

// Delete everything the signed-in user owns. The owner account itself is kept so the company isn't locked out.
export async function deleteMyDataAction(confirm: string): Promise<Res> {
  const { user } = await requireAuth();
  if (confirm !== "DELETE MY DATA") return { error: 'Type DELETE MY DATA exactly to confirm.' };
  const where = { ownerId: user.id };
  await db.$transaction([
    db.reminder.deleteMany({ where: { userId: user.id } }),
    db.task.deleteMany({ where }),
    db.event.deleteMany({ where }),
    db.contact.deleteMany({ where }),
    db.project.deleteMany({ where }),
    db.conversation.deleteMany({ where: { userId: user.id } }),
    db.memory.deleteMany({ where: { userId: user.id } }),
    db.notification.deleteMany({ where: { userId: user.id } }),
    db.approval.deleteMany({ where: { userId: user.id } }),
  ]);
  await audit({ actorId: user.id, action: "data.delete_own", entity: "user", entityId: user.id });
  revalidatePath("/", "layout");
  return { ok: "Your tasks, calendar, contacts, reminders, conversations, memory and approvals were deleted." };
}

// Team management (owner and admins)
export async function createUserAction(raw: { name: string; email: string; role: Role; password: string }): Promise<Res> {
  const { user } = await requireAuth({ permission: "users.manage" });
  const email = String(raw.email ?? "").trim().toLowerCase(), name = String(raw.name ?? "").trim();
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Add a name and a valid email." };
  if (!["ADMIN", "MANAGER", "ACCOUNTANT", "STAFF", "VIEWER"].includes(raw.role)) return { error: "Pick a role." };
  if (raw.role === "ADMIN" && user.role !== "OWNER") return { error: "Only the owner can create admins." };
  const bad = passwordProblem(raw.password);
  if (bad) return { error: `Temporary password: ${bad}` };
  if (await db.user.findUnique({ where: { email } })) return { error: "Someone already uses that email." };
  const u = await db.user.create({ data: { name, email, role: raw.role, passwordHash: await hashPassword(raw.password) } });
  await audit({ actorId: user.id, action: "user.create", entity: "user", entityId: u.id, meta: { role: u.role } });
  revalidatePath("/settings");
  return { ok: `${name} can now sign in. Share the temporary password privately.` };
}

export async function updateUserAction(id: string, raw: { role?: Role; disabled?: boolean; password?: string }): Promise<Res> {
  const { user } = await requireAuth({ permission: "users.manage" });
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return { error: "That person doesn't exist." };
  if (target.role === "OWNER" || id === user.id) return { error: "The owner account and your own account can't be changed here." };
  if ((raw.role === "ADMIN" || target.role === "ADMIN") && user.role !== "OWNER") return { error: "Only the owner can change admins." };
  const data: Prisma.UserUpdateInput = {};
  if (raw.role) { if (!["ADMIN", "MANAGER", "ACCOUNTANT", "STAFF", "VIEWER"].includes(raw.role)) return { error: "Pick a role." }; data.role = raw.role; }
  if (raw.disabled !== undefined) data.disabledAt = raw.disabled ? new Date() : null;
  if (raw.password) { const bad = passwordProblem(raw.password); if (bad) return { error: bad }; data.passwordHash = await hashPassword(raw.password); data.mfaEnabled = false; data.mfaSecretEnc = null; }
  await db.user.update({ where: { id }, data });
  if (raw.disabled || raw.password) await db.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ actorId: user.id, action: "user.update", entity: "user", entityId: id, meta: { role: raw.role ?? null, disabled: raw.disabled ?? null, passwordReset: !!raw.password } });
  revalidatePath("/settings");
  return { ok: raw.password ? "Password reset. They'll set up two-step sign-in again." : "Saved" };
}
