import type { Prisma, User } from "@prisma/client";
import { db } from "../db";
import { audit } from "../audit";
import { can } from "../rbac";
import { ContactInput, ContactPatch } from "../validation";
import { UserError } from "./errors";

type Actor = Pick<User, "id" | "role">;

// Contacts are company-wide for roles that see the team; staff see the ones they own.
const scope = (a: Actor): Prisma.ContactWhereInput => (can(a.role, "team.view") ? {} : { ownerId: a.id });

export function listContacts(a: Actor, q?: string, take = 500) {
  const s = q?.trim();
  return db.contact.findMany({
    where: { AND: [scope(a)], ...(s ? { OR: ["name", "company", "email", "phone", "notes"].map((f) => ({ [f]: { contains: s, mode: "insensitive" } })) } : {}) },
    orderBy: { name: "asc" }, take,
  });
}

export async function getContact(a: Actor, id: string) {
  const c = await db.contact.findFirst({ where: { id, ...scope(a) }, include: { tasks: { where: { status: { not: "DONE" } }, take: 10 }, events: { orderBy: { start: "desc" }, take: 10 } } });
  if (!c) throw new UserError("That contact doesn't exist or isn't visible to you.", "not_found");
  return c;
}

export async function createContact(a: Actor, raw: unknown, by: "user" | "ai" = "user") {
  const p = ContactInput.safeParse(raw);
  if (!p.success) throw new UserError(p.error.issues[0]?.message ?? "Invalid contact.");
  const c = await db.contact.create({ data: { ...p.data, ownerId: a.id } });
  await audit({ actorId: a.id, actorKind: by, action: "contact.create", entity: "contact", entityId: c.id, meta: { name: c.name } });
  return c;
}

export async function updateContact(a: Actor, id: string, raw: unknown, by: "user" | "ai" = "user") {
  await getContact(a, id);
  const p = ContactPatch.safeParse(raw);
  if (!p.success) throw new UserError(p.error.issues[0]?.message ?? "Invalid contact.");
  const c = await db.contact.update({ where: { id }, data: p.data });
  await audit({ actorId: a.id, actorKind: by, action: "contact.update", entity: "contact", entityId: id, meta: { changed: Object.keys(p.data) } });
  return c;
}

export async function deleteContact(a: Actor, id: string) {
  const c = await getContact(a, id);
  if (c.ownerId !== a.id && !can(a.role, "data.delete")) throw new UserError("Only the owner of this contact can delete it.", "forbidden");
  await db.contact.delete({ where: { id } });
  await audit({ actorId: a.id, action: "contact.delete", entity: "contact", entityId: id, meta: { name: c.name } });
}
