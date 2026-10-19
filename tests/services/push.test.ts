import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: {
    sendNotification: (...a: unknown[]) => sendNotification(...a),
    generateVAPIDKeys: () => ({ publicKey: "generated-public-key", privateKey: "generated-private-key" }),
  },
}));

import { db } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { runJobs } from "@/lib/jobs";
import { isPushEndpoint } from "@/lib/push";
import { approveApproval, proposeApproval } from "@/lib/services/approvals";
import { notify } from "@/lib/services/notifications";
import { makeUser, reset } from "./helpers";

const ENDPOINTS = ["https://fcm.googleapis.com/fcm/send/a", "https://web.push.apple.com/b", "https://updates.push.services.mozilla.com/wpush/v2/c"];
const addSubs = (userId: string, endpoints = ENDPOINTS) =>
  db.pushSubscription.createMany({ data: endpoints.map((endpoint, i) => ({ userId, endpoint, p256dh: `p256-${i}`, auth: `auth-${i}` })) });
const pushError = (statusCode: number) => Object.assign(new Error(`Received unexpected response code ${statusCode}`), { statusCode });

beforeEach(async () => {
  await reset();
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  process.env.VAPID_PUBLIC_KEY = "env-public-key";
  process.env.VAPID_PRIVATE_KEY = "env-private-key";
});

describe("notify push fan-out", () => {
  it("writes the in-app notification and pushes title, body and link to every subscription", async () => {
    const u = await makeUser("OWNER");
    const other = await makeUser("STAFF");
    await addSubs(u.id);
    await addSubs(other.id, ["https://fcm.googleapis.com/fcm/send/other"]);
    const n = await notify(u.id, { kind: "reminder", title: "Call Roche", body: "Reminder set for 09:00", link: "/reminders" });

    expect(await db.notification.count({ where: { userId: u.id } })).toBe(1);
    expect(sendNotification).toHaveBeenCalledTimes(3);
    const endpoints = sendNotification.mock.calls.map((c) => c[0].endpoint).sort();
    expect(endpoints).toEqual([...ENDPOINTS].sort());
    const [sub, payload, opts] = sendNotification.mock.calls.find((c) => c[0].endpoint === ENDPOINTS[0])!;
    expect(sub.keys).toEqual({ p256dh: "p256-0", auth: "auth-0" });
    expect(JSON.parse(payload)).toEqual({ title: "Call Roche", body: "Reminder set for 09:00", link: "/reminders", tag: n.id });
    expect(opts.vapidDetails).toMatchObject({ publicKey: "env-public-key", privateKey: "env-private-key" });
    expect(opts.vapidDetails.subject).toMatch(/^(https:|mailto:)/);
  });

  it("never sends an outside link to the phone", async () => {
    const u = await makeUser();
    await addSubs(u.id, [ENDPOINTS[0]]);
    await notify(u.id, { kind: "x", title: "Hi", link: "https://evil.example/" });
    await notify(u.id, { kind: "x", title: "Hi", link: "//evil.example/" });
    expect(sendNotification.mock.calls.map((c) => JSON.parse(c[1]).link)).toEqual(["/", "/"]);
  });

  it("does nothing extra when the user has no subscriptions", async () => {
    const u = await makeUser();
    await notify(u.id, { kind: "x", title: "Hi" });
    expect(sendNotification).not.toHaveBeenCalled();
    expect(await db.notification.count()).toBe(1);
  });
});

describe("expired subscriptions", () => {
  it("deletes subscriptions that return 404 or 410 and keeps ones with other errors", async () => {
    const u = await makeUser();
    await addSubs(u.id);
    sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === ENDPOINTS[0]) throw pushError(410);
      if (sub.endpoint === ENDPOINTS[1]) throw pushError(404);
      throw pushError(500);
    });
    await expect(notify(u.id, { kind: "reminder", title: "Call Roche" })).resolves.toMatchObject({ title: "Call Roche" });
    const left = await db.pushSubscription.findMany({ where: { userId: u.id } });
    expect(left.map((s) => s.endpoint)).toEqual([ENDPOINTS[2]]);
    expect(await db.notification.count({ where: { userId: u.id } })).toBe(1);
  });

  it("a push failure never breaks notify", async () => {
    const u = await makeUser();
    await addSubs(u.id, [ENDPOINTS[0]]);
    sendNotification.mockImplementation(() => { throw new Error("network down"); });
    await expect(notify(u.id, { kind: "x", title: "Still saved" })).resolves.toMatchObject({ title: "Still saved" });
    expect(await db.pushSubscription.count()).toBe(1);
  });
});

describe("VAPID keys", () => {
  it("are generated once, stored with the private key encrypted, and reused", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    vi.resetModules();
    const push = await import("@/lib/push");
    const [a, b] = await Promise.all([push.getVapidKeys(), push.getVapidKeys()]);
    expect(a).toEqual({ publicKey: "generated-public-key", privateKey: "generated-private-key" });
    expect(b).toEqual(a);
    const rows = await db.setting.findMany({ where: { userId: null, key: "push.vapid" } });
    expect(rows).toHaveLength(1);
    const v = rows[0].value as { publicKey: string; privateKeyEnc: string };
    expect(JSON.stringify(v)).not.toContain("generated-private-key");
    expect(decrypt(v.privateKeyEnc)).toBe("generated-private-key");
    // A fresh server instance reads the stored pair instead of making a new one.
    vi.resetModules();
    const again = await import("@/lib/push");
    expect(await again.getVapidKeys()).toEqual(a);
    expect(await db.setting.count({ where: { key: "push.vapid" } })).toBe(1);
  });

  it("prefers VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when set", async () => {
    vi.resetModules();
    const push = await import("@/lib/push");
    expect(await push.getVapidKeys()).toEqual({ publicKey: "env-public-key", privateKey: "env-private-key" });
    expect(await db.setting.count({ where: { key: "push.vapid" } })).toBe(0);
  });
});

describe("subscription endpoints", () => {
  it("accepts real push services only", () => {
    for (const e of [...ENDPOINTS, "https://wns2-par02p.notify.windows.com/w/?token=x"]) expect(isPushEndpoint(e)).toBe(true);
    for (const e of ["http://fcm.googleapis.com/x", "https://evil.example/push", "https://googleapis.com.evil.example/", "not a url", "https://169.254.169.254/"]) expect(isPushEndpoint(e)).toBe(false);
  });
});

describe("reminders reach the phone", () => {
  it("a reminder Nour queued fires as a push once Rami approves it", async () => {
    const u = await makeUser("OWNER", "Rami");
    await addSubs(u.id, [ENDPOINTS[1]]);
    const ap = await proposeApproval(u, { kind: "reminder.create", title: "Reminder: Check the tender deadline", payload: { title: "Check the tender deadline", date: "2026-01-05", time: "09:00" }, requestedBy: "nour" });
    expect(await db.reminder.count()).toBe(0);
    // Rami's phone hears about the request itself straight away.
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toMatchObject({ title: "Waiting for your approval: Reminder: Check the tender deadline", link: "/approvals" });
    sendNotification.mockClear();
    await approveApproval(u, ap.id);
    expect(await db.reminder.findFirst()).toMatchObject({ title: "Check the tender deadline", status: "PENDING", userId: u.id });

    expect(await runJobs()).toMatchObject({ fired: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sendNotification.mock.calls[0][1])).toMatchObject({ title: "Check the tender deadline", link: "/reminders" });
    // Firing is exactly once, however often the tick runs.
    expect(await runJobs()).toMatchObject({ fired: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });
});
