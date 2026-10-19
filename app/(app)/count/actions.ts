"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireParishContext } from "@/lib/auth/context";
import { assertCan, ForbiddenError } from "@/lib/auth/permissions";
import { todayIso } from "@/lib/dates";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { type ActionState, checkbox, runAction, UserError, uuid } from "@/lib/forms";

/** Head Usher/Pastor: hold an extra or special service today. */
export async function addServiceToday(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(z.object({ serviceTypeId: uuid() }), fd, async ({ serviceTypeId }) => {
    const { access, parish } = await requireParishContext();
    assertCan(access, "manageRoster", parish.id, "Only the Head Usher or Pastor can add a service.");
    const [type] = await db.select().from(s.serviceTypes).where(and(eq(s.serviceTypes.id, serviceTypeId), eq(s.serviceTypes.parishId, parish.id)));
    if (!type) throw new UserError("Choose a service.");
    const today = todayIso();
    const [{ top }] = await db
      .select({ top: max(s.serviceEvents.occurrence) })
      .from(s.serviceEvents)
      .where(and(eq(s.serviceEvents.serviceTypeId, type.id), eq(s.serviceEvents.eventDate, today)));
    const occurrence = (top ?? 0) + 1;
    if (occurrence > type.maxPerDay)
      throw new UserError(
        type.maxPerDay === 1
          ? `${type.name} already holds once today. To run it twice, raise "times it can hold on one day" in Parish setup.`
          : `${type.name} already holds ${type.maxPerDay} times today, which is the limit set in Parish setup.`,
      );
    await db.insert(s.serviceEvents).values({ parishId: parish.id, serviceTypeId: type.id, eventDate: today, startTime: type.startTime, occurrence });
    revalidatePath("/count");
    return `${type.name} added for today`;
  });
}

const assignSchema = z.object({ serviceEventId: uuid(), sanctuaryZoneId: uuid(), userId: uuid(), isLead: checkbox() });

export async function assignUsher(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(assignSchema, fd, async (d) => {
    const { access } = await requireParishContext();
    const [ev] = await db.select({ parishId: s.serviceEvents.parishId }).from(s.serviceEvents).where(eq(s.serviceEvents.id, d.serviceEventId));
    if (!ev) throw new UserError("Service not found.");
    assertCan(access, "manageRoster", ev.parishId);
    const [zone] = await db.select({ id: s.sanctuaryZones.id }).from(s.sanctuaryZones).where(and(eq(s.sanctuaryZones.id, d.sanctuaryZoneId), eq(s.sanctuaryZones.parishId, ev.parishId)));
    if (!zone) throw new UserError("Choose a zone in this parish.");
    await db
      .insert(s.usherAssignments)
      .values(d)
      .onConflictDoUpdate({ target: [s.usherAssignments.serviceEventId, s.usherAssignments.userId], set: { sanctuaryZoneId: d.sanctuaryZoneId, isLead: d.isLead } });
    revalidatePath("/count/roster");
    return "Usher assigned";
  });
}

export async function removeUsher(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(z.object({ id: uuid() }), fd, async ({ id }) => {
    const { access } = await requireParishContext();
    const [row] = await db
      .select({ parishId: s.serviceEvents.parishId })
      .from(s.usherAssignments)
      .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.usherAssignments.serviceEventId))
      .where(eq(s.usherAssignments.id, id));
    if (!row) throw new UserError("Already removed.");
    if (!access.rolesByParish[row.parishId]) throw new ForbiddenError();
    assertCan(access, "manageRoster", row.parishId);
    await db.delete(s.usherAssignments).where(eq(s.usherAssignments.id, id));
    revalidatePath("/count/roster");
    return "Removed from roster";
  });
}
