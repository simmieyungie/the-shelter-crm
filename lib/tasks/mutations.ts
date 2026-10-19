import "server-only";
import { and, eq } from "drizzle-orm";
import { canManageDepartmentTasks, ForbiddenError } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { assignableUsers } from "@/lib/db/queries/tasks";
import { UserError } from "@/lib/forms";

export type TaskInput = {
  id: string | null;
  parishId: string;
  title: string;
  description: string | null;
  departmentId: string | null;
  serviceEventId: string | null;
  assignedTo: string;
  priority: s.TaskPriority;
  dueAt: Date;
};

/** Create or edit a task. HODs only within their departments; the pastor anywhere in the parish. */
export async function saveTask(access: Access, userId: string, input: TaskInput) {
  if (!canManageDepartmentTasks(access, input.parishId, input.departmentId)) {
    throw new ForbiddenError(input.departmentId ? "You can only assign tasks in your own department." : "Choose your department.");
  }
  const allowed = await assignableUsers(access, input.parishId);
  const target = allowed.find((u) => u.id === input.assignedTo);
  if (!target || (target.departmentIds && input.departmentId && !target.departmentIds.includes(input.departmentId))) {
    throw new ForbiddenError("That person isn't in this department.");
  }
  if (input.departmentId) {
    const [d] = await db.select().from(s.departments).where(and(eq(s.departments.id, input.departmentId), eq(s.departments.parishId, input.parishId)));
    if (!d) throw new UserError("Choose a department in this parish.");
  }
  if (input.serviceEventId) {
    const [e] = await db.select().from(s.serviceEvents).where(and(eq(s.serviceEvents.id, input.serviceEventId), eq(s.serviceEvents.parishId, input.parishId)));
    if (!e) throw new UserError("Choose a service in this parish.");
  }
  const values = {
    title: input.title,
    description: input.description,
    departmentId: input.departmentId,
    serviceEventId: input.serviceEventId,
    assignedTo: input.assignedTo,
    priority: input.priority,
    dueAt: input.dueAt,
  };
  if (input.id) {
    const [existing] = await db.select().from(s.tasks).where(and(eq(s.tasks.id, input.id), eq(s.tasks.parishId, input.parishId)));
    if (!existing) throw new UserError("Task not found.");
    if (!canManageDepartmentTasks(access, input.parishId, existing.departmentId)) throw new ForbiddenError("You can only edit tasks in your own department.");
    await db.update(s.tasks).set(values).where(eq(s.tasks.id, input.id));
    return input.id;
  }
  const [row] = await db.insert(s.tasks).values({ ...values, parishId: input.parishId, assignedBy: userId, kind: "OPERATIONS" }).returning({ id: s.tasks.id });
  return row.id;
}

/** Assignees can move their own tasks; managers can move any in their departments. */
export async function moveTask(access: Access, userId: string, taskId: string, status: s.TaskStatus) {
  const [t] = await db.select().from(s.tasks).where(eq(s.tasks.id, taskId));
  if (!t || !access.parishIds.includes(t.parishId)) throw new UserError("Task not found.");
  const manager = canManageDepartmentTasks(access, t.parishId, t.departmentId);
  if (!manager && t.assignedTo !== userId) throw new ForbiddenError("Only the person assigned or their HOD can move this task.");
  if (status === "CANCELLED" && !manager) throw new ForbiddenError("Only the HOD or pastor can cancel a task.");
  await db
    .update(s.tasks)
    .set({ status, completedAt: status === "DONE" ? (t.completedAt ?? new Date()) : null })
    .where(eq(s.tasks.id, taskId));
}
