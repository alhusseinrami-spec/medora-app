import { execSync } from "node:child_process";

export default async function globalSetup() {
  const url = process.env.DATABASE_URL!;
  if (!url.includes("e2e")) throw new Error("Refusing to reset a non-e2e database.");
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", { env: { ...process.env, DATABASE_URL: url, PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: "yes" }, stdio: "inherit" });
  // The dev server compiles each route on first visit and may reload the page while it does;
  // visiting every route once first keeps the tests from racing that.
  for (const p of ["/setup", "/login", "/setup/mfa", "/login/verify", "/", "/tasks", "/calendar", "/contacts", "/reminders", "/approvals", "/chat", "/settings", "/api/search?q=ab", "/api/notifications", "/api/chat"]) {
    await fetch(`http://localhost:3100${p}`, { redirect: "manual" }).catch(() => {});
  }
}
