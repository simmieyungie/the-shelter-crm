import "server-only";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { assertCan } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/scope";
import { addDays, todayIso } from "@/lib/dates";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { scheduledDates } from "@/lib/schedule";

export type ReportRow =
  | {
      kind: "report";
      reportId: string;
      date: string;
      serviceName: string;
      serviceTypeId: string;
      occurrence: number;
      men: number | null;
      women: number | null;
      children: number | null;
      collectionsKobo: number | null;
      status: s.ReportStatus;
      source: s.RecordSource;
    }
  | { kind: "gap"; date: string; serviceName: string; serviceTypeId: string; occurrence: number };

export const DEFAULT_RANGE_DAYS = 84; // 12 weeks

/** Reports in the range plus "No record" gaps for scheduled services with no report. */
export async function listReportsWithGaps(access: Access, parishId: string, opts: { from?: string; to?: string; typeId?: string } = {}) {
  assertCan(access, "viewReports", parishId);
  const today = todayIso();
  const to = opts.to && opts.to <= today ? opts.to : today;
  const from = opts.from && opts.from <= to ? opts.from : addDays(to, -DEFAULT_RANGE_DAYS + 1);

  const types = await db
    .select()
    .from(s.serviceTypes)
    .where(and(eq(s.serviceTypes.parishId, parishId), opts.typeId ? eq(s.serviceTypes.id, opts.typeId) : undefined))
    .orderBy(asc(s.serviceTypes.name));

  const events = await db
    .select({ event: s.serviceEvents, report: s.serviceReports, typeName: s.serviceTypes.name })
    .from(s.serviceEvents)
    .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
    .leftJoin(s.serviceReports, eq(s.serviceReports.serviceEventId, s.serviceEvents.id))
    .where(
      and(
        eq(s.serviceEvents.parishId, parishId),
        gte(s.serviceEvents.eventDate, from),
        lte(s.serviceEvents.eventDate, to),
        opts.typeId ? eq(s.serviceEvents.serviceTypeId, opts.typeId) : undefined,
      ),
    )
    .orderBy(desc(s.serviceEvents.eventDate), desc(s.serviceEvents.startTime));

  const rows: ReportRow[] = [];
  const haveReport = new Set<string>();
  for (const { event, report, typeName } of events) {
    if (!report) continue;
    haveReport.add(`${event.serviceTypeId}:${event.eventDate}`);
    const collections =
      report.offeringKobo === null && report.titheKobo === null && report.specialSeedKobo === null
        ? null
        : (report.offeringKobo ?? 0) + (report.titheKobo ?? 0) + (report.specialSeedKobo ?? 0);
    rows.push({
      kind: "report",
      reportId: report.id,
      date: event.eventDate,
      serviceName: typeName,
      serviceTypeId: event.serviceTypeId,
      occurrence: event.occurrence,
      men: report.men,
      women: report.women,
      children: report.children,
      collectionsKobo: collections,
      status: report.status,
      source: report.source,
    });
  }

  // Scheduled dates before today with no report at all are gaps.
  const yesterday = addDays(today, -1);
  for (const t of types) {
    if (!t.isActive) continue;
    for (const d of scheduledDates(t, from, to < yesterday ? to : yesterday)) {
      if (!haveReport.has(`${t.id}:${d}`)) rows.push({ kind: "gap", date: d, serviceName: t.name, serviceTypeId: t.id, occurrence: 1 });
    }
  }

  rows.sort((a, b) => b.date.localeCompare(a.date) || a.serviceName.localeCompare(b.serviceName));
  return { rows, from, to, types: types.map((t) => ({ id: t.id, name: t.name })), gapCount: rows.filter((r) => r.kind === "gap").length };
}

/** For the Add-past-service form: scheduled dates in the last N weeks without a verified report. */
export async function datesNeedingRecords(parishId: string, typeId: string, weeks = 12) {
  const [type] = await db.select().from(s.serviceTypes).where(and(eq(s.serviceTypes.id, typeId), eq(s.serviceTypes.parishId, parishId)));
  if (!type) return [];
  const today = todayIso();
  const from = addDays(today, -weeks * 7);
  const verified = await db
    .select({ date: s.serviceEvents.eventDate })
    .from(s.serviceEvents)
    .innerJoin(s.serviceReports, eq(s.serviceReports.serviceEventId, s.serviceEvents.id))
    .where(and(eq(s.serviceEvents.serviceTypeId, typeId), gte(s.serviceEvents.eventDate, from), eq(s.serviceReports.status, "VERIFIED")));
  const done = new Set(verified.map((v) => v.date));
  return scheduledDates(type, from, addDays(today, -1))
    .filter((d) => !done.has(d))
    .reverse();
}
