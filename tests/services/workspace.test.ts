import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createTask, listTasks, moveTask, updateTask, deleteTask } from "@/lib/services/tasks";
import { createEvent, listEvents, overlaps } from "@/lib/services/events";
import { createContact, deleteContact, listContacts, updateContact } from "@/lib/services/contacts";
import { createReminder, fireDueReminders, snoozeReminder } from "@/lib/services/reminders";
import { search } from "@/lib/services/search";
import { makeUser, reset } from "./helpers";

beforeEach(reset);

describe("tasks", () => {
  it("creates, updates without resetting fields, and keeps an audit trail", async () => {
    const u = await makeUser();
    const t = await createTask(u, { title: "Prepare tender file", priority: "P1", status: "DOING", due: "2026-10-20" });
    const after = await updateTask(u, t.id, { title: "Prepare AUBMC tender file" });
    expect(after).toMatchObject({ title: "Prepare AUBMC tender file", priority: "P1", status: "DOING" });
    expect(after.due?.toISOString()).toBe("2026-10-20T09:00:00.000Z"); // noon in Beirut
    expect(await db.auditLog.count({ where: { entityId: t.id } })).toBe(2);
  });

  it("orders drag-and-drop moves between neighbours", async () => {
    const u = await makeUser();
    const a = await createTask(u, { title: "A" }), b = await createTask(u, { title: "B" }), c = await createTask(u, { title: "C" });
    await moveTask(u, c.id, "TODO", a.id); // C before A
    await moveTask(u, a.id, "DOING", null);
    const todo = (await listTasks(u, { status: ["TODO"] })).map((t) => t.title);
    expect(todo).toEqual(["C", "B"]);
    expect((await listTasks(u, { status: ["DOING"] })).map((t) => t.title)).toEqual(["A"]);
    void b;
  });

  it("keeps staff to their own tasks and stops them assigning others", async () => {
    const owner = await makeUser("OWNER"), staff = await makeUser("STAFF"), other = await makeUser("STAFF");
    const t = await createTask(owner, { title: "Board pack" });
    expect(await listTasks(staff)).toHaveLength(0);
    await expect(updateTask(staff, t.id, { title: "x" })).rejects.toThrow(/isn't yours/);
    await expect(createTask(staff, { title: "y", assigneeId: other.id })).rejects.toThrow(/can't assign/);
    const assigned = await createTask(owner, { title: "Call supplier", assigneeId: staff.id });
    expect((await listTasks(staff)).map((x) => x.id)).toEqual([assigned.id]);
    expect(await db.notification.count({ where: { userId: staff.id } })).toBe(1);
    await expect(deleteTask(staff, assigned.id)).rejects.toThrow(/owner/);
  });
});

describe("calendar", () => {
  it("stores Beirut times as UTC and finds overlaps", async () => {
    const u = await makeUser();
    const a = await createEvent(u, { title: "Hospital visit", date: "2026-10-16", start: "10:00", end: "11:00" });
    await createEvent(u, { title: "Supplier call", date: "2026-10-16", start: "10:30", end: "11:00" });
    expect(a.start.toISOString()).toBe("2026-10-16T07:00:00.000Z");
    const evs = await listEvents(u, new Date("2026-10-15T21:00:00Z"), new Date("2026-10-16T21:00:00Z"));
    expect(evs).toHaveLength(2);
    expect(overlaps(evs)).toHaveLength(1);
    await expect(createEvent(u, { title: "Bad", date: "2026-10-16", start: "12:00", end: "11:00" })).rejects.toThrow(/End must be after start/);
  });
});

describe("contacts", () => {
  it("searches, updates in part and protects others' contacts", async () => {
    const owner = await makeUser("OWNER"), staff = await makeUser("STAFF");
    const c = await createContact(owner, { name: "Dr. Rania Khoury", company: "Hôtel-Dieu de France", category: "CUSTOMER", email: "rania@example.com" });
    await updateContact(owner, c.id, { phone: "+961 1 615300" });
    expect(await db.contact.findUnique({ where: { id: c.id } })).toMatchObject({ company: "Hôtel-Dieu de France", category: "CUSTOMER", phone: "+961 1 615300" });
    expect((await listContacts(owner, "hôtel")).length).toBe(1);
    expect(await listContacts(staff)).toHaveLength(0);
    await expect(deleteContact(staff, c.id)).rejects.toThrow();
  });
});

describe("reminders", () => {
  it("fires each due reminder exactly once, even if two workers race", async () => {
    const u = await makeUser();
    const r = await createReminder(u, { title: "Call Roche rep", date: "2026-01-01", time: "09:00" });
    const [x, y] = await Promise.all([fireDueReminders(), fireDueReminders()]);
    expect(x + y).toBe(1);
    expect(await db.notification.count({ where: { userId: u.id, kind: "reminder" } })).toBe(1);
    await snoozeReminder(u, r.id, 10);
    expect(await fireDueReminders()).toBe(0);
    expect(await fireDueReminders(new Date(Date.now() + 11 * 60_000))).toBe(1);
  });
});

describe("search", () => {
  it("finds across tasks, contacts, events and reminders, within the user's scope", async () => {
    const u = await makeUser(), other = await makeUser();
    await createTask(u, { title: "Roche invoice follow-up" });
    await createContact(u, { name: "Roche Lebanon", category: "SUPPLIER" });
    await createEvent(u, { title: "Roche quarterly review", date: "2026-10-20", start: "09:00", end: "10:00" });
    await createReminder(u, { title: "Roche samples", date: "2026-10-21", time: "09:00" });
    await createTask(other, { title: "Roche private" });
    const hits = await search(u, "roche");
    expect(hits.map((h) => h.kind).sort()).toEqual(["contact", "event", "reminder", "task"]);
    expect(await search(u, "r")).toEqual([]);
    // The text filter must never widen what a person can see.
    expect((await listTasks(u, { q: "roche" })).map((t) => t.title)).toEqual(["Roche invoice follow-up"]);
    expect(await listContacts(other, "roche")).toHaveLength(0);
  });
});
