/* Development seed (spec §9). Run with `pnpm db:seed` on an empty, migrated database. */
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const { seed } = await import("../lib/db/seed-data");
  const { db } = await import("../lib/db");
  const summary = await seed(db);
  console.log("Seeded:", summary);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
