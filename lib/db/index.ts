import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };

function makeClient() {
  // The driver connects lazily, so a missing URL only fails on the first query (not during `next build`).
  const url = process.env.DATABASE_URL ?? "postgres://unset:unset@127.0.0.1:1/DATABASE_URL_is_not_set";
  return postgres(url, { max: 10 });
}

const client = globalForDb.pgClient ?? makeClient();
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;
export { schema };

/** Closes the connection pool (scripts and tests). */
export async function closeDb() {
  await client.end({ timeout: 5 });
  globalForDb.pgClient = undefined;
}
