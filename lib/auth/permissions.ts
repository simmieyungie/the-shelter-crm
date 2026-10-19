import type { Role } from "@/lib/db/schema";
import type { Access } from "./scope";

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function canReadParish(access: Access, parishId: string): boolean {
  return access.parishIds.includes(parishId);
}

export function hasRoleIn(access: Access, parishId: string, roles: Role[]): boolean {
  const held = access.rolesByParish[parishId] ?? [];
  return held.some((r) => roles.includes(r));
}

export function assertParish(access: Access, parishId: string) {
  if (!canReadParish(access, parishId)) throw new ForbiddenError("That parish is outside your scope.");
}

export function assertRole(access: Access, parishId: string, roles: Role[], message?: string) {
  if (!hasRoleIn(access, parishId, roles)) throw new ForbiddenError(message);
}

/** Roles that work inside a single parish (as opposed to oversight roles). */
export const PARISH_ROLES: Role[] = [
  "USHER",
  "HEAD_USHER",
  "SECRETARY",
  "HOD",
  "TRIBE_LEADER",
  "PARISH_PASTOR",
];

// Permission matrix (spec §6). Each entry lists the roles that may act within a parish.
export const PERMS = {
  submitTally: ["USHER", "HEAD_USHER"],
  manageRoster: ["HEAD_USHER", "PARISH_PASTOR"],
  draftReport: ["HEAD_USHER", "SECRETARY"],
  verifyReport: ["PARISH_PASTOR"],
  reopenReport: ["PARISH_PASTOR", "HEAD_USHER"],
  viewReports: ["HEAD_USHER", "SECRETARY", "PARISH_PASTOR"],
  addPastService: ["SECRETARY", "HEAD_USHER", "PARISH_PASTOR"],
  runImport: ["SECRETARY", "HEAD_USHER", "PARISH_PASTOR"],
  verifyAtImport: ["PARISH_PASTOR"],
  manageAllTasks: ["PARISH_PASTOR"],
  viewMembers: ["HEAD_USHER", "SECRETARY", "HOD", "TRIBE_LEADER", "PARISH_PASTOR"],
  // Ushers can find a returning guest and mark them present, without browsing member records.
  recordAttendance: ["USHER", "HEAD_USHER", "SECRETARY", "HOD", "TRIBE_LEADER", "PARISH_PASTOR"],
  editMembers: ["HEAD_USHER", "SECRETARY", "PARISH_PASTOR"],
  adminParish: ["PARISH_PASTOR"],
  zoneOverview: ["AREA_PASTOR", "ZONAL_PASTOR", "PROVINCIAL_ADMIN", "SYSTEM_ADMIN"],
} satisfies Record<string, Role[]>;

export type Perm = keyof typeof PERMS;

export function can(access: Access, perm: Perm, parishId: string): boolean {
  return hasRoleIn(access, parishId, PERMS[perm]);
}

export function assertCan(access: Access, perm: Perm, parishId: string, message?: string) {
  if (!can(access, perm, parishId)) throw new ForbiddenError(message);
}

/** HODs manage tasks in their own departments; the parish pastor manages all. */
export function canManageDepartmentTasks(
  access: Access,
  parishId: string,
  departmentId: string | null,
): boolean {
  if (can(access, "manageAllTasks", parishId)) return true;
  if (!departmentId) return false;
  return (access.hodDepartmentsByParish[parishId] ?? []).includes(departmentId);
}

export function canSeeZoneOverview(access: Access): boolean {
  return access.overviewParishIds.length > 0 || access.isSystemAdmin;
}

export function canAdminParish(access: Access, parishId: string): boolean {
  return access.isSystemAdmin || can(access, "adminParish", parishId);
}

/** Parishes where the user holds a parish-level role (used for the parish switcher). */
export function workingParishIds(access: Access): string[] {
  return access.parishIds.filter((p) => hasRoleIn(access, p, PARISH_ROLES));
}
