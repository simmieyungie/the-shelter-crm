import "server-only";
import { eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { areas, parishes, provinces, regions, zones } from "@/lib/db/schema";
import { can, canSeeZoneOverview, hasRoleIn, PARISH_ROLES, workingParishIds } from "./permissions";
import { getCurrentAccess, type Access } from "./scope";
import { getCurrentUser, type SessionUser } from "./session";

export const PARISH_COOKIE = "parish";

export type ParishSummary = {
  id: string;
  name: string;
  code: string;
  areaName: string;
  zoneName: string;
  regionName: string;
};

export type NavKey = "count" | "tasks" | "reports" | "zone" | "members" | "admin";

export type AppContext = {
  user: SessionUser;
  access: Access;
  parish: ParishSummary | null;
  parishes: ParishSummary[];
  nav: NavKey[];
};

async function parishSummaries(ids: string[]): Promise<ParishSummary[]> {
  if (ids.length === 0) return [];
  return db
    .select({
      id: parishes.id,
      name: parishes.name,
      code: parishes.code,
      areaName: areas.name,
      zoneName: zones.name,
      regionName: regions.name,
    })
    .from(parishes)
    .innerJoin(areas, eq(areas.id, parishes.areaId))
    .innerJoin(zones, eq(zones.id, areas.zoneId))
    .innerJoin(provinces, eq(provinces.id, zones.provinceId))
    .innerJoin(regions, eq(regions.id, provinces.regionId))
    .where(inArray(parishes.id, ids))
    .orderBy(parishes.name);
}

export function navFor(access: Access, parishId: string | null): NavKey[] {
  const nav: NavKey[] = [];
  if (parishId && can(access, "submitTally", parishId)) nav.push("count");
  if (parishId && hasRoleIn(access, parishId, PARISH_ROLES)) nav.push("tasks");
  if (parishId && can(access, "viewReports", parishId)) nav.push("reports");
  if (canSeeZoneOverview(access)) nav.push("zone");
  if (parishId && can(access, "viewMembers", parishId)) nav.push("members");
  if (access.isSystemAdmin || (parishId && can(access, "adminParish", parishId))) nav.push("admin");
  return nav;
}

/** Loads the signed-in user's context or redirects to the login page. */
export const requireAppContext = cache(async (): Promise<AppContext> => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = (await getCurrentAccess())!;
  const working = await parishSummaries(workingParishIds(access));
  const jar = await cookies();
  const wanted = jar.get(PARISH_COOKIE)?.value;
  const parish = working.find((p) => p.id === wanted) ?? working[0] ?? null;
  return { user, access, parish, parishes: working, nav: navFor(access, parish?.id ?? null) };
});

/** Same as requireAppContext but also requires a current parish. */
export async function requireParishContext(): Promise<AppContext & { parish: ParishSummary }> {
  const ctx = await requireAppContext();
  if (!ctx.parish) redirect("/");
  return ctx as AppContext & { parish: ParishSummary };
}

export const NAV_HOME: Record<NavKey, string> = {
  count: "/count",
  tasks: "/tasks",
  reports: "/reports",
  zone: "/zone",
  members: "/members",
  admin: "/admin",
};
