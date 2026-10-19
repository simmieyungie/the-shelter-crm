import "server-only";
import { eq, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { ForbiddenError } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/scope";
import type { Tx } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { reportPerms } from "@/lib/db/queries/reports";
import { UserError } from "@/lib/forms";

export async function lockReport(tx: Tx, access: Access, reportId: string) {
  const [row] = await tx
    .select({ report: s.serviceReports, parishId: s.serviceEvents.parishId, eventId: s.serviceEvents.id })
    .from(s.serviceReports)
    .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.serviceReports.serviceEventId))
    .where(eq(s.serviceReports.id, reportId))
    .for("update", { of: s.serviceReports });
  if (!row) throw new UserError("Report not found.");
  if (!access.parishIds.includes(row.parishId)) throw new ForbiddenError();
  return { ...row, perms: reportPerms(access, row.parishId, row.report.status) };
}

export async function tallySums(tx: Tx, eventId: string) {
  const [sum] = await tx
    .select({
      men: sql<number>`coalesce(sum(${s.zoneTallies.men}),0)::int`,
      women: sql<number>`coalesce(sum(${s.zoneTallies.women}),0)::int`,
      children: sql<number>`coalesce(sum(${s.zoneTallies.children}),0)::int`,
      firstTimers: sql<number>`coalesce(sum(${s.zoneTallies.firstTimers}),0)::int`,
      n: sql<number>`count(*)::int`,
    })
    .from(s.zoneTallies)
    .where(eq(s.zoneTallies.serviceEventId, eventId));
  return sum;
}

export type ReportInput = {
  men: number | null;
  women: number | null;
  children: number | null;
  firstTimers: number | null;
  workersOnDuty: number | null;
  offeringKobo: number | null;
  titheKobo: number | null;
  specialSeedKobo: number | null;
  notes: string | null;
  preacher: string | null;
  theme: string | null;
  typeAttendance: boolean;
};

/** Saves a draft (or reopened) report and optionally submits it. */
export async function saveReportTx(tx: Tx, access: Access, userId: string, reportId: string, input: ReportInput, submit: boolean) {
  const { report: before, eventId, perms } = await lockReport(tx, access, reportId);
  if (!perms.canEdit) {
    throw before.status === "VERIFIED"
      ? new UserError("This report is verified and locked. Reopen it to make changes.")
      : before.status === "SUBMITTED"
        ? new UserError("This report is waiting for the pastor. Ask them to send it back to change it.")
        : new ForbiddenError("You can't edit reports in this parish.");
  }

  let attendance: Pick<ReportInput, "men" | "women" | "children" | "firstTimers">;
  let source = before.source;
  if (before.source === "TALLY" && !input.typeAttendance) {
    const sums = await tallySums(tx, eventId);
    attendance = { men: sums.men, women: sums.women, children: sums.children, firstTimers: sums.firstTimers };
  } else {
    attendance = { men: input.men, women: input.women, children: input.children, firstTimers: input.firstTimers };
    if (before.source === "TALLY") source = "MANUAL";
  }

  const patch = {
    ...attendance,
    source,
    workersOnDuty: input.workersOnDuty,
    offeringKobo: input.offeringKobo,
    titheKobo: input.titheKobo,
    specialSeedKobo: input.specialSeedKobo,
    notes: input.notes,
    draftedBy: before.draftedBy ?? userId,
    ...(submit ? { status: "SUBMITTED" as const, submittedAt: new Date(), submittedBy: userId } : {}),
  };
  const [after] = await tx.update(s.serviceReports).set(patch).where(eq(s.serviceReports.id, reportId)).returning();
  await tx.update(s.serviceEvents).set({ preacher: input.preacher, theme: input.theme }).where(eq(s.serviceEvents.id, eventId));
  await writeAudit(tx, {
    actorUserId: userId,
    entity: "service_report",
    entityId: reportId,
    action: submit ? "submit" : before.status === "REOPENED" ? "edit_after_reopen" : "save",
    before,
    after,
  });
  return after;
}

export async function transitionReportTx(tx: Tx, access: Access, userId: string, reportId: string, to: "verify" | "send_back" | "reopen") {
  const { report: before, perms } = await lockReport(tx, access, reportId);
  let patch: Partial<typeof s.serviceReports.$inferInsert>;
  if (to === "verify") {
    if (!perms.canVerify) throw new ForbiddenError(before.status !== "SUBMITTED" ? "Only submitted reports can be verified." : "Only the parish pastor can verify reports.");
    patch = { status: "VERIFIED", verifiedBy: userId, verifiedAt: new Date() };
  } else if (to === "send_back") {
    if (!perms.canSendBack) throw new ForbiddenError("Only the parish pastor can send a report back.");
    patch = { status: before.verifiedAt ? "REOPENED" : "DRAFT", submittedAt: null, submittedBy: null };
  } else {
    if (!perms.canReopen) throw new ForbiddenError(before.status !== "VERIFIED" ? "Only verified reports can be reopened." : "Only the Head Usher or Parish Pastor can reopen a report.");
    patch = { status: "REOPENED", verifiedBy: null, verifiedAt: null };
  }
  const [after] = await tx.update(s.serviceReports).set(patch).where(eq(s.serviceReports.id, reportId)).returning();
  await writeAudit(tx, { actorUserId: userId, entity: "service_report", entityId: reportId, action: to, before, after });
  return after;
}
