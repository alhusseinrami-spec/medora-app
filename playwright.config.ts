import { defineConfig, devices } from "@playwright/test";

// Browser tests run against `next dev` (the scripted AI provider is refused in production builds)
// on a separate database that is emptied before each run.
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgresql://medora:medora@localhost:5432/medora_e2e";
process.env.DATABASE_URL = E2E_DB;
process.env.APP_ENCRYPTION_KEY = "e2e-only-key-0123456789abcdef0123456789";
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 860 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: { DATABASE_URL: E2E_DB, APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY, AI_PROVIDER: "mock" },
  },
});
