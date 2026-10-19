import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL!;
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database.");
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await sql.end();
  console.log("Database reset:", url.replace(/:[^:@/]+@/, ":***@"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
