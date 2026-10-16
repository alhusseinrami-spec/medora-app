import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { runJobs } from "@/lib/jobs";
import { approveApproval } from "@/lib/services/approvals";
import { GET as cronTick } from "@/app/api/cron/tick/route";
import { GET as briefing } from "@/app/api/nour/briefing/route";
import { GET as lookup } from "@/app/api/nour/lookup/route";
import { POST as request } from "@/app/api/nour/request/route";
import { makeUser, reset } from "./helpers";

const KEY = "nour-test-key-0123456789abcdef0123456789";
const CRON = "cron-test-secret-0123456789abcdef";
const nour = (path: string, init: RequestInit = {}, key = KEY) =>
  new Request(`http://app.test/api/nour/${path}`, { ...init, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...(init.headers ?? {}) } });

beforeEach(async () => {
  await reset();
  process.env.NOUR_API_KEY = KEY;
  process.env.CRON_SECRET = CRON;
});

describe("scheduled jobs", () => {
  it("fires due reminders, records a heartbeat and prunes at most once a day", async () => {
    const u = await makeUser("OWNER");
    await db.reminder.create({ data: { userId: u.id, title: "Call Roche", dueAt: new Date(Date.now() - 60_000) } });
    expect(await runJobs()).toMatchObject({ fired: 1, pruned: true });
    expect(await runJobs()).toMatchObject({ fired: 0, pruned: false });
    expect(await db.notification.count({ where: { userId: u.id, kind: "reminder" } })).toBe(1);
    expect(await db.setting.findFirst({ where: { key: "worker.heartbeat" } })).not.toBeNull();
  });

  it("the cron route refuses calls without the secret", async () => {
    expect((await cronTick(new Request("http://app.test/api/cron/tick"))).status).toBe(401);
    expect((await cronTick(new Request("http://app.test/api/cron/tick", { headers: { authorization: "Bearer wrong-secret-0123456789" } }))).status).toBe(401);
    const ok = await cronTick(new Request("http://app.test/api/cron/tick", { headers: { authorization: `Bearer ${CRON}` } }));
    expect(ok.status).toBe(200);
  });
});

describe("Nour API", () => {
  it("rejects a missing or wrong key, and stays off when no key is configured", async () => {
    await makeUser("OWNER");
    expect((await briefing(nour("briefing", {}, "wrong"))).status).toBe(401);
    const viaHeader = (k: string) => new Request("http://app.test/api/nour/briefing", { headers: { "x-nour-key": k } });
    expect((await briefing(viaHeader("wrong"))).status).toBe(401);
    expect((await briefing(viaHeader(process.env.NOUR_API_KEY!))).status).toBe(200);
    delete process.env.NOUR_API_KEY;
    expect((await briefing(nour("briefing"))).status).toBe(503);
  });

  it("reads the owner's day and looks up contacts", async () => {
    const u = await makeUser("OWNER", "Rami");
    await db.task.create({ data: { title: "Send AUBMC quotation", ownerId: u.id, due: new Date(Date.now() - 864e5) } });
    await db.contact.create({ data: { name: "Dr. Hana Khalil", company: "AUBMC", phone: "+961 1 350000", ownerId: u.id } });
    const day = await (await briefing(nour("briefing"))).json();
    expect(day.tasks_due).toEqual([expect.objectContaining({ title: "Send AUBMC quotation", overdue: true })]);
    const found = await (await lookup(nour("lookup?q=aubmc"))).json();
    expect(found.contacts[0]).toMatchObject({ name: "Dr. Hana Khalil", company: "AUBMC" });
    expect(found.other_matches).toEqual([expect.objectContaining({ type: "task", title: "Send AUBMC quotation" })]);
  });

  it("queues tasks and reminders for approval and creates nothing until Rami approves", async () => {
    const u = await makeUser("OWNER");
    const t = await request(nour("request", { method: "POST", body: JSON.stringify({ type: "task", title: "Call Sysmex about the analyzer", due: "2026-10-20" }) }));
    expect(t.status).toBe(201);
    const r = await request(nour("request", { method: "POST", body: JSON.stringify({ type: "reminder", title: "Check the tender deadline", date: "2026-10-19" }) }));
    expect(r.status).toBe(201);
    expect(await db.task.count()).toBe(0);
    expect(await db.reminder.count()).toBe(0);
    const aps = await db.approval.findMany({ orderBy: { createdAt: "asc" } });
    expect(aps.map((a) => [a.kind, a.stage, a.requestedBy])).toEqual([["task.create", "DRAFT", "nour"], ["reminder.create", "DRAFT", "nour"]]);
    await approveApproval(u, aps[1].id);
    expect(await db.reminder.findFirst()).toMatchObject({ title: "Check the tender deadline" });
    const bad = await request(nour("request", { method: "POST", body: JSON.stringify({ type: "email", to: "x@y.z" }) }));
    expect(bad.status).toBe(400);
  });
});
