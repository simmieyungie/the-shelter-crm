import { config } from "dotenv";
import path from "node:path";
import { defineConfig } from "vitest/config";

config({ path: ".env.local" });
const testDb = process.env.TEST_DATABASE_URL ?? "postgres://crm:crm@localhost:5433/crm_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
      "server-only": path.resolve(import.meta.dirname, "tests/support/empty.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    env: { DATABASE_URL: testDb, TEST_DATABASE_URL: testDb },
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
  },
});
