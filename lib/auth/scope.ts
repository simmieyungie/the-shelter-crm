import "server-only";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { cache } from "react";
import { type DbOrTx, db as defaultDb } from "@/lib/db";
import { areas, parishes, provinces, roleAssignments, zones, type Role } from "@/lib/db/schema";
import { todayIso } from "@/lib/dates";
import { getCurrentUser, type SessionUser } from "./session";

export type Access = {
  userId: string;
  /** Every parish the user can read, via any active role assignment. */
  parishIds: string[];
  /** Roles the user holds that cover each parish. */
  rolesByParish: Record<string, Role[]>;
  /** Departments the user leads as HOD, per parish. */
  hodDepartmentsByParish: Record<string, string[]>;
  /** All distinct roles held (any scope). */
  roles: Role[];
  /** Parishes covered by a zone-overview role (AREA/ZONAL pastor, provincial admin, system admin). */
  overviewParishIds: string[];
  isSystemAdmin: boolean;
};

const OVERVIEW_ROLES: Role[] = ["AREA_PASTOR", "ZONAL_PASTOR", "PROVINCIAL_ADMIN", "SYSTEM_ADMIN"];

/** Walks the user's active role assignments down the hierarchy to the parishes they cover. */
export async function loadAccess(userId: string, db: DbOrTx = defaultDb, today = todayIso()): Promise<Access> {
  const ra = roleAssignments;
  const rows = await db
    .select({ role: ra.role, departmentId: ra.departmentId, parishId: parishes.id })
    .from(ra)
    .innerJoin(
      parishes,
      sql`true`, // filtered by the scope predicate below
    )
    .innerJoin(areas, eq(areas.id, parishes.areaId))
    .innerJoin(zones, eq(zones.id, areas.zoneId))
    .innerJoin(provinces, eq(provinces.id, zones.provinceId))
    .where(
      and(
        eq(ra.userId, userId),
        lte(ra.startsOn, today),
        or(isNull(ra.endsOn), gte(ra.endsOn, today)),
        or(
          eq(ra.scopeLevel, "GLOBAL"),
          and(eq(ra.scopeLevel, "PARISH"), eq(ra.scopeId, parishes.id)),
          and(eq(ra.scopeLevel, "AREA"), eq(ra.scopeId, areas.id)),
          and(eq(ra.scopeLevel, "ZONE"), eq(ra.scopeId, zones.id)),
          and(eq(ra.scopeLevel, "PROVINCE"), eq(ra.scopeId, provinces.id)),
          and(eq(ra.scopeLevel, "REGION"), eq(ra.scopeId, provinces.regionId)),
        ),
      ),
    );

  const rolesByParish: Record<string, Role[]> = {};
  const hod: Record<string, string[]> = {};
  const overview = new Set<string>();
  const allRoles = new Set<Role>();
  for (const r of rows) {
    allRoles.add(r.role);
    const list = (rolesByParish[r.parishId] ??= []);
    if (!list.includes(r.role)) list.push(r.role);
    if (r.role === "HOD" && r.departmentId) (hod[r.parishId] ??= []).push(r.departmentId);
    if (OVERVIEW_ROLES.includes(r.role)) overview.add(r.parishId);
  }

  // Roles with no covered parish yet (e.g. a GLOBAL admin on an empty database) still count.
  const held = await db
    .selectDistinct({ role: ra.role })
    .from(ra)
    .where(and(eq(ra.userId, userId), lte(ra.startsOn, today), or(isNull(ra.endsOn), gte(ra.endsOn, today))));
  for (const h of held) allRoles.add(h.role);

  return {
    userId,
    parishIds: Object.keys(rolesByParish),
    rolesByParish,
    hodDepartmentsByParish: hod,
    roles: [...allRoles],
    overviewParishIds: [...overview],
    isSystemAdmin: allRoles.has("SYSTEM_ADMIN"),
  };
}

/** Spec §6: every parish a user can reach through their role assignments. */
export async function getAccessibleParishIds(user: Pick<SessionUser, "id">, db: DbOrTx = defaultDb): Promise<string[]> {
  return (await loadAccess(user.id, db)).parishIds;
}

/** Access for the signed-in user of the current request (memoised). */
export const getCurrentAccess = cache(async (): Promise<Access | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return loadAccess(user.id);
});
