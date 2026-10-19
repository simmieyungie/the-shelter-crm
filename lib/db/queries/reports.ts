import "server-only";
import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { assertParish, can } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/scope";
import { todayIso } from "@/lib/dates";
import { db, type DbOrTx } from "@/lib/db";
import * as s from "@/lib/db/schema";

export type ReportPerms = {
  canEdit: boolean;
  canSubmit: boolean;
  canVerify: boolean;
  canSendBack: boolean;
  canReopen: boolean;
};

export function reportPerms(access: Access, parishId: string, status: s.ReportStatus): ReportPerms {
  const drafter = can(access, "draftReport", parishId) || can(access, "verifyReport", parishId);
  const editable = status === "DRAFT" || status === "REOPENED";
  return {
    canEdit: drafter && editable,
    canSubmit: drafter && editable,
    canVerify: can(access, "verifyReport", parishId) && status === "SUBMITTED",
    canSendBack: can(access, "verifyReport", parishId) && status === "SUBMITTED",
    canReopen: can(access, "reopenReport", parishId) && status === "VERIFIED",
  };
}

const drafter = alias(s.users, "drafter");
const verifier = alias(s.users, "verifier");
const submitter = alias(s.users, "submitter");

export async function getReport(access: Access, reportId: string) {
  const [row] = await db
    .select({
      report: s.serviceReports,
      event: s.serviceEvents,
      type: s.serviceTypes,
      parishName: s.parishes.name,
      drafterName: drafter.name,
      verifierName: verifier.name,
      submitterName: submitter.name,
    })
    .from(s.serviceReports)
    .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.serviceReports.serviceEventId))
    .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
    .innerJoin(s.parishes, eq(s.parishes.id, s.serviceEvents.parishId))
    .leftJoin(drafter, eq(drafter.id, s.serviceReports.draftedBy))
    .leftJoin(verifier, eq(verifier.id, s.serviceReports.verifiedBy))
    .leftJoin(submitter, eq(submitter.id, s.serviceReports.submittedBy))
    .where(eq(s.serviceReports.id, reportId));
  if (!row) return null;
  assertParish(access, row.event.parishId);

  const eventId = row.event.id;
  const [tallies, rostered, history, pastors, policy] = await Promise.all([
    db
      .select({
        zoneId: s.sanctuaryZones.id,
        zoneName: s.sanctuaryZones.name,
        sortOrder: s.sanctuaryZones.sortOrder,
        userName: s.users.name,
        men: s.zoneTallies.men,
        women: s.zoneTallies.women,
        children: s.zoneTallies.children,
        firstTimers: s.zoneTallies.firstTimers,
        updatedAt: s.zoneTallies.updatedAt,
      })
      .from(s.zoneTallies)
      .innerJoin(s.sanctuaryZones, eq(s.sanctuaryZones.id, s.zoneTallies.sanctuaryZoneId))
      .innerJoin(s.users, eq(s.users.id, s.zoneTallies.userId))
      .where(eq(s.zoneTallies.serviceEventId, eventId))
      .orderBy(asc(s.sanctuaryZones.sortOrder), asc(s.users.name)),
    db.select({ userId: s.usherAssignments.userId }).from(s.usherAssignments).where(eq(s.usherAssignments.serviceEventId, eventId)),
    db
      .select({ action: s.auditLog.action, at: s.auditLog.at, actor: s.users.name })
      .from(s.auditLog)
      .leftJoin(s.users, eq(s.users.id, s.auditLog.actorUserId))
      .where(and(eq(s.auditLog.entity, "service_report"), eq(s.auditLog.entityId, reportId)))
      .orderBy(desc(s.auditLog.at))
      .limit(20),
    parishPastors(row.event.parishId),
    policyFor(db, row.event.parishId, row.event.eventDate),
  ]);

  // Group tallies by zone.
  const zones = new Map<string, { zoneName: string; ushers: typeof tallies; men: number; women: number; children: number; firstTimers: number }>();
  for (const t of tallies) {
    const z = zones.get(t.zoneId) ?? { zoneName: t.zoneName, ushers: [], men: 0, women: 0, children: 0, firstTimers: 0 };
    z.ushers.push(t);
    z.men += t.men;
    z.women += t.women;
    z.children += t.children;
    z.firstTimers += t.firstTimers;
    zones.set(t.zoneId, z);
  }
  const ushersSynced = new Set(tallies.map((t) => t.userName)).size;
  const lateTallies =
    row.report.submittedAt && row.report.status !== "DRAFT"
      ? tallies.filter((t) => t.updatedAt > row.report.submittedAt!).length
      : 0;

  return {
    ...row,
    tallyZones: [...zones.values()],
    ushersSynced,
    ushersExpected: Math.max(new Set(rostered.map((r) => r.userId)).size, ushersSynced),
    lateTallies,
    history,
    pastors,
    policy,
    perms: reportPerms(access, row.event.parishId, row.report.status),
  };
}

export async function parishPastors(parishId: string) {
  const today = todayIso();
  return db
    .selectDistinct({ id: s.users.id, name: s.users.name })
    .from(s.roleAssignments)
    .innerJoin(s.users, eq(s.users.id, s.roleAssignments.userId))
    .where(
      and(
        eq(s.roleAssignments.role, "PARISH_PASTOR"),
        eq(s.roleAssignments.scopeLevel, "PARISH"),
        eq(s.roleAssignments.scopeId, parishId),
        lte(s.roleAssignments.startsOn, today),
        or(isNull(s.roleAssignments.endsOn), sql`${s.roleAssignments.endsOn} >= ${today}`),
      ),
    );
}

/** The most specific remittance split covering the parish on the date. */
export async function policyFor(tx: DbOrTx, parishId: string, onDate: string) {
  const [chain] = await tx
    .select({ zoneId: s.zones.id, provinceId: s.provinces.id, regionId: s.provinces.regionId })
    .from(s.parishes)
    .innerJoin(s.areas, eq(s.areas.id, s.parishes.areaId))
    .innerJoin(s.zones, eq(s.zones.id, s.areas.zoneId))
    .innerJoin(s.provinces, eq(s.provinces.id, s.zones.provinceId))
    .where(eq(s.parishes.id, parishId));
  if (!chain) return null;
  const rows = await tx
    .select()
    .from(s.remittancePolicies)
    .where(
      and(
        lte(s.remittancePolicies.effectiveFrom, onDate),
        or(
          eq(s.remittancePolicies.scopeLevel, "GLOBAL"),
          and(eq(s.remittancePolicies.scopeLevel, "REGION"), eq(s.remittancePolicies.scopeId, chain.regionId)),
          and(eq(s.remittancePolicies.scopeLevel, "PROVINCE"), eq(s.remittancePolicies.scopeId, chain.provinceId)),
          and(eq(s.remittancePolicies.scopeLevel, "ZONE"), eq(s.remittancePolicies.scopeId, chain.zoneId)),
        ),
      ),
    )
    .orderBy(desc(s.remittancePolicies.effectiveFrom));
  const rank = { ZONE: 0, PROVINCE: 1, REGION: 2, GLOBAL: 3, AREA: 4, PARISH: 5 } as const;
  return rows.sort((a, b) => rank[a.scopeLevel] - rank[b.scopeLevel] || b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

/** Number of tallies that changed after the report was submitted (spec: late arrivals). */
export async function lateTallyCount(tx: DbOrTx, eventId: string, since: Date) {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(s.zoneTallies)
    .where(and(eq(s.zoneTallies.serviceEventId, eventId), gt(s.zoneTallies.updatedAt, since)));
  return r.n;
}

