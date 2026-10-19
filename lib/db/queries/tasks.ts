import "server-only";
import { aliasedTable, and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { assertParish, can, canManageDepartmentTasks } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/scope";
import { addDays, todayIso } from "@/lib/dates";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";

/** Overdue is computed, never stored (spec §5.8). */
export const overdueSql = sql<boolean>`(${s.tasks.status} not in ('DONE','CANCELLED') and ${s.tasks.dueAt} < now())`;

export function isOverdue(t: { status: s.TaskStatus; dueAt: Date }, now = new Date()) {
  return t.status !== "DONE" && t.status !== "CANCELLED" && t.dueAt.getTime() < now.getTime();
}

/** Who sees what: pastor sees everything; HODs their departments; everyone their own tasks. */
function visibility(access: Access, userId: string, parishId: string): SQL | undefined {
  if (can(access, "manageAllTasks", parishId)) return undefined;
  const depts = access.hodDepartmentsByParish[parishId] ?? [];
  return or(eq(s.tasks.assignedTo, userId), eq(s.tasks.assignedBy, userId), depts.length ? inArray(s.tasks.departmentId, depts) : undefined);
}

const assignee = aliasedTable(s.users, "assignee");

export type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  priority: s.TaskPriority;
  status: s.TaskStatus;
  kind: "OPERATIONS" | "FOLLOW_UP";
  dueAt: string;
  overdue: boolean;
  departmentId: string | null;
  departmentName: string | null;
  serviceEventId: string | null;
  assignedTo: string;
  assigneeName: string;
  memberId: string | null;
  canManage: boolean;
  canMove: boolean;
};

export async function getBoard(access: Access, userId: string, parishId: string, opts: { departmentId?: string; eventId?: string }) {
  assertParish(access, parishId);
  const rows = await db
    .select({ task: s.tasks, departmentName: s.departments.name, assigneeName: assignee.name, overdue: overdueSql })
    .from(s.tasks)
    .innerJoin(assignee, eq(assignee.id, s.tasks.assignedTo))
    .leftJoin(s.departments, eq(s.departments.id, s.tasks.departmentId))
    .where(
      and(
        eq(s.tasks.parishId, parishId),
        sql`${s.tasks.status} <> 'CANCELLED'`,
        // Done tasks drop off the board after 14 days.
        or(sql`${s.tasks.status} <> 'DONE'`, gte(s.tasks.completedAt, new Date(Date.now() - 14 * 86_400_000))),
        opts.departmentId === "followup" ? eq(s.tasks.kind, "FOLLOW_UP") : opts.departmentId ? eq(s.tasks.departmentId, opts.departmentId) : undefined,
        opts.eventId ? eq(s.tasks.serviceEventId, opts.eventId) : undefined,
        visibility(access, userId, parishId),
      ),
    )
    .orderBy(asc(s.tasks.dueAt));

  const tasks: BoardTask[] = rows.map(({ task: t, departmentName, assigneeName, overdue }) => {
    const canManage = canManageDepartmentTasks(access, parishId, t.departmentId);
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      kind: t.kind,
      dueAt: t.dueAt.toISOString(),
      overdue,
      departmentId: t.departmentId,
      departmentName,
      serviceEventId: t.serviceEventId,
      assignedTo: t.assignedTo,
      assigneeName,
      memberId: t.memberId,
      canManage,
      canMove: canManage || t.assignedTo === userId,
    };
  });
  return tasks;
}

/** Departments the user can create tasks in, with the people who can be assigned. */
export async function taskFormOptions(access: Access, parishId: string) {
  const all = can(access, "manageAllTasks", parishId);
  const deptIds = all ? null : (access.hodDepartmentsByParish[parishId] ?? []);
  const departments = await db
    .select({ id: s.departments.id, name: s.departments.name })
    .from(s.departments)
    .where(and(eq(s.departments.parishId, parishId), deptIds ? (deptIds.length ? inArray(s.departments.id, deptIds) : sql`false`) : undefined))
    .orderBy(asc(s.departments.name));
  const assignees = await assignableUsers(access, parishId);
  const today = todayIso();
  const events = await db
    .select({ id: s.serviceEvents.id, date: s.serviceEvents.eventDate, name: s.serviceTypes.name, occurrence: s.serviceEvents.occurrence })
    .from(s.serviceEvents)
    .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
    .where(and(eq(s.serviceEvents.parishId, parishId), gte(s.serviceEvents.eventDate, addDays(today, -7)), lte(s.serviceEvents.eventDate, addDays(today, 21))))
    .orderBy(asc(s.serviceEvents.eventDate), asc(s.serviceEvents.startTime));
  return { departments, assignees, events, canCreate: all || (deptIds?.length ?? 0) > 0 };
}

/**
 * People a task can go to. Pastor: anyone with a role in the parish. HOD: active members of their
 * departments who have an account, plus themselves.
 */
export async function assignableUsers(access: Access, parishId: string) {
  const today = todayIso();
  const parishUsers = await db
    .selectDistinct({ id: s.users.id, name: s.users.name, memberId: s.users.memberId })
    .from(s.users)
    .innerJoin(s.roleAssignments, eq(s.roleAssignments.userId, s.users.id))
    .where(
      and(
        eq(s.roleAssignments.scopeLevel, "PARISH"),
        eq(s.roleAssignments.scopeId, parishId),
        lte(s.roleAssignments.startsOn, today),
        or(isNull(s.roleAssignments.endsOn), gte(s.roleAssignments.endsOn, today)),
        eq(s.users.isActive, true),
      ),
    )
    .orderBy(asc(s.users.name));
  if (can(access, "manageAllTasks", parishId)) return parishUsers.map((u) => ({ id: u.id, name: u.name, departmentIds: null as string[] | null }));

  const depts = access.hodDepartmentsByParish[parishId] ?? [];
  const memberships = depts.length
    ? await db
        .select({ memberId: s.departmentMemberships.memberId, departmentId: s.departmentMemberships.departmentId })
        .from(s.departmentMemberships)
        .where(and(inArray(s.departmentMemberships.departmentId, depts), eq(s.departmentMemberships.isActive, true)))
    : [];
  return parishUsers
    .map((u) => ({
      id: u.id,
      name: u.name,
      departmentIds: u.id === access.userId ? depts : memberships.filter((m) => m.memberId === u.memberId).map((m) => m.departmentId),
    }))
    .filter((u) => u.departmentIds.length > 0);
}

export async function boardEvents(parishId: string) {
  return db
    .selectDistinct({ id: s.serviceEvents.id, date: s.serviceEvents.eventDate, name: s.serviceTypes.name })
    .from(s.tasks)
    .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.tasks.serviceEventId))
    .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
    .where(and(eq(s.tasks.parishId, parishId), sql`${s.tasks.status} <> 'CANCELLED'`))
    .orderBy(desc(s.serviceEvents.eventDate))
    .limit(20);
}
