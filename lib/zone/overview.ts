import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { addDays, todayIso, weekday } from "@/lib/dates";
import { db, type DbOrTx } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { lastSundays, periodFor, remittanceMonths, reportDeadline, type PeriodKey } from "./period";

export type ReportState = "Submitted" | "Late" | "Overdue" | "Not due yet" | "No service";
export type FinanceState = "Verified" | "Awaiting pastor" | "Not logged";
export type RemitState = "Cleared" | "Outstanding" | "Not recorded";
export type Overall = "On track" | "Watch" | "Follow up";

export type ParishRow = {
  parishId: string;
  parishName: string;
  areaName: string;
  attendance: number | null;
  report: ReportState;
  finances: FinanceState;
  remittance: RemitState;
  overall: Overall;
};

export function overallFor(r: Pick<ParishRow, "report" | "finances" | "remittance">): Overall {
  const score =
    (r.report === "Late" ? 1 : r.report === "Overdue" ? 2 : 0) +
    (r.finances === "Awaiting pastor" ? 1 : r.finances === "Not logged" && r.report !== "No service" && r.report !== "Not due yet" ? 2 : 0) +
    (r.remittance === "Outstanding" ? 1 : 0);
  return score === 0 ? "On track" : score <= 2 ? "Watch" : "Follow up";
}

const total = sql<number | null>`case when ${s.serviceReports.men} is null or ${s.serviceReports.women} is null or ${s.serviceReports.children} is null then null else ${s.serviceReports.men} + ${s.serviceReports.women} + ${s.serviceReports.children} end`;

/** Verified Sunday reports with a known total, in the parishes and date range. */
async function verifiedSundayTotals(tx: DbOrTx, parishIds: string[], from: string, to: string) {
  if (!parishIds.length) return [];
  return tx
    .select({ parishId: s.serviceEvents.parishId, date: s.serviceEvents.eventDate, total, workers: s.serviceReports.workersOnDuty })
    .from(s.serviceReports)
    .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.serviceReports.serviceEventId))
    .where(
      and(
        inArray(s.serviceEvents.parishId, parishIds),
        eq(s.serviceReports.status, "VERIFIED"),
        gte(s.serviceEvents.eventDate, from),
        lte(s.serviceEvents.eventDate, to),
        sql`extract(dow from ${s.serviceEvents.eventDate}) = 0`,
      ),
    );
}

export async function zoneOverview(parishIds: string[], periodKey: PeriodKey, tx: DbOrTx = db, today = todayIso()) {
  const period = periodFor(periodKey, today);
  const parishes = parishIds.length
    ? await tx
        .select({ id: s.parishes.id, name: s.parishes.name, areaId: s.areas.id, areaName: s.areas.name })
        .from(s.parishes)
        .innerJoin(s.areas, eq(s.areas.id, s.parishes.areaId))
        .where(and(inArray(s.parishes.id, parishIds), eq(s.parishes.isActive, true)))
        .orderBy(asc(s.areas.name), asc(s.parishes.name))
    : [];
  const ids = parishes.map((p) => p.id);
  const sumKnown = (rows: { total: number | null }[]) => rows.reduce((a, r) => a + (r.total ?? 0), 0);

  // 1. Sunday attendance (verified, known totals only) vs the same stretch of the previous period.
  const cur = (await verifiedSundayTotals(tx, ids, period.start, period.end)).filter((r) => r.total !== null);
  const prev = (await verifiedSundayTotals(tx, ids, period.prevStart, period.prevEnd)).filter((r) => r.total !== null);
  const attendance = sumKnown(cur);
  const prevAttendance = sumKnown(prev);
  const attendanceChange = prev.length && prevAttendance > 0 ? ((attendance - prevAttendance) / prevAttendance) * 100 : null;

  // 2. First-timer retention: cohort who first came 30–60 days ago; retained = 3+ visits within 30 days.
  const cohortFrom = addDays(today, -60);
  const cohortTo = addDays(today, -30);
  const cohort = ids.length
    ? await tx
        .select({
          memberId: s.members.id,
          visits: sql<number>`(select count(*)::int from attendance_checkins c join service_events e on e.id = c.service_event_id
                   where c.member_id = members.id and e.event_date between members.first_visit_on and members.first_visit_on + 29)`,
        })
        .from(s.members)
        .where(and(inArray(s.members.parishId, ids), gte(s.members.firstVisitOn, cohortFrom), lte(s.members.firstVisitOn, cohortTo)))
    : [];
  const retained = cohort.filter((c) => c.visits >= 3).length;

  // 3. Remittance cleared.
  const months = remittanceMonths(periodKey, today);
  const rems = ids.length
    ? await tx.select().from(s.remittances).where(and(inArray(s.remittances.parishId, ids), inArray(s.remittances.periodMonth, months)))
    : [];
  const remitByParish = new Map<string, RemitState>();
  for (const p of parishes) {
    const mine = rems.filter((r) => r.parishId === p.id);
    remitByParish.set(p.id, mine.length === 0 ? "Not recorded" : mine.length === months.length && mine.every((r) => r.status === "CLEARED") ? "Cleared" : "Outstanding");
  }
  const cleared = [...remitByParish.values()].filter((v) => v === "Cleared").length;

  // 4. Workers on duty and absent ushers.
  const workersOnDuty = cur.reduce((a, r) => a + (r.workers ?? 0), 0);
  const [absent] = ids.length
    ? await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.usherAssignments)
        .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.usherAssignments.serviceEventId))
        .where(and(inArray(s.serviceEvents.parishId, ids), gte(s.serviceEvents.eventDate, period.start), lte(s.serviceEvents.eventDate, addDays(today, -1)), isNull(s.usherAssignments.checkedInAt)))
    : [{ n: 0 }];

  // 5. 8-week Sunday trend.
  const sundays = lastSundays(today);
  const trendRows = (await verifiedSundayTotals(tx, ids, sundays[0], sundays.at(-1)!)).filter((r) => r.total !== null);
  const trend = sundays.map((d) => ({ date: d, total: trendRows.filter((r) => r.date === d).reduce((a, r) => a + r.total!, 0) }));

  // 6/7. Last Sunday per parish: reports, finances, compliance.
  const lastSunday = weekday(today) === 0 ? addDays(today, -7) : addDays(today, -weekday(today));
  const sundayTypes = ids.length
    ? await tx
        .select({ parishId: s.serviceTypes.parishId })
        .from(s.serviceTypes)
        .where(and(inArray(s.serviceTypes.parishId, ids), eq(s.serviceTypes.isActive, true), eq(s.serviceTypes.recurrence, "WEEKLY"), eq(s.serviceTypes.dayOfWeek, 0)))
    : [];
  const expected = new Map<string, number>();
  for (const t of sundayTypes) expected.set(t.parishId, (expected.get(t.parishId) ?? 0) + 1);
  const lastReports = ids.length
    ? await tx
        .select({
          parishId: s.serviceEvents.parishId,
          status: s.serviceReports.status,
          submittedAt: s.serviceReports.submittedAt,
          total,
          money: sql<number | null>`coalesce(${s.serviceReports.offeringKobo}, ${s.serviceReports.titheKobo}, ${s.serviceReports.specialSeedKobo})`,
        })
        .from(s.serviceReports)
        .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.serviceReports.serviceEventId))
        .where(and(inArray(s.serviceEvents.parishId, ids), eq(s.serviceEvents.eventDate, lastSunday)))
    : [];
  const deadline = reportDeadline(lastSunday);
  const now = new Date();

  const rows: ParishRow[] = parishes.map((p) => {
    const reps = lastReports.filter((r) => r.parishId === p.id);
    const submitted = reps.filter((r) => r.status !== "DRAFT" && r.submittedAt);
    let report: ReportState;
    // Every Sunday service the parish holds needs a submitted report.
    const need = expected.get(p.id) ?? 0;
    if (need === 0) report = "No service";
    else if (submitted.length < need) report = now > deadline ? "Overdue" : "Not due yet";
    else report = submitted.some((r) => r.submittedAt! > deadline) ? "Late" : "Submitted";
    const logged = reps.filter((r) => r.money !== null);
    const finances: FinanceState = logged.length === 0 ? "Not logged" : logged.every((r) => r.status === "VERIFIED") ? "Verified" : "Awaiting pastor";
    const verifiedTotals = reps.filter((r) => r.status === "VERIFIED" && r.total !== null);
    const row = {
      parishId: p.id,
      parishName: p.name,
      areaName: p.areaName,
      attendance: verifiedTotals.length ? verifiedTotals.reduce((a, r) => a + r.total!, 0) : null,
      report,
      finances,
      remittance: remitByParish.get(p.id)!,
    };
    return { ...row, overall: overallFor(row) };
  });

  // Needs attention.
  const noReport = rows.filter((r) => r.report === "Overdue");
  const stale = ids.length
    ? await tx
        .select({ reportId: s.serviceReports.id, parishName: s.parishes.name, serviceName: s.serviceTypes.name, date: s.serviceEvents.eventDate, submittedAt: s.serviceReports.submittedAt })
        .from(s.serviceReports)
        .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.serviceReports.serviceEventId))
        .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
        .innerJoin(s.parishes, eq(s.parishes.id, s.serviceEvents.parishId))
        .where(and(inArray(s.serviceEvents.parishId, ids), eq(s.serviceReports.status, "SUBMITTED"), lte(s.serviceReports.submittedAt, new Date(now.getTime() - 24 * 3_600_000))))
        .orderBy(asc(s.serviceReports.submittedAt))
        .limit(20)
    : [];
  const followUps = ids.length
    ? await tx
        .select({ parishId: s.tasks.parishId, parishName: s.parishes.name, n: sql<number>`count(*)::int` })
        .from(s.tasks)
        .innerJoin(s.parishes, eq(s.parishes.id, s.tasks.parishId))
        .where(and(inArray(s.tasks.parishId, ids), eq(s.tasks.kind, "FOLLOW_UP"), sql`${s.tasks.status} not in ('DONE','CANCELLED')`, sql`${s.tasks.dedupeKey} like 'followup:day3:%'`))
        .groupBy(s.tasks.parishId, s.parishes.name)
    : [];

  return {
    period,
    lastSunday,
    kpis: {
      attendance,
      attendanceChange,
      sundaysCounted: new Set(cur.map((r) => r.date)).size,
      retention: { cohort: cohort.length, retained, rate: cohort.length ? (retained / cohort.length) * 100 : null, target: 60 },
      remittance: { cleared, total: parishes.length, months },
      workersOnDuty,
      absentUshers: absent.n,
    },
    trend,
    attention: { noReport, stale, followUps },
    rows,
  };
}

export type ZoneOverview = Awaited<ReturnType<typeof zoneOverview>>;
