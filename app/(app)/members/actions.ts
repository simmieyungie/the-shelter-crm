"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { requireParishContext } from "@/lib/auth/context";
import { assertCan, ForbiddenError } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { queueWelcome } from "@/lib/followup";
import { type ActionState, checkbox, optionalText, optionalUuid, runAction, text, UserError, uuid } from "@/lib/forms";
import { normalisePhone } from "@/lib/phone";

const memberSchema = z.object({
  id: optionalUuid(),
  firstName: text(),
  lastName: optionalText(),
  phone: optionalText(),
  whatsappPhone: optionalText(),
  email: optionalText().pipe(z.email("Enter a valid email").nullable()),
  gender: z.preprocess((v) => (v === "" ? null : v), z.enum(["MALE", "FEMALE"]).nullable()),
  dateOfBirth: optionalText().pipe(z.iso.date().nullable()),
  address: optionalText(),
  status: z.enum(s.memberStatusEnum.enumValues),
  firstVisitOn: optionalText().pipe(z.iso.date().nullable()),
  consentContact: checkbox(),
  smallGroupId: optionalUuid(),
});

function phoneOrError(v: string | null, label: string) {
  if (!v) return null;
  const p = normalisePhone(v);
  if (!p) throw new UserError(`The ${label} doesn't look right.`);
  return p;
}

export async function saveMember(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let createdId: string | null = null;
  const result = await runAction(memberSchema, fd, async (d) => {
    const { access, parish, user } = await requireParishContext();
    assertCan(access, "editMembers", parish.id, "Only the Secretary, Head Usher or Pastor can edit member records.");
    const values = {
      firstName: d.firstName,
      lastName: d.lastName ?? "",
      phone: phoneOrError(d.phone, "phone number"),
      whatsappPhone: phoneOrError(d.whatsappPhone, "WhatsApp number"),
      email: d.email?.toLowerCase() ?? null,
      gender: d.gender,
      dateOfBirth: d.dateOfBirth,
      address: d.address,
      status: d.status,
      firstVisitOn: d.firstVisitOn ?? (d.status === "FIRST_TIMER" && !d.id ? new Date().toISOString().slice(0, 10) : null),
      consentContact: d.consentContact,
    };
    if (values.status === "FIRST_TIMER" && !values.phone) throw new UserError("First-timers need a phone number so the follow-up team can call.");
    await db.transaction(async (tx) => {
      if (d.id) {
        const [before] = await tx.select().from(s.members).where(and(eq(s.members.id, d.id), eq(s.members.parishId, parish.id)));
        if (!before) throw new UserError("Member not found.");
        await tx.update(s.members).set(values).where(eq(s.members.id, d.id));
        await writeAudit(tx, { actorUserId: user.id, entity: "member", entityId: d.id, action: "update", before, after: values });
      } else {
        const [m] = await tx.insert(s.members).values({ ...values, parishId: parish.id }).returning();
        createdId = m.id;
        if (m.status === "FIRST_TIMER" && m.firstVisitOn) await queueWelcome(tx, m, parish.name, m.firstVisitOn);
        await writeAudit(tx, { actorUserId: user.id, entity: "member", entityId: m.id, action: "create", after: values });
      }
      const memberId = d.id ?? createdId!;
      if (d.smallGroupId) {
        const [g] = await tx.select().from(s.smallGroups).where(and(eq(s.smallGroups.id, d.smallGroupId), eq(s.smallGroups.parishId, parish.id)));
        if (!g) throw new UserError("Choose a tribe in this parish.");
        await tx.insert(s.smallGroupMemberships).values({ smallGroupId: g.id, memberId, joinedOn: new Date().toISOString().slice(0, 10) }).onConflictDoUpdate({ target: [s.smallGroupMemberships.smallGroupId, s.smallGroupMemberships.memberId], set: { isActive: true } });
      }
    });
    revalidatePath("/members");
    return d.id ? "Saved" : `${d.firstName} added`;
  });
  if (createdId) redirect(`/members/${createdId}`);
  return result;
}

const milestoneSchema = z.object({ memberId: uuid(), milestone: z.enum(s.milestoneEnum.enumValues), done: checkbox(), completedOn: optionalText().pipe(z.iso.date().nullable()) });

export async function setMilestone(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(milestoneSchema, fd, async (d) => {
    const { access, parish, user } = await requireParishContext();
    assertCan(access, "editMembers", parish.id);
    const [m] = await db.select({ parishId: s.members.parishId }).from(s.members).where(eq(s.members.id, d.memberId));
    if (!m || m.parishId !== parish.id) throw new ForbiddenError();
    if (d.done) {
      await db
        .insert(s.memberMilestones)
        .values({ memberId: d.memberId, milestone: d.milestone, completedOn: d.completedOn })
        .onConflictDoUpdate({ target: [s.memberMilestones.memberId, s.memberMilestones.milestone], set: { completedOn: d.completedOn } });
    } else {
      await db.delete(s.memberMilestones).where(and(eq(s.memberMilestones.memberId, d.memberId), eq(s.memberMilestones.milestone, d.milestone)));
    }
    await writeAudit(db, { actorUserId: user.id, entity: "member", entityId: d.memberId, action: d.done ? "milestone_done" : "milestone_undone", after: { milestone: d.milestone, completedOn: d.completedOn } });
    revalidatePath(`/members/${d.memberId}`);
    return "Saved";
  });
}

export async function markPresent(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(z.object({ memberId: uuid(), serviceEventId: uuid() }), fd, async (d) => {
    const { access, parish, user } = await requireParishContext();
    assertCan(access, "recordAttendance", parish.id);
    const [m] = await db.select({ parishId: s.members.parishId }).from(s.members).where(eq(s.members.id, d.memberId));
    const [e] = await db.select({ parishId: s.serviceEvents.parishId }).from(s.serviceEvents).where(eq(s.serviceEvents.id, d.serviceEventId));
    if (!m || !e || m.parishId !== parish.id || e.parishId !== parish.id) throw new ForbiddenError();
    const rows = await db.insert(s.attendanceCheckins).values({ ...d, recordedBy: user.id }).onConflictDoNothing().returning();
    revalidatePath(`/members/${d.memberId}`);
    return rows.length ? "Marked present" : "Already marked present for that service";
  });
}

/** Merge a duplicate record into the one we keep: attendance, tasks, messages, groups and milestones move over. */
export async function mergeMembers(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let keepId = "";
  const result = await runAction(z.object({ keepId: uuid(), removeId: uuid() }), fd, async (d) => {
    const { access, parish, user } = await requireParishContext();
    assertCan(access, "editMembers", parish.id, "Only the Secretary, Head Usher or Pastor can merge records.");
    if (d.keepId === d.removeId) throw new UserError("Choose two different people.");
    await db.transaction(async (tx) => {
      const both = await tx.select().from(s.members).where(inArray(s.members.id, [d.keepId, d.removeId]));
      if (both.length !== 2 || both.some((m) => m.parishId !== parish.id)) throw new ForbiddenError();
      const keep = both.find((m) => m.id === d.keepId)!;
      const remove = both.find((m) => m.id === d.removeId)!;
      await tx.execute(sql`insert into attendance_checkins (service_event_id, member_id, recorded_by, created_at, updated_at)
        select service_event_id, ${keep.id}, recorded_by, created_at, updated_at from attendance_checkins where member_id = ${remove.id}
        on conflict (service_event_id, member_id) do nothing`);
      await tx.execute(sql`insert into member_milestones (member_id, milestone, completed_on)
        select ${keep.id}, milestone, completed_on from member_milestones where member_id = ${remove.id}
        on conflict (member_id, milestone) do nothing`);
      await tx.execute(sql`insert into small_group_memberships (small_group_id, member_id, joined_on, is_active)
        select small_group_id, ${keep.id}, joined_on, is_active from small_group_memberships where member_id = ${remove.id}
        on conflict (small_group_id, member_id) do nothing`);
      await tx.execute(sql`insert into department_memberships (department_id, member_id, role, is_active)
        select department_id, ${keep.id}, role, is_active from department_memberships where member_id = ${remove.id}
        on conflict (department_id, member_id) do nothing`);
      // Follow-up tasks/messages keyed by member: keep the existing ones for the kept record.
      await tx.execute(sql`update tasks set member_id = ${keep.id}, dedupe_key = case when dedupe_key is null then null else dedupe_key || ':merged' end where member_id = ${remove.id}`);
      await tx.execute(sql`update outbound_messages set related_member_id = ${keep.id}, dedupe_key = case when dedupe_key is null then null else dedupe_key || ':merged' end where related_member_id = ${remove.id}`);
      await tx.update(s.users).set({ memberId: keep.id }).where(eq(s.users.memberId, remove.id));
      // Keep the earliest first visit and the most complete details.
      await tx
        .update(s.members)
        .set({
          firstVisitOn: [keep.firstVisitOn, remove.firstVisitOn].filter(Boolean).sort()[0] ?? null,
          whatsappPhone: keep.whatsappPhone ?? remove.whatsappPhone,
          email: keep.email ?? remove.email,
          gender: keep.gender ?? remove.gender,
          dateOfBirth: keep.dateOfBirth ?? remove.dateOfBirth,
          address: keep.address ?? remove.address,
          consentContact: keep.consentContact || remove.consentContact,
        })
        .where(eq(s.members.id, keep.id));
      await tx.delete(s.members).where(eq(s.members.id, remove.id));
      await writeAudit(tx, { actorUserId: user.id, entity: "member", entityId: keep.id, action: "merge", before: remove, after: { mergedInto: keep.id } });
    });
    keepId = d.keepId;
    revalidatePath("/members");
  });
  if (keepId) redirect(`/members/${keepId}`);
  return result;
}
