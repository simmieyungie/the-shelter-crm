import { execSync } from "node:child_process";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({ path: ".env.local" });

/** Fresh, seeded database for every end-to-end run. */
export default async function globalSetup() {
  const url = new URL(process.env.E2E_DATABASE_URL ?? "postgres://crm:crm@localhost:5433/crm_e2e");
  const name = url.pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => undefined });
  await admin.unsafe(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${name}' AND pid<>pg_backend_pid()`);
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  await admin.end();

  const client = postgres(url.toString(), { max: 1, onnotice: () => undefined });
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  await client.end();

  execSync("pnpm exec tsx --conditions=react-server scripts/seed.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url.toString() },
  });
}
