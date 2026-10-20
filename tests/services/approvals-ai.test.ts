import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTask } from "@/lib/services/tasks";
import { approveApproval, approvalCounts, proposeApproval, rejectApproval } from "@/lib/services/approvals";
import { runChat } from "@/lib/ai/chat";
import { pruneByRetention } from "@/lib/jobs";
import { makeUser, reset } from "./helpers";

beforeEach(reset);

describe("approval center", () => {
  it("only accepts kinds it can carry out", async () => {
    const u = await makeUser("OWNER");
    await expect(proposeApproval(u, { kind: "email.send", title: "Send", payload: {} })).rejects.toThrow(/not something/);
    await expect(proposeApproval(u, { kind: "task.delete", title: "Delete", payload: {} })).rejects.toThrow();
  });

  it("runs nothing until approved, then executes with edits and records the result", async () => {
    const u = await makeUser("OWNER");
    const ap = await proposeApproval(u, { kind: "task.create", title: "Add follow-up", payload: { title: "Follow up with AUBMC" } });
    expect(await db.task.count()).toBe(0);
    expect((await approvalCounts(u.id)).DRAFT).toBe(1);
    const done = await approveApproval(u, ap.id, { title: "Follow up with AUBMC procurement", priority: "P1" });
    expect(done.stage).toBe("COMPLETED");
    expect(await db.task.findFirst()).toMatchObject({ title: "Follow up with AUBMC procurement", priority: "P1" });
    await expect(approveApproval(u, ap.id)).rejects.toThrow(/already been decided/);
  });

  it("rejects without acting, and reports a failed execution honestly", async () => {
    const u = await makeUser("OWNER");
    const t = await createTask(u, { title: "Keep me" });
    const a1 = await proposeApproval(u, { kind: "task.delete", title: "Delete task", payload: { taskId: t.id } });
    expect((await rejectApproval(u, a1.id)).stage).toBe("REJECTED");
    expect(await db.task.count()).toBe(1);
    const a2 = await proposeApproval(u, { kind: "task.delete", title: "Delete missing", payload: { taskId: "nope" } });
    await expect(approveApproval(u, a2.id)).rejects.toThrow(/couldn't be carried out/);
    expect(await db.approval.findUnique({ where: { id: a2.id } })).toMatchObject({ stage: "APPROVED", result: expect.stringMatching(/^Failed/) });
  });

  it("stops staff from deciding someone else's approval", async () => {
    const owner = await makeUser("OWNER"), staff = await makeUser("STAFF");
    const ap = await proposeApproval(owner, { kind: "memory.save", title: "Remember", payload: { content: "Prefers French" } });
    await expect(approveApproval(staff, ap.id)).rejects.toThrow(/can't decide/);
  });
});

describe("assistant (scripted test provider)", () => {
  it("creates tasks and reminders through tools and persists the conversation", async () => {
    const u = await makeUser("OWNER");
    const r1 = await runChat(u, null, 'Add a task "Call the lab supplier"');
    expect(r1.events[0]).toMatchObject({ tool: "create_task", ok: true });
    expect(await db.task.findFirst()).toMatchObject({ title: "Call the lab supplier", source: "assistant" });
    const r2 = await runChat(u, r1.conversationId, 'Remind me "review the tender"');
    expect(r2.conversationId).toBe(r1.conversationId);
    expect(await db.reminder.count()).toBe(1);
    expect(await db.message.count({ where: { conversationId: r1.conversationId } })).toBe(8);
    expect(await db.executionLog.count({ where: { kind: "ai_tool" } })).toBe(2);
    expect(await db.auditLog.count({ where: { actorKind: "ai" } })).toBe(2);
  });

  it("routes memory through the Approval Center and refuses to send messages", async () => {
    const u = await makeUser("OWNER");
    const r = await runChat(u, null, 'Remember "I prefer replies in French"');
    expect(r.events[0]).toMatchObject({ tool: "propose_approval", ok: true });
    expect(await db.memory.count()).toBe(0);
    expect(await db.approval.count({ where: { stage: "DRAFT", kind: "memory.save" } })).toBe(1);
    const s = await runChat(u, null, "Send an email to the supplier");
    expect(s.events).toHaveLength(0);
    expect(s.reply).toMatch(/can't send/);
  });
});

describe("retention", () => {
  it("removes old logs and read notifications but keeps recent and unread ones", async () => {
    const u = await makeUser();
    const old = new Date(Date.now() - 200 * 864e5);
    await db.executionLog.createMany({ data: [{ kind: "ai", name: "x", status: "ok", at: old }, { kind: "ai", name: "y", status: "ok" }] });
    await db.notification.createMany({ data: [{ userId: u.id, kind: "k", title: "old read", readAt: old, createdAt: old }, { userId: u.id, kind: "k", title: "old unread", createdAt: old }] });
    const removed = await pruneByRetention();
    expect(removed).toMatchObject({ execs: 1, notifications: 1 });
    expect(await db.notification.count()).toBe(1);
  });
});
