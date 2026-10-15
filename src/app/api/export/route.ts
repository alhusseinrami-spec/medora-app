import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";

// Everything the signed-in user owns, as one JSON file. Secrets (password hash, MFA secret, tokens) are never included.
export async function GET() {
  const auth = await apiAuth();
  if (!auth) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const id = auth.user.id;
  const [tasks, events, contacts, reminders, approvals, conversations, memories, notifications] = await Promise.all([
    db.task.findMany({ where: { OR: [{ ownerId: id }, { assigneeId: id }] } }),
    db.event.findMany({ where: { ownerId: id } }),
    db.contact.findMany({ where: { ownerId: id } }),
    db.reminder.findMany({ where: { userId: id } }),
    db.approval.findMany({ where: { userId: id } }),
    db.conversation.findMany({ where: { userId: id }, include: { messages: { orderBy: { createdAt: "asc" } } } }),
    db.memory.findMany({ where: { userId: id } }),
    db.notification.findMany({ where: { userId: id } }),
  ]);
  const { user } = auth;
  const data = {
    exportedAt: new Date().toISOString(),
    user: { id: user.id, name: user.name, email: user.email, role: user.role, timeZone: user.timeZone, createdAt: user.createdAt },
    tasks, events, contacts, reminders, approvals, conversations, memories, notifications,
  };
  await audit({ actorId: id, action: "data.export", entity: "user", entityId: id });
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="medora-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" },
  });
}
