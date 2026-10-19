"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireParishContext } from "@/lib/auth/context";
import { assertCan } from "@/lib/auth/permissions";
import { todayIso } from "@/lib/dates";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { type ActionState, int, isoDate, optionalText, runAction, UserError, uuid } from "@/lib/forms";

const schema = z.object({
  serviceTypeId: uuid(),
  eventDate: isoDate(),
  occurrence: int(1).default(1),
  preacher: optionalText(),
});

/** Spec §7.3: open the existing report for (parish, type, date, occurrence) or create a manual one. */
export async function createPastService(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let target: string | null = null;
  const result = await runAction(schema, fd, async (d) => {
    const { access, parish, user } = await requireParishContext();
    assertCan(access, "addPastService", parish.id, "You can't add past services.");
    if (d.eventDate > todayIso()) throw new UserError("Choose a date in the past. Future services are counted on the day.");
    const [type] = await db.select().from(s.serviceTypes).where(and(eq(s.serviceTypes.id, d.serviceTypeId), eq(s.serviceTypes.parishId, parish.id)));
    if (!type) throw new UserError("Choose a service.");
    if (d.occurrence > type.maxPerDay) throw new UserError(`${type.name} can only hold ${type.maxPerDay === 1 ? "once" : `${type.maxPerDay} times`} a day. Change this in Parish setup if needed.`);

    target = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ event: s.serviceEvents, reportId: s.serviceReports.id })
        .from(s.serviceEvents)
        .leftJoin(s.serviceReports, eq(s.serviceReports.serviceEventId, s.serviceEvents.id))
        .where(
          and(
            eq(s.serviceEvents.parishId, parish.id),
            eq(s.serviceEvents.serviceTypeId, type.id),
            eq(s.serviceEvents.eventDate, d.eventDate),
            eq(s.serviceEvents.occurrence, d.occurrence),
          ),
        );
      if (existing?.reportId) return existing.reportId;
      const event =
        existing?.event ??
        (
          await tx
            .insert(s.serviceEvents)
            .values({ parishId: parish.id, serviceTypeId: type.id, eventDate: d.eventDate, startTime: type.startTime, occurrence: d.occurrence, preacher: d.preacher })
            .returning()
        )[0];
      if (d.preacher && existing?.event) await tx.update(s.serviceEvents).set({ preacher: d.preacher }).where(eq(s.serviceEvents.id, event.id));
      const [report] = await tx
        .insert(s.serviceReports)
        .values({ serviceEventId: event.id, source: "MANUAL", status: "DRAFT", draftedBy: user.id })
        .returning();
      await writeAudit(tx, { actorUserId: user.id, entity: "service_report", entityId: report.id, action: "create_past", after: report });
      return report.id;
    });
  });
  if (target) redirect(`/reports/${target}`);
  return result;
}
