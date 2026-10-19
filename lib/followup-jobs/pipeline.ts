import "server-only";
import { and, asc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { addDays, diffDays, lagosDateTime, todayIso } from "@/lib/dates";
import { db, type DbOrTx } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { queueMessage, queueWelcome, TEMPLATES } from "@/lib/followup";

/** How far back the daily job looks; anyone older has finished the 30-day pipeline. */
const WINDOW_DAYS = 45;

export type PipelineResult = { welcomes: number; callTasks: number; tribeInvites: number; classInvites: number; promoted: number; flagged: number };

async function followUpAssignee(tx: DbOrTx, parishId: string, today: string): Promise<string | null> {
  const [p] = await tx.select({ lead: s.parishes.followUpLeadUserId }).from(s.parishes).where(eq(s.parishes.id, parishId));
  if (p?.lead) return p.lead;
  return pastorOf(tx, parishId, today);
}

async function pastorOf(tx: DbOrTx, parishId: string, today: string): Promise<string | null> {
  const [pastor] = await tx
    .select({ id: s.roleAssignments.userId })
    .from(s.roleAssignments)
    .where(
      and(
        eq(s.roleAssignments.role, "PARISH_PASTOR"),
        eq(s.roleAssignments.scopeLevel, "PARISH"),
        eq(s.roleAssignments.scopeId, parishId),
        lte(s.roleAssignments.startsOn, today),
        or(isNull(s.roleAssignments.endsOn), gte(s.roleAssignments.endsOn, today)),
      ),
    )
    .orderBy(asc(s.roleAssignments.startsOn))
    .limit(1);
  return pastor?.id ?? null;
}

async function addTask(tx: DbOrTx, values: typeof s.tasks.$inferInsert) {
  const rows = await tx.insert(s.tasks).values(values).onConflictDoNothing({ target: s.tasks.dedupeKey }).returning({ id: s.tasks.id });
  return rows.length > 0;
}

/**
 * Spec §7.5 daily pipeline. Every step is idempotent (dedupe keys / status checks), and steps that
 * were missed because the job didn't run are caught up on the next run.
 */
export async function runFollowUpPipeline(tx: DbOrTx = db, today = todayIso()): Promise<PipelineResult> {
  const result: PipelineResult = { welcomes: 0, callTasks: 0, tribeInvites: 0, classInvites: 0, promoted: 0, flagged: 0 };
  const people = await tx
    .select({ member: s.members, parishName: s.parishes.name })
    .from(s.members)
    .innerJoin(s.parishes, eq(s.parishes.id, s.members.parishId))
    .where(and(eq(s.members.status, "FIRST_TIMER"), gte(s.members.firstVisitOn, addDays(today, -WINDOW_DAYS)), lte(s.members.firstVisitOn, today)));

  for (const { member: m, parishName } of people) {
    const first = m.firstVisitOn!;
    const day = diffDays(today, first);
    const name = `${m.firstName} ${m.lastName}`.trim();

    // Day 0: welcome message (consent only).
    if (await queueWelcome(tx, m, parishName, first)) result.welcomes++;

    // Day 3: call task for the follow-up lead.
    if (day >= 3 && day < 30) {
      const assignee = await followUpAssignee(tx, m.parishId, today);
      if (
        assignee &&
        (await addTask(tx, {
          parishId: m.parishId,
          memberId: m.id,
          kind: "FOLLOW_UP",
          title: `Call ${name}, capture prayer points`,
          description: m.consentContact ? null : "They didn't agree to messages. A short welcome call is fine; ask before adding them to any list.",
          priority: "HIGH",
          assignedTo: assignee,
          dueAt: lagosDateTime(addDays(first, 3), "18:00"),
          dedupeKey: `followup:day3:${m.id}`,
        }))
      )
        result.callTasks++;
    }

    // Day 7: invite to the tribe they chose (or the parish's first active tribe).
    if (day >= 7 && day < 30 && m.consentContact) {
      const [group] = await tx
        .select({ name: s.smallGroups.name, landmark: s.smallGroups.landmark })
        .from(s.smallGroups)
        .leftJoin(s.smallGroupMemberships, and(eq(s.smallGroupMemberships.smallGroupId, s.smallGroups.id), eq(s.smallGroupMemberships.memberId, m.id)))
        .where(and(eq(s.smallGroups.parishId, m.parishId), eq(s.smallGroups.isActive, true)))
        .orderBy(sql`${s.smallGroupMemberships.id} is null`, asc(s.smallGroups.name))
        .limit(1);
      if (group && (await queueMessage(tx, m, "tribeInvite", TEMPLATES.tribeInvite(m.firstName, group.name, group.landmark ?? "")))) result.tribeInvites++;
    }

    // Day 14: Believers' Class invite.
    if (day >= 14 && day < 30 && m.consentContact) {
      if (await queueMessage(tx, m, "believersClass", TEMPLATES.believersClass(m.firstName))) result.classInvites++;
    }

    // Day 30: 3+ visits in the first 30 days -> regular member; otherwise flag for the pastor.
    if (day >= 30) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(s.attendanceCheckins)
        .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.attendanceCheckins.serviceEventId))
        .where(and(eq(s.attendanceCheckins.memberId, m.id), gte(s.serviceEvents.eventDate, first), lte(s.serviceEvents.eventDate, addDays(first, 29))));
      if (n >= 3) {
        const updated = await tx
          .update(s.members)
          .set({ status: "REGULAR_MEMBER" })
          .where(and(eq(s.members.id, m.id), eq(s.members.status, "FIRST_TIMER")))
          .returning({ id: s.members.id });
        if (updated.length) {
          await writeAudit(tx, { actorUserId: null, entity: "member", entityId: m.id, action: "promote_regular", before: { status: "FIRST_TIMER" }, after: { status: "REGULAR_MEMBER", visits: n } });
          result.promoted++;
        }
      } else {
        const pastor = await pastorOf(tx, m.parishId, today);
        if (
          pastor &&
          (await addTask(tx, {
            parishId: m.parishId,
            memberId: m.id,
            kind: "FOLLOW_UP",
            title: `Pastoral follow-up: ${name}`,
            description: `Came ${n} time${n === 1 ? "" : "s"} in their first 30 days.`,
            priority: "MEDIUM",
            assignedTo: pastor,
            dueAt: lagosDateTime(addDays(first, 37), "18:00"),
            dedupeKey: `followup:day30:${m.id}`,
          }))
        )
          result.flagged++;
      }
    }
  }
  return result;
}

/** Stub sender: "sends" due messages by logging them. Replace with an SMS/WhatsApp gateway later. */
export async function sendDueMessages(tx: DbOrTx = db, limit = 100) {
  const due = await tx
    .select()
    .from(s.outboundMessages)
    .where(and(eq(s.outboundMessages.status, "QUEUED"), lte(s.outboundMessages.scheduledFor, new Date())))
    .orderBy(asc(s.outboundMessages.scheduledFor))
    .limit(limit)
    .for("update", { skipLocked: true });
  for (const msg of due) {
    console.info(`[stub-sender] ${msg.channel} to ${msg.toPhone ?? msg.toEmail}: ${msg.body}`);
    await tx
      .update(s.outboundMessages)
      .set({ status: "SENT", sentAt: new Date(), gatewayResponse: { stub: true } })
      .where(eq(s.outboundMessages.id, msg.id));
  }
  return due.length;
}
