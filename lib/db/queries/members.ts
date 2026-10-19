import "server-only";
import { and, asc, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { assertCan } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/scope";
import { addDays, todayIso } from "@/lib/dates";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";

const PAGE = 50;

export async function listMembers(access: Access, parishId: string, opts: { q?: string; status?: string; page?: number }) {
  assertCan(access, "viewMembers", parishId);
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();
  const digits = q?.replace(/\D/g, "") ?? "";
  const status = s.memberStatusEnum.enumValues.find((v) => v === opts.status);
  const where = and(
    eq(s.members.parishId, parishId),
    status ? eq(s.members.status, status) : undefined,
    q
      ? or(
          ilike(sql`${s.members.firstName} || ' ' || ${s.members.lastName}`, `%${q}%`),
          digits.length >= 4 ? sql`${s.members.phone} like ${"%" + digits.slice(-10) + "%"}` : undefined,
          ilike(s.members.email, `%${q}%`),
        )
      : undefined,
  );
  const rows = await db
    .select({
      id: s.members.id,
      firstName: s.members.firstName,
      lastName: s.members.lastName,
      phone: s.members.phone,
      status: s.members.status,
      firstVisitOn: s.members.firstVisitOn,
      sharedPhone: sql<number>`(select count(*)::int from members m2 where m2.parish_id = members.parish_id and m2.phone = members.phone and m2.id <> members.id)`,
    })
    .from(s.members)
    .where(where)
    .orderBy(sql`${s.members.status} = 'FIRST_TIMER' desc`, desc(s.members.firstVisitOn), asc(s.members.firstName), asc(s.members.lastName))
    .limit(PAGE + 1)
    .offset((page - 1) * PAGE);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.members).where(where);
  return { rows: rows.slice(0, PAGE), hasMore: rows.length > PAGE, page, total: n };
}

export async function getMember(access: Access, memberId: string) {
  const [m] = await db.select().from(s.members).where(eq(s.members.id, memberId));
  if (!m) return null;
  assertCan(access, "viewMembers", m.parishId);
  const [milestones, visits, tasks, messages, groups, sameNumber, recentEvents] = await Promise.all([
    db.select().from(s.memberMilestones).where(eq(s.memberMilestones.memberId, memberId)),
    db
      .select({ date: s.serviceEvents.eventDate, service: s.serviceTypes.name, by: s.users.name })
      .from(s.attendanceCheckins)
      .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.attendanceCheckins.serviceEventId))
      .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
      .innerJoin(s.users, eq(s.users.id, s.attendanceCheckins.recordedBy))
      .where(eq(s.attendanceCheckins.memberId, memberId))
      .orderBy(desc(s.serviceEvents.eventDate))
      .limit(30),
    db
      .select({ id: s.tasks.id, title: s.tasks.title, status: s.tasks.status, dueAt: s.tasks.dueAt, assignee: s.users.name })
      .from(s.tasks)
      .innerJoin(s.users, eq(s.users.id, s.tasks.assignedTo))
      .where(eq(s.tasks.memberId, memberId))
      .orderBy(desc(s.tasks.dueAt)),
    db.select().from(s.outboundMessages).where(eq(s.outboundMessages.relatedMemberId, memberId)).orderBy(desc(s.outboundMessages.scheduledFor)),
    db
      .select({ id: s.smallGroups.id, name: s.smallGroups.name, typeName: s.smallGroups.typeName })
      .from(s.smallGroupMemberships)
      .innerJoin(s.smallGroups, eq(s.smallGroups.id, s.smallGroupMemberships.smallGroupId))
      .where(and(eq(s.smallGroupMemberships.memberId, memberId), eq(s.smallGroupMemberships.isActive, true))),
    m.phone
      ? db
          .select({ id: s.members.id, firstName: s.members.firstName, lastName: s.members.lastName, status: s.members.status })
          .from(s.members)
          .where(and(eq(s.members.parishId, m.parishId), eq(s.members.phone, m.phone), sql`${s.members.id} <> ${m.id}`))
      : [],
    db
      .select({ id: s.serviceEvents.id, date: s.serviceEvents.eventDate, name: s.serviceTypes.name })
      .from(s.serviceEvents)
      .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
      .where(and(eq(s.serviceEvents.parishId, m.parishId), gte(s.serviceEvents.eventDate, addDays(todayIso(), -14)), sql`${s.serviceEvents.eventDate} <= ${todayIso()}`))
      .orderBy(desc(s.serviceEvents.eventDate))
      .limit(12),
  ]);
  const tribes = await db
    .select({ id: s.smallGroups.id, name: s.smallGroups.name })
    .from(s.smallGroups)
    .where(and(eq(s.smallGroups.parishId, m.parishId), eq(s.smallGroups.isActive, true)));
  return { member: m, milestones, visits, tasks, messages, groups, sameNumber, recentEvents, tribes };
}

