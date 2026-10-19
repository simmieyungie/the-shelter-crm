import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { canAdminParish, ForbiddenError } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/scope";
import { todayIso } from "@/lib/dates";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";

export async function getHierarchy(access: Access) {
  if (!access.isSystemAdmin) throw new ForbiddenError();
  const [regions, provinces, zones, areas, parishes] = await Promise.all([
    db.select().from(s.regions).orderBy(asc(s.regions.name)),
    db.select().from(s.provinces).orderBy(asc(s.provinces.name)),
    db.select().from(s.zones).orderBy(asc(s.zones.name)),
    db.select().from(s.areas).orderBy(asc(s.areas.name)),
    db.select().from(s.parishes).orderBy(asc(s.parishes.name)),
  ]);
  return { regions, provinces, zones, areas, parishes };
}

/** Parishes the user may set up: all for system admins, own parish for pastors. */
export async function getAdminParishes(access: Access) {
  const ids = access.isSystemAdmin ? null : access.parishIds.filter((p) => canAdminParish(access, p));
  if (ids && ids.length === 0) return [];
  return db
    .select({ id: s.parishes.id, name: s.parishes.name, code: s.parishes.code })
    .from(s.parishes)
    .where(ids ? inArray(s.parishes.id, ids) : undefined)
    .orderBy(asc(s.parishes.name));
}

export async function getParishSetup(access: Access, parishId: string) {
  if (!canAdminParish(access, parishId)) throw new ForbiddenError();
  const [parish] = await db.select().from(s.parishes).where(eq(s.parishes.id, parishId));
  const [zones, serviceTypes, departments, groups, members, users] = await Promise.all([
    db.select().from(s.sanctuaryZones).where(eq(s.sanctuaryZones.parishId, parishId)).orderBy(asc(s.sanctuaryZones.sortOrder), asc(s.sanctuaryZones.name)),
    db.select().from(s.serviceTypes).where(eq(s.serviceTypes.parishId, parishId)).orderBy(asc(s.serviceTypes.dayOfWeek), asc(s.serviceTypes.startTime)),
    db.select().from(s.departments).where(eq(s.departments.parishId, parishId)).orderBy(asc(s.departments.name)),
    db
      .select({ group: s.smallGroups, leaderFirst: s.members.firstName, leaderLast: s.members.lastName })
      .from(s.smallGroups)
      .leftJoin(s.members, eq(s.members.id, s.smallGroups.leaderMemberId))
      .where(eq(s.smallGroups.parishId, parishId))
      .orderBy(asc(s.smallGroups.name)),
    db
      .select({ id: s.members.id, firstName: s.members.firstName, lastName: s.members.lastName })
      .from(s.members)
      .where(and(eq(s.members.parishId, parishId), sql`${s.members.status} <> 'FIRST_TIMER'`))
      .orderBy(asc(s.members.firstName)),
    parishUsers(parishId),
  ]);
  return { parish, zones, serviceTypes, departments, groups, members, users };
}

const activeAssignment = (today: string) =>
  and(lte(s.roleAssignments.startsOn, today), or(isNull(s.roleAssignments.endsOn), gte(s.roleAssignments.endsOn, today)));

/** Users holding an active parish-level role in the parish. */
export async function parishUsers(parishId: string) {
  return db
    .selectDistinct({ id: s.users.id, name: s.users.name })
    .from(s.users)
    .innerJoin(s.roleAssignments, eq(s.roleAssignments.userId, s.users.id))
    .where(
      and(
        eq(s.roleAssignments.scopeLevel, "PARISH"),
        eq(s.roleAssignments.scopeId, parishId),
        activeAssignment(todayIso()),
        eq(s.users.isActive, true),
      ),
    )
    .orderBy(asc(s.users.name));
}

export async function listUsers(access: Access, q?: string) {
  const parishIds = access.isSystemAdmin ? null : access.parishIds.filter((p) => canAdminParish(access, p));
  if (parishIds && parishIds.length === 0) return [];
  const search = q?.trim() ? `%${q.trim().toLowerCase()}%` : null;
  const rows = await db
    .selectDistinct({ id: s.users.id, name: s.users.name, email: s.users.email, phone: s.users.phone, isActive: s.users.isActive })
    .from(s.users)
    .leftJoin(s.roleAssignments, eq(s.roleAssignments.userId, s.users.id))
    .where(
      and(
        parishIds ? and(eq(s.roleAssignments.scopeLevel, "PARISH"), inArray(s.roleAssignments.scopeId, parishIds)) : undefined,
        search
          ? or(sql`lower(${s.users.name}) like ${search}`, sql`lower(coalesce(${s.users.email},'')) like ${search}`, sql`coalesce(${s.users.phone},'') like ${search}`)
          : undefined,
      ),
    )
    .orderBy(asc(s.users.name))
    .limit(200);
  const ids = rows.map((r) => r.id);
  const roles = ids.length
    ? await db
        .select({ userId: s.roleAssignments.userId, role: s.roleAssignments.role })
        .from(s.roleAssignments)
        .where(and(inArray(s.roleAssignments.userId, ids), activeAssignment(todayIso())))
    : [];
  return rows.map((r) => ({ ...r, roles: [...new Set(roles.filter((x) => x.userId === r.id).map((x) => x.role))] }));
}

export async function getUserDetail(access: Access, userId: string) {
  const [user] = await db
    .select({ id: s.users.id, name: s.users.name, email: s.users.email, phone: s.users.phone, isActive: s.users.isActive })
    .from(s.users)
    .where(eq(s.users.id, userId));
  if (!user) return null;
  const assignments = await db
    .select()
    .from(s.roleAssignments)
    .where(eq(s.roleAssignments.userId, userId))
    .orderBy(desc(s.roleAssignments.startsOn));
  if (!access.isSystemAdmin) {
    const ok = assignments.some((a) => a.scopeLevel === "PARISH" && a.scopeId && canAdminParish(access, a.scopeId));
    if (!ok) throw new ForbiddenError();
  }
  // Names for every scope id so the page can show "Shelter Parish" rather than a UUID.
  const scopeIds = assignments.map((a) => a.scopeId).filter(Boolean) as string[];
  const names = new Map<string, string>();
  if (scopeIds.length) {
    for (const t of [s.parishes, s.areas, s.zones, s.provinces, s.regions] as const) {
      const rows = await db.select({ id: t.id, name: t.name }).from(t).where(inArray(t.id, scopeIds));
      rows.forEach((r) => names.set(r.id, r.name));
    }
  }
  const deptIds = assignments.map((a) => a.departmentId).filter(Boolean) as string[];
  if (deptIds.length) {
    const rows = await db.select({ id: s.departments.id, name: s.departments.name }).from(s.departments).where(inArray(s.departments.id, deptIds));
    rows.forEach((r) => names.set(r.id, r.name));
  }
  const groupIds = assignments.map((a) => a.smallGroupId).filter(Boolean) as string[];
  if (groupIds.length) {
    const rows = await db.select({ id: s.smallGroups.id, name: s.smallGroups.name }).from(s.smallGroups).where(inArray(s.smallGroups.id, groupIds));
    rows.forEach((r) => names.set(r.id, r.name));
  }
  return { user, assignments, names };
}

/** Options for scope pickers when granting roles. */
export async function scopeOptions(access: Access) {
  if (access.isSystemAdmin) {
    const h = await getHierarchy(access);
    const departments = await db
      .select({ id: s.departments.id, name: s.departments.name, parishId: s.departments.parishId })
      .from(s.departments)
      .orderBy(asc(s.departments.name));
    const groups = await db
      .select({ id: s.smallGroups.id, name: s.smallGroups.name, parishId: s.smallGroups.parishId })
      .from(s.smallGroups)
      .orderBy(asc(s.smallGroups.name));
    return { ...h, departments, groups };
  }
  const parishes = await getAdminParishes(access);
  const ids = parishes.map((p) => p.id);
  const departments = ids.length
    ? await db.select({ id: s.departments.id, name: s.departments.name, parishId: s.departments.parishId }).from(s.departments).where(inArray(s.departments.parishId, ids))
    : [];
  const groups = ids.length
    ? await db.select({ id: s.smallGroups.id, name: s.smallGroups.name, parishId: s.smallGroups.parishId }).from(s.smallGroups).where(inArray(s.smallGroups.parishId, ids))
    : [];
  return { regions: [], provinces: [], zones: [], areas: [], parishes, departments, groups };
}

export async function getRemittanceAdmin(access: Access, periodMonth: string) {
  const ids = access.overviewParishIds;
  const policies = await db.select().from(s.remittancePolicies).orderBy(desc(s.remittancePolicies.effectiveFrom));
  if (ids.length === 0) return { rows: [], policies };
  const rows = await db
    .select({
      parishId: s.parishes.id,
      parishName: s.parishes.name,
      areaName: s.areas.name,
      remittance: s.remittances,
    })
    .from(s.parishes)
    .innerJoin(s.areas, eq(s.areas.id, s.parishes.areaId))
    .leftJoin(s.remittances, and(eq(s.remittances.parishId, s.parishes.id), eq(s.remittances.periodMonth, periodMonth)))
    .where(inArray(s.parishes.id, ids))
    .orderBy(asc(s.areas.name), asc(s.parishes.name));
  return { rows, policies };
}
