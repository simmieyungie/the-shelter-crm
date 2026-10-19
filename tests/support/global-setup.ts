import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Creates (or recreates) the test database, applies migrations and loads the seed. */
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://crm:crm@localhost:5433/crm_test");
  const dbName = url.pathname.slice(1);
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";

  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => undefined });
  await admin.unsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid()`,
  );
  await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`);
  await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  const client = postgres(url.toString(), { max: 1, onnotice: () => undefined });
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  await client.end();

  process.env.DATABASE_URL = url.toString();
  const { seed } = await import("../../lib/db/seed-data");
  const { db, closeDb } = await import("../../lib/db");
  await seed(db, { today: process.env.TEST_TODAY });
  await closeDb();
}
