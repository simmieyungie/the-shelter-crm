"use server";

import { and, eq, gt } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireAppContext } from "@/lib/auth/context";
import { hashPassword } from "@/lib/auth/password";
import { canAdminParish, ForbiddenError, PARISH_ROLES } from "@/lib/auth/permissions";
import { addDays, todayIso } from "@/lib/dates";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import {
  type ActionState,
  checkbox,
  int,
  isoDate,
  optionalInt,
  optionalText,
  optionalUuid,
  runAction,
  text,
  time,
  UserError,
  uuid,
} from "@/lib/forms";
import { parseNairaToKobo } from "@/lib/money";
import { normalisePhone } from "@/lib/phone";

async function ctx() {
  return requireAppContext();
}

async function assertSystemAdmin() {
  const c = await ctx();
  if (!c.access.isSystemAdmin) throw new ForbiddenError("Only a system administrator can change the hierarchy.");
  return c;
}

async function assertParishAdmin(parishId: string) {
  const c = await ctx();
  if (!canAdminParish(c.access, parishId)) throw new ForbiddenError("You can only set up your own parish.");
  return c;
}

// ---------------------------------------------------------------------------
// Hierarchy (system admin)
// ---------------------------------------------------------------------------

const hierarchySchema = z.object({
  level: z.enum(["region", "province", "zone", "area", "parish"]),
  id: optionalUuid(),
  parentId: optionalUuid(),
  name: text(),
  code: z.string().trim().min(1, "Required").max(20).transform((v) => v.toUpperCase()),
  address: optionalText(),
  phone: optionalText(),
  email: optionalText(),
  isActive: checkbox().optional(),
});

export async function saveHierarchyNode(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(hierarchySchema, fd, async (d) => {
    const c = await assertSystemAdmin();
    const base = { name: d.name, code: d.code };
    const needParent = () => {
      if (!d.parentId) throw new UserError("Choose where this belongs.");
      return d.parentId;
    };
    let entityId: string;
    switch (d.level) {
      case "region":
        entityId = d.id
          ? (await db.update(s.regions).set(base).where(eq(s.regions.id, d.id)).returning())[0].id
          : (await db.insert(s.regions).values(base).returning())[0].id;
        break;
      case "province":
        entityId = d.id
          ? (await db.update(s.provinces).set(base).where(eq(s.provinces.id, d.id)).returning())[0].id
          : (await db.insert(s.provinces).values({ ...base, regionId: needParent() }).returning())[0].id;
        break;
      case "zone":
        entityId = d.id
          ? (await db.update(s.zones).set(base).where(eq(s.zones.id, d.id)).returning())[0].id
          : (await db.insert(s.zones).values({ ...base, provinceId: needParent() }).returning())[0].id;
        break;
      case "area":
        entityId = d.id
          ? (await db.update(s.areas).set(base).where(eq(s.areas.id, d.id)).returning())[0].id
          : (await db.insert(s.areas).values({ ...base, zoneId: needParent() }).returning())[0].id;
        break;
      case "parish": {
        const extra = {
          address: d.address,
          phone: d.phone ? (normalisePhone(d.phone) ?? d.phone) : null,
          email: d.email,
          isActive: d.isActive ?? true,
        };
        entityId = d.id
          ? (await db.update(s.parishes).set({ ...base, ...extra }).where(eq(s.parishes.id, d.id)).returning())[0].id
          : (await db.insert(s.parishes).values({ ...base, ...extra, areaId: needParent() }).returning())[0].id;
        break;
      }
    }
    await writeAudit(db, { actorUserId: c.user.id, entity: d.level, entityId, action: d.id ? "update" : "create", after: d });
    revalidatePath("/admin/hierarchy");
    return d.id ? "Saved" : `${d.name} added`;
  });
}

// ---------------------------------------------------------------------------
// Parish setup
// ---------------------------------------------------------------------------

const zoneSchema = z.object({
  parishId: uuid(),
  id: optionalUuid(),
  name: text(),
  capacity: optionalInt(0),
  sortOrder: int(0).default(0),
  isActive: checkbox(),
});

export async function saveSanctuaryZone(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(zoneSchema, fd, async (d) => {
    await assertParishAdmin(d.parishId);
    const values = { name: d.name, capacity: d.capacity, sortOrder: d.sortOrder, isActive: d.isActive };
    if (d.id) await db.update(s.sanctuaryZones).set(values).where(and(eq(s.sanctuaryZones.id, d.id), eq(s.sanctuaryZones.parishId, d.parishId)));
    else await db.insert(s.sanctuaryZones).values({ ...values, parishId: d.parishId });
    revalidatePath("/admin/parish");
  });
}

const serviceTypeSchema = z
  .object({
    parishId: uuid(),
    id: optionalUuid(),
    name: text(),
    recurrence: z.enum(["WEEKLY", "MONTHLY_FIRST_FRIDAY", "SPECIAL"]),
    dayOfWeek: optionalInt(0).pipe(z.number().max(6).nullable()),
    startTime: time(),
    location: optionalText(),
    maxPerDay: int(1).max(10, "At most 10 a day"),
    isActive: checkbox(),
  })
  .superRefine((d, ctx) => {
    if (d.recurrence === "WEEKLY" && d.dayOfWeek === null)
      ctx.addIssue({ code: "custom", path: ["dayOfWeek"], message: "Choose the day this service holds" });
  });

export async function saveServiceType(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(serviceTypeSchema, fd, async (d) => {
    await assertParishAdmin(d.parishId);
    const dayOfWeek = d.recurrence === "MONTHLY_FIRST_FRIDAY" ? 5 : d.recurrence === "SPECIAL" ? null : d.dayOfWeek;
    const values = {
      name: d.name,
      recurrence: d.recurrence,
      dayOfWeek,
      startTime: d.startTime,
      location: d.location,
      maxPerDay: d.maxPerDay,
      isActive: d.isActive,
    };
    if (d.id) {
      const [over] = await db
        .select({ id: s.serviceEvents.id })
        .from(s.serviceEvents)
        .where(and(eq(s.serviceEvents.serviceTypeId, d.id), gt(s.serviceEvents.occurrence, d.maxPerDay)))
        .limit(1);
      if (over)
        throw new UserError(
          `Some dates already have more than ${d.maxPerDay} of this service. Remove those records before lowering the limit.`,
        );
      await db.update(s.serviceTypes).set(values).where(and(eq(s.serviceTypes.id, d.id), eq(s.serviceTypes.parishId, d.parishId)));
    } else await db.insert(s.serviceTypes).values({ ...values, parishId: d.parishId });
    revalidatePath("/admin/parish");
  });
}

const deptSchema = z.object({ parishId: uuid(), id: optionalUuid(), name: text() });

export async function saveDepartment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(deptSchema, fd, async (d) => {
    await assertParishAdmin(d.parishId);
    if (d.id) await db.update(s.departments).set({ name: d.name }).where(and(eq(s.departments.id, d.id), eq(s.departments.parishId, d.parishId)));
    else await db.insert(s.departments).values({ parishId: d.parishId, name: d.name });
    revalidatePath("/admin/parish");
  });
}

const groupSchema = z.object({
  parishId: uuid(),
  id: optionalUuid(),
  typeName: text(),
  name: text(),
  address: optionalText(),
  landmark: optionalText(),
  leaderMemberId: optionalUuid(),
  isActive: checkbox(),
});

export async function saveSmallGroup(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(groupSchema, fd, async (d) => {
    await assertParishAdmin(d.parishId);
    const values = { typeName: d.typeName, name: d.name, address: d.address, landmark: d.landmark, leaderMemberId: d.leaderMemberId, isActive: d.isActive };
    if (d.id) await db.update(s.smallGroups).set(values).where(and(eq(s.smallGroups.id, d.id), eq(s.smallGroups.parishId, d.parishId)));
    else await db.insert(s.smallGroups).values({ ...values, parishId: d.parishId });
    revalidatePath("/admin/parish");
  });
}

const settingsSchema = z.object({
  parishId: uuid(),
  followUpLeadUserId: optionalUuid(),
  address: optionalText(),
  phone: optionalText(),
  email: optionalText(),
});

export async function saveParishSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(settingsSchema, fd, async (d) => {
    const c = await assertParishAdmin(d.parishId);
    const [before] = await db.select().from(s.parishes).where(eq(s.parishes.id, d.parishId));
    const after = {
      followUpLeadUserId: d.followUpLeadUserId,
      address: d.address,
      phone: d.phone ? (normalisePhone(d.phone) ?? d.phone) : null,
      email: d.email,
    };
    await db.update(s.parishes).set(after).where(eq(s.parishes.id, d.parishId));
    await writeAudit(db, { actorUserId: c.user.id, entity: "parish", entityId: d.parishId, action: "settings", before, after });
    revalidatePath("/admin/parish");
  });
}

// ---------------------------------------------------------------------------
// Users and role assignments
// ---------------------------------------------------------------------------

const userSchema = z
  .object({
    id: optionalUuid(),
    name: text(),
    phone: optionalText(),
    email: optionalText().pipe(z.email("Enter a valid email").nullable()),
    password: optionalText().pipe(z.string().min(8, "At least 8 characters").nullable()),
    isActive: checkbox().optional(),
    // When a parish pastor creates a user, they must give a parish role straight away.
    role: z.enum(s.roleEnum.enumValues).optional(),
    parishId: optionalUuid(),
    departmentId: optionalUuid(),
  })
  .superRefine((d, ctx) => {
    if (!d.phone && !d.email) ctx.addIssue({ code: "custom", path: ["phone"], message: "Give a phone number or an email" });
  });

/** Users a parish pastor may manage: those with a role in one of their parishes. */
async function assertCanManageUser(userId: string) {
  const c = await ctx();
  if (c.access.isSystemAdmin) return c;
  const rows = await db
    .select({ scopeId: s.roleAssignments.scopeId })
    .from(s.roleAssignments)
    .where(and(eq(s.roleAssignments.userId, userId), eq(s.roleAssignments.scopeLevel, "PARISH")));
  if (!rows.some((r) => r.scopeId && canAdminParish(c.access, r.scopeId))) throw new ForbiddenError("You can only manage people in your parish.");
  return c;
}

export async function saveUser(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(userSchema, fd, async (d) => {
    const c = d.id ? await assertCanManageUser(d.id) : await ctx();
    const phone = d.phone ? normalisePhone(d.phone) : null;
    if (d.phone && !phone) throw new UserError("That phone number doesn't look right.");
    const values = { name: d.name, phone, email: d.email?.toLowerCase() ?? null };
    if (d.id) {
      await db
        .update(s.users)
        .set({ ...values, isActive: d.isActive ?? true, ...(d.password ? { passwordHash: await hashPassword(d.password) } : {}) })
        .where(eq(s.users.id, d.id));
      await writeAudit(db, { actorUserId: c.user.id, entity: "user", entityId: d.id, action: "update", after: { ...values, isActive: d.isActive } });
      revalidatePath("/admin/users");
      return "Saved";
    }
    if (!c.access.isSystemAdmin) {
      if (!d.parishId || !canAdminParish(c.access, d.parishId)) throw new ForbiddenError("You can only add people to your parish.");
      if (!d.role || !PARISH_ROLES.includes(d.role)) throw new UserError("Choose a parish role for this person.");
    }
    if (!d.password) throw new UserError("Set a starting password (they can be sent a sign-in link instead if they have email).");
    const userId = await db.transaction(async (tx) => {
      const [u] = await tx.insert(s.users).values({ ...values, passwordHash: await hashPassword(d.password!) }).returning();
      if (d.role && d.parishId) {
        if (d.role === "HOD" && !d.departmentId) throw new UserError("Choose the department this HOD leads.");
        const [ra] = await tx
          .insert(s.roleAssignments)
          .values({ userId: u.id, role: d.role, scopeLevel: "PARISH", scopeId: d.parishId, departmentId: d.role === "HOD" ? d.departmentId : null, startsOn: todayIso() })
          .returning();
        await writeAudit(tx, { actorUserId: c.user.id, entity: "role_assignment", entityId: ra.id, action: "grant", after: ra });
      }
      await writeAudit(tx, { actorUserId: c.user.id, entity: "user", entityId: u.id, action: "create", after: values });
      return u.id;
    });
    revalidatePath("/admin/users");
    return { message: `${d.name} added`, data: { userId } };
  });
}

const SCOPE_FOR_ROLE: Record<s.Role, s.ScopeLevel[]> = {
  USHER: ["PARISH"],
  HEAD_USHER: ["PARISH"],
  SECRETARY: ["PARISH"],
  HOD: ["PARISH"],
  TRIBE_LEADER: ["PARISH"],
  PARISH_PASTOR: ["PARISH"],
  AREA_PASTOR: ["AREA"],
  ZONAL_PASTOR: ["ZONE"],
  PROVINCIAL_ADMIN: ["PROVINCE", "REGION"],
  SYSTEM_ADMIN: ["GLOBAL"],
};

const roleSchema = z.object({
  userId: uuid(),
  role: z.enum(s.roleEnum.enumValues),
  scopeId: optionalUuid(),
  scopeLevel: z.enum(s.scopeLevelEnum.enumValues),
  departmentId: optionalUuid(),
  smallGroupId: optionalUuid(),
  startsOn: isoDate(),
  endsOn: optionalText().pipe(z.iso.date().nullable()),
});

export async function addRoleAssignment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(roleSchema, fd, async (d) => {
    const c = await ctx();
    if (!SCOPE_FOR_ROLE[d.role].includes(d.scopeLevel)) throw new UserError("That role doesn't fit that level.");
    if (d.scopeLevel !== "GLOBAL" && !d.scopeId) throw new UserError("Choose where this role applies.");
    if (!c.access.isSystemAdmin) {
      // Parish pastors may grant parish-level roles in their own parish only.
      if (d.scopeLevel !== "PARISH" || !d.scopeId || !canAdminParish(c.access, d.scopeId) || !PARISH_ROLES.includes(d.role))
        throw new ForbiddenError("You can only give parish roles in your own parish.");
    }
    if (d.role === "HOD" && !d.departmentId) throw new UserError("Choose the department this HOD leads.");
    if (d.role === "TRIBE_LEADER" && !d.smallGroupId) throw new UserError("Choose the tribe this person leads.");
    const [ra] = await db
      .insert(s.roleAssignments)
      .values({
        userId: d.userId,
        role: d.role,
        scopeLevel: d.scopeLevel,
        scopeId: d.scopeLevel === "GLOBAL" ? null : d.scopeId,
        departmentId: d.role === "HOD" ? d.departmentId : null,
        smallGroupId: d.role === "TRIBE_LEADER" ? d.smallGroupId : null,
        startsOn: d.startsOn,
        endsOn: d.endsOn,
      })
      .returning();
    await writeAudit(db, { actorUserId: c.user.id, entity: "role_assignment", entityId: ra.id, action: "grant", after: ra });
    revalidatePath("/admin/users");
    return "Role added";
  });
}

export async function endRoleAssignment(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(z.object({ id: uuid() }), fd, async ({ id }) => {
    const c = await ctx();
    const [ra] = await db.select().from(s.roleAssignments).where(eq(s.roleAssignments.id, id));
    if (!ra) throw new UserError("Role not found.");
    const allowed =
      c.access.isSystemAdmin || (ra.scopeLevel === "PARISH" && ra.scopeId && canAdminParish(c.access, ra.scopeId) && PARISH_ROLES.includes(ra.role));
    if (!allowed) throw new ForbiddenError();
    if (ra.userId === c.user.id && (ra.role === "SYSTEM_ADMIN" || ra.role === "PARISH_PASTOR"))
      throw new UserError("You can't remove your own admin role. Ask another administrator.");
    const endsOn = addDays(todayIso(), -1);
    await db.update(s.roleAssignments).set({ endsOn }).where(eq(s.roleAssignments.id, id));
    await writeAudit(db, { actorUserId: c.user.id, entity: "role_assignment", entityId: id, action: "end", before: ra, after: { ...ra, endsOn } });
    revalidatePath("/admin/users");
    return "Role ended";
  });
}

// ---------------------------------------------------------------------------
// Remittance (status only in v1)
// ---------------------------------------------------------------------------

const pct = () => z.coerce.number().min(0).max(100);
const policySchema = z
  .object({
    scopeLevel: z.enum(["GLOBAL", "REGION", "PROVINCE", "ZONE"]),
    scopeId: optionalUuid(),
    effectiveFrom: isoDate(),
    parishPct: pct(),
    areaPct: pct(),
    zonePct: pct(),
    provincePct: pct(),
    nationalPct: pct(),
  })
  .superRefine((d, ctx) => {
    const sum = Math.round((d.parishPct + d.areaPct + d.zonePct + d.provincePct + d.nationalPct) * 100);
    if (sum !== 10000) ctx.addIssue({ code: "custom", path: ["nationalPct"], message: "The five shares must add up to 100%" });
    if (d.scopeLevel !== "GLOBAL" && !d.scopeId) ctx.addIssue({ code: "custom", path: ["scopeId"], message: "Choose where this applies" });
  });

export async function saveRemittancePolicy(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(policySchema, fd, async (d) => {
    const c = await assertSystemAdmin();
    const [row] = await db
      .insert(s.remittancePolicies)
      .values({
        scopeLevel: d.scopeLevel,
        scopeId: d.scopeLevel === "GLOBAL" ? null : d.scopeId,
        effectiveFrom: d.effectiveFrom,
        parishPct: d.parishPct.toFixed(2),
        areaPct: d.areaPct.toFixed(2),
        zonePct: d.zonePct.toFixed(2),
        provincePct: d.provincePct.toFixed(2),
        nationalPct: d.nationalPct.toFixed(2),
      })
      .returning();
    await writeAudit(db, { actorUserId: c.user.id, entity: "remittance_policy", entityId: row.id, action: "create", after: row });
    revalidatePath("/admin/remittance");
    return "Split saved";
  });
}

const money = (label: string) =>
  z.string().transform((v, ctx) => {
    const k = parseNairaToKobo(v);
    if (k === null || Number.isNaN(k)) {
      ctx.addIssue({ code: "custom", message: `Enter the ${label} in naira` });
      return z.NEVER;
    }
    return k;
  });

const remittanceSchema = z.object({
  parishId: uuid(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/, "Choose a month"),
  amountDue: money("amount due"),
  amountPaid: money("amount paid"),
});

export async function saveRemittance(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(remittanceSchema, fd, async (d) => {
    const c = await ctx();
    if (!c.access.overviewParishIds.includes(d.parishId)) throw new ForbiddenError("That parish is outside your scope.");
    const periodMonth = `${d.periodMonth}-01`;
    const status: s.RemittanceStatus =
      d.amountPaid >= d.amountDue && d.amountDue > 0 ? "CLEARED" : d.amountPaid > 0 ? "PARTIAL" : d.amountDue === 0 ? "CLEARED" : "OUTSTANDING";
    const [before] = await db
      .select()
      .from(s.remittances)
      .where(and(eq(s.remittances.parishId, d.parishId), eq(s.remittances.periodMonth, periodMonth)));
    const values = {
      amountDueKobo: d.amountDue,
      amountPaidKobo: d.amountPaid,
      status,
      clearedAt: status === "CLEARED" ? (before?.clearedAt ?? new Date()) : null,
    };
    const [row] = await db
      .insert(s.remittances)
      .values({ parishId: d.parishId, periodMonth, ...values })
      .onConflictDoUpdate({ target: [s.remittances.parishId, s.remittances.periodMonth], set: values })
      .returning();
    await writeAudit(db, { actorUserId: c.user.id, entity: "remittance", entityId: row.id, action: before ? "update" : "create", before: before ?? null, after: row });
    revalidatePath("/admin/remittance");
    revalidatePath("/zone");
    return `Remittance ${status === "CLEARED" ? "cleared" : status === "PARTIAL" ? "part-paid" : "outstanding"}`;
  });
}

