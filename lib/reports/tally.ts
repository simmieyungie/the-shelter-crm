import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/lib/db";
import { serviceReports, zoneTallies } from "@/lib/db/schema";

/**
 * Spec §5.5: a TALLY report's counts follow the zone tallies until it is submitted.
 * Creates the draft report on the first tally. Reports typed by hand are never touched.
 */
export async function recomputeTallyReport(tx: DbOrTx, serviceEventId: string) {
  const [sum] = await tx
    .select({
      men: sql<number>`coalesce(sum(${zoneTallies.men}),0)::int`,
      women: sql<number>`coalesce(sum(${zoneTallies.women}),0)::int`,
      children: sql<number>`coalesce(sum(${zoneTallies.children}),0)::int`,
      firstTimers: sql<number>`coalesce(sum(${zoneTallies.firstTimers}),0)::int`,
    })
    .from(zoneTallies)
    .where(eq(zoneTallies.serviceEventId, serviceEventId));

  await tx
    .insert(serviceReports)
    .values({ serviceEventId, ...sum, source: "TALLY", status: "DRAFT" })
    .onConflictDoUpdate({
      target: serviceReports.serviceEventId,
      set: { men: sum.men, women: sum.women, children: sum.children, firstTimers: sum.firstTimers, updatedAt: new Date() },
      setWhere: and(eq(serviceReports.source, "TALLY"), eq(serviceReports.status, "DRAFT")),
    });
}
