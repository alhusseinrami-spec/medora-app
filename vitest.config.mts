import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)) } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/services/**/*.test.ts"],
    environment: "node",
    fileParallelism: false, // service tests share one database
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://medora:medora@localhost:5432/medora_test",
      DATABASE_URL_UNPOOLED: process.env.TEST_DATABASE_URL ?? "postgresql://medora:medora@localhost:5432/medora_test",
      APP_ENCRYPTION_KEY: "test-only-key-0123456789abcdef0123456789",
      AI_PROVIDER: "mock",
    },
  },
});
