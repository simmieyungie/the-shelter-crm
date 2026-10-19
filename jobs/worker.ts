/* Background jobs (pg-boss). Run with `pnpm jobs` alongside the web server. */
import { config } from "dotenv";

config({ path: ".env.local" });

const FOLLOWUP = "followup-daily";
const SENDER = "send-messages";

async function main() {
  const { PgBoss } = await import("pg-boss");
  const { db } = await import("../lib/db");
  const { runFollowUpPipeline, sendDueMessages } = await import("../lib/followup-jobs/pipeline");

  const boss = new PgBoss(process.env.DATABASE_URL!);
  boss.on("error", (err) => console.error("[jobs]", err));
  await boss.start();
  await boss.createQueue(FOLLOWUP).catch(() => undefined);
  await boss.createQueue(SENDER).catch(() => undefined);

  // Daily at 06:00 Lagos time; if the server was down at 06:00, run once when it's back.
  await boss.schedule(FOLLOWUP, "0 6 * * *", null, { tz: "Africa/Lagos", missed: "once" });
  await boss.schedule(SENDER, "* * * * *", null, { tz: "Africa/Lagos" });

  await boss.work(FOLLOWUP, async () => {
    const result = await db.transaction((tx) => runFollowUpPipeline(tx));
    console.info("[jobs] follow-up pipeline", result);
  });
  await boss.work(SENDER, async () => {
    const n = await db.transaction((tx) => sendDueMessages(tx));
    if (n) console.info(`[jobs] stub sender sent ${n} message(s)`);
  });

  console.info("[jobs] worker started");
  const stop = async () => {
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
