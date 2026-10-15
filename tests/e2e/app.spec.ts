import { expect, test, type Page } from "@playwright/test";
import { totp } from "../../src/lib/totp";
import { fireDueReminders } from "../../src/lib/services/reminders";

test.describe.configure({ mode: "serial" });

const OWNER = { name: "Rami Alhussein", email: "rami@medora.test", password: "Medora-secure-2026" };
let secret = "";
let page: Page;

// A code from a different 30-second window than the last one used, so each sign-in gets a fresh code.
async function code() { return totp(secret); }

test.beforeAll(async ({ browser }) => { page = await browser.newPage(); });
test.afterAll(async () => { await page.close(); });

test("first run creates the owner and requires two-step sign-in", async () => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await page.getByLabel("Your name").fill(OWNER.name);
  await page.getByLabel("Work email").fill(OWNER.email);
  await page.getByLabel("Password", { exact: true }).fill("onlylettershere");
  await page.getByLabel("Confirm password").fill("onlylettershere");
  await page.getByRole("button", { name: "Create owner account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("at least one number");
  await page.getByLabel("Password", { exact: true }).fill(OWNER.password);
  await page.getByLabel("Confirm password").fill(OWNER.password);
  await page.getByRole("button", { name: "Create owner account" }).click();
  await expect(page).toHaveURL(/\/setup\/mfa$/);
  // The owner can't reach the app before turning on two-step sign-in.
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/setup\/mfa$/);
  await page.getByText("Can’t scan?").click();
  secret = (await page.getByTestId("mfa-secret").textContent())!.trim();
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("isn't right");
  await page.getByLabel("6-digit code").fill(await code());
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening), Rami/ })).toBeVisible();
});

test("tasks: create, drag between columns, and it persists", async () => {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task" }).click();
  await page.getByLabel("Title").fill("Prepare AUBMC tender");
  await page.getByLabel("Priority").selectOption("P1");
  await page.getByRole("button", { name: "Add task" }).click();
  const todo = page.locator('[data-col="TODO"]');
  await expect(todo.getByText("Prepare AUBMC tender")).toBeVisible();
  const handle = todo.getByRole("button", { name: "Drag Prepare AUBMC tender" });
  const target = page.locator('[data-col="DOING"] ul');
  const hb = (await handle.boundingBox())!, tb = (await target.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 20, hb.y + 20, { steps: 5 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 30, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('[data-col="DOING"]').getByText("Prepare AUBMC tender")).toBeVisible();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-col="DOING"]').getByText("Prepare AUBMC tender")).toBeVisible();
  // List view and completing a task.
  await page.getByRole("button", { name: "List" }).click();
  await page.getByLabel("Mark Prepare AUBMC tender done").check();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByLabel("Mark Prepare AUBMC tender done")).toBeChecked();
  await page.getByRole("button", { name: "Board" }).click();
});

test("calendar: add an entry and see it in month and week view", async () => {
  await page.goto("/calendar?new=1");
  await page.getByLabel("Title").fill("Hôtel-Dieu procurement meeting");
  await page.getByLabel("Starts").fill("10:00");
  await page.getByLabel("Ends").fill("11:00");
  await page.getByLabel("Location").fill("Achrafieh");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  await expect(page.getByRole("button", { name: /Hôtel-Dieu procurement meeting/ })).toBeVisible();
  await page.getByRole("link", { name: "Week" }).click();
  await expect(page.getByRole("button", { name: /Hôtel-Dieu procurement meeting/ })).toContainText("10:00–11:00");
  await page.goto("/");
  await expect(page.locator('[data-panel="schedule"]')).toContainText("Hôtel-Dieu procurement meeting");
});

test("contacts: create, validate, search and edit", async () => {
  await page.goto("/contacts");
  await page.getByRole("button", { name: "New contact" }).click();
  await page.getByLabel("Name").fill("Dr. Rania Khoury");
  await page.getByLabel("Company").fill("Hôtel-Dieu de France");
  await page.getByLabel("Email").fill("rania@example.com");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Dr. Rania Khoury" })).toBeVisible();
  await page.getByLabel("Search contacts").fill("hotel");
  await expect(page.getByText("No contacts match.")).toBeVisible();
  await page.getByLabel("Search contacts").fill("Hôtel");
  await page.getByRole("button", { name: "Dr. Rania Khoury" }).click();
  await page.getByLabel("Phone").fill("+961 1 615 300");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Dr. Rania Khoury" }).click();
  await expect(page.getByLabel("Phone")).toHaveValue("+961 1 615 300");
  await expect(page.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+9611615300");
  await page.keyboard.press("Escape");
});

test("reminders: the worker delivers a due reminder to the bell", async () => {
  await page.goto("/reminders");
  await page.getByLabel("Remind me to").fill("Call the Roche representative");
  const today = await page.getByLabel("Date").getAttribute("min");
  await page.getByLabel("Date").fill(today!);
  await page.getByLabel("Time").fill("00:01");
  await page.getByRole("button", { name: "Set reminder" }).click();
  await expect(page.getByRole("status")).toContainText("Reminder set");
  expect(await fireDueReminders()).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Due now" })).toBeVisible();
  await expect(page.getByTestId("unread")).toHaveText("1");
  await page.getByTestId("bell").click();
  await expect(page.getByRole("region", { name: "Notifications" })).toContainText("Call the Roche representative");
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(page.getByTestId("unread")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.click(5, 300);
  await page.locator("li", { hasText: "Call the Roche representative" }).getByRole("button", { name: "Mark done" }).click();
  await expect(page.getByRole("heading", { name: "Due now" })).toHaveCount(0);
});

test("assistant: acts through tools, and memory waits in the Approval Center", async () => {
  await page.goto("/chat");
  await page.getByLabel("Message").fill('Add a task "Call the lab supplier"');
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("chat-log")).toContainText('Done. I added "Call the lab supplier"');
  await expect(page.getByTestId("chat-log").getByText("Created Call the lab supplier")).toBeVisible();
  await page.getByLabel("Message").fill('Remember "Draft replies to Hôtel-Dieu in French"');
  await page.getByLabel("Message").press("Enter");
  await expect(page.getByTestId("chat-log")).toContainText("Approval Center");
  await page.getByLabel("Message").fill("Send an email to the supplier now");
  await page.getByLabel("Message").press("Enter");
  await expect(page.getByTestId("chat-log")).toContainText("can't send messages");
  await page.reload();
  await expect(page.getByTestId("chat-log")).toContainText("Call the lab supplier");

  await page.goto("/approvals");
  const card = page.locator("article", { hasText: "Remember" });
  await expect(card).toContainText("Prepared by the assistant");
  await card.getByRole("button", { name: "Edit" }).click();
  await card.getByLabel("Remember").fill("Draft replies to Hôtel-Dieu in French, formal tone");
  await card.getByRole("button", { name: "Approve with changes" }).click();
  await expect(page.getByRole("region", { name: "Decided in the last 24 hours" })).toContainText("Saved to the assistant's memory");
  await page.goto("/settings#memory");
  await expect(page.locator("#memory")).toContainText("formal tone");
  await page.goto("/tasks");
  await expect(page.getByText("Call the lab supplier")).toBeVisible();
});

test("search palette, dashboard customisation and theme", async () => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("rania");
  await expect(page.getByRole("option", { name: /Dr. Rania Khoury/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/contacts\?open=/);
  await expect(page.getByRole("dialog", { name: "Dr. Rania Khoury" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/");
  await page.getByRole("button", { name: "Customize dashboard" }).click();
  await page.getByRole("checkbox", { name: "Tasks due in the next 7 days" }).uncheck();
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.locator('[data-panel="week"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Customize dashboard" }).click();
  await page.getByRole("checkbox", { name: "Tasks due in the next 7 days" }).check();
  await expect(page.locator('[data-panel="week"]')).toBeVisible();
  await page.getByRole("button", { name: "Show table" }).click();
  await expect(page.locator('[data-panel="week"] table')).toBeVisible();

  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("theme-toggle").click();
});

test("export, sign out, and sign back in with a code", async () => {
  const res = await page.request.get("/api/export");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.tasks.length).toBeGreaterThanOrEqual(2);
  expect(JSON.stringify(data)).not.toContain("passwordHash");
  const bad = await page.request.post("/api/notifications", { data: {}, headers: { origin: "https://evil.example" } });
  expect(bad.status()).toBe(403);

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/tasks");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toContainText("don't match");
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login\/verify$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login\/verify$/);
  await page.getByLabel("6-digit code").fill(await code());
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: /Rami/ })).toBeVisible();
});

test("phone layout: menu drawer, no sideways scrolling, board stacks", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await page.context().storageState() });
  const m = await ctx.newPage();
  for (const path of ["/", "/tasks", "/calendar", "/contacts", "/reminders", "/approvals", "/settings", "/chat"]) {
    await m.goto(path);
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `sideways scroll on ${path}`).toBeLessThanOrEqual(1);
  }
  await m.goto("/");
  await m.getByRole("button", { name: "Open menu" }).click();
  await m.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Tasks" }).click();
  await expect(m).toHaveURL(/\/tasks$/);
  await expect(m.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
  await ctx.close();
});

test("screenshots for review", async ({ browser }) => {
  const state = await page.context().storageState();
  for (const [name, vp, theme] of [["desktop-light", { width: 1366, height: 860 }, "light"], ["desktop-dark", { width: 1366, height: 860 }, "dark"], ["phone", { width: 390, height: 844 }, "light"]] as const) {
    const ctx = await browser.newContext({ viewport: vp, storageState: state });
    await ctx.addInitScript((t) => localStorage.setItem("medora-theme", t), theme);
    const p = await ctx.newPage();
    for (const path of ["/", "/tasks", "/calendar?view=week", "/approvals?tab=all"]) {
      await p.goto(path);
      await p.waitForLoadState("networkidle");
      await p.screenshot({ path: `test-results/shots/${name}${path.replace(/[/?=&]+/g, "-")}.png`, fullPage: name === "phone" });
    }
    await ctx.close();
  }
});
