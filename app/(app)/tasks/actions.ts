"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireParishContext } from "@/lib/auth/context";
import { lagosDateTime } from "@/lib/dates";
import { taskPriorityEnum, taskStatusEnum } from "@/lib/db/schema";
import { type ActionState, isoDate, optionalText, optionalUuid, runAction, text, time, uuid } from "@/lib/forms";
import { moveTask, saveTask } from "@/lib/tasks/mutations";

const taskSchema = z.object({
  id: optionalUuid(),
  title: text().pipe(z.string().max(200)),
  description: optionalText(),
  departmentId: optionalUuid(),
  serviceEventId: optionalUuid(),
  assignedTo: uuid(),
  priority: z.enum(taskPriorityEnum.enumValues),
  dueDate: isoDate(),
  dueTime: time(),
});

export async function saveTaskAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(taskSchema, fd, async (d) => {
    const { access, parish, user } = await requireParishContext();
    await saveTask(access, user.id, {
      id: d.id,
      parishId: parish.id,
      title: d.title,
      description: d.description,
      departmentId: d.departmentId,
      serviceEventId: d.serviceEventId,
      assignedTo: d.assignedTo,
      priority: d.priority,
      dueAt: lagosDateTime(d.dueDate, d.dueTime),
    });
    revalidatePath("/tasks");
    return d.id ? "Task updated" : "Task created";
  });
}

/** Called from drag-and-drop and the card menu. */
export async function moveTaskAction(taskId: string, status: string): Promise<ActionState> {
  const fd = new FormData();
  fd.set("taskId", taskId);
  fd.set("status", status);
  return runAction(z.object({ taskId: uuid(), status: z.enum(taskStatusEnum.enumValues) }), fd, async (d) => {
    const { access, user } = await requireParishContext();
    await moveTask(access, user.id, d.taskId, d.status);
    revalidatePath("/tasks");
    return "Moved";
  });
}
