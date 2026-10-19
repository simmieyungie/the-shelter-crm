import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { assertCan, can } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/scope";
import { addDays, todayIso } from "@/lib/dates";
import { type DbOrTx, db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import type { ZoneTotal } from "@/lib/offline/protocol";
import { isScheduledOn } from "@/lib/schedule";

/** Creates the first occurrence of every service scheduled on the date (idempotent). */
export async function ensureEventsForDate(tx: DbOrTx, parishId: string, date: string) {
  const types = await tx
    .select()
    .from(s.serviceTypes)
    .where(and(eq(s.serviceTypes.parishId, parishId), eq(s.serviceTypes.isActive, true)));
  const due = types.filter((t) => isScheduledOn(t, date));
  if (due.length === 0) return;
  await tx
    .insert(s.serviceEvents)
    .values(due.map((t) => ({ parishId, serviceTypeId: t.id, eventDate: date, startTime: t.startTime, occurrence: 1 })))
    .onConflictDoNothing();
}

export type CountService = {
  eventId: string;
  serviceTypeId: string;
  name: string;
  startTime: string;
  location: string | null;
  occurrence: number;
  maxPerDay: number;
  eventDate: string;
};

export type CountBootstrap = {
  date: string;
  parishId: string;
  userId: string;
  userName: string;
  services: CountService[];
  zones: { id: string; name: string; capacity: number | null }[];
  roster: { serviceEventId: string; sanctuaryZoneId: string; userId: string; userName: string; isLead: boolean }[];
  zoneTotals: ZoneTotal[];
  myTallies: { serviceEventId: string; sanctuaryZoneId: string; clientId: string; men: number; women: number; children: number; firstTimers: number; clientUpdatedAt: string }[];
  tribes: { id: string; name: string; landmark: string | null }[];
  specialTypes: { id: string; name: string }[];
  canManageRoster: boolean;
};

/** Everything the Count screen needs, so it can keep working offline afterwards. */
export async function getCountBootstrap(access: Access, parishId: string, user: { id: string; name: string }): Promise<CountBootstrap> {
  assertCan(access, "submitTally", parishId, "Only ushers can count.");
  const date = todayIso();
  await ensureEventsForDate(db, parishId, date);

  const services = await db
    .select({
      eventId: s.serviceEvents.id,
      serviceTypeId: s.serviceTypes.id,
      name: s.serviceTypes.name,
      startTime: s.serviceEvents.startTime,
      location: s.serviceTypes.location,
      occurrence: s.serviceEvents.occurrence,
      maxPerDay: s.serviceTypes.maxPerDay,
      eventDate: s.serviceEvents.eventDate,
    })
    .from(s.serviceEvents)
    .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
    .where(and(eq(s.serviceEvents.parishId, parishId), eq(s.serviceEvents.eventDate, date)))
    .orderBy(asc(s.serviceEvents.startTime), asc(s.serviceEvents.occurrence));

  const eventIds = services.map((x) => x.eventId);
  const [zones, roster, myTallies, tribes, specialTypes, zoneTotals] = await Promise.all([
    db
      .select({ id: s.sanctuaryZones.id, name: s.sanctuaryZones.name, capacity: s.sanctuaryZones.capacity })
      .from(s.sanctuaryZones)
      .where(and(eq(s.sanctuaryZones.parishId, parishId), eq(s.sanctuaryZones.isActive, true)))
      .orderBy(asc(s.sanctuaryZones.sortOrder), asc(s.sanctuaryZones.name)),
    eventIds.length
      ? db
          .select({
            serviceEventId: s.usherAssignments.serviceEventId,
            sanctuaryZoneId: s.usherAssignments.sanctuaryZoneId,
            userId: s.usherAssignments.userId,
            userName: s.users.name,
            isLead: s.usherAssignments.isLead,
          })
          .from(s.usherAssignments)
          .innerJoin(s.users, eq(s.users.id, s.usherAssignments.userId))
          .where(inArray(s.usherAssignments.serviceEventId, eventIds))
      : [],
    eventIds.length
      ? db
          .select({
            serviceEventId: s.zoneTallies.serviceEventId,
            sanctuaryZoneId: s.zoneTallies.sanctuaryZoneId,
            clientId: s.zoneTallies.clientId,
            men: s.zoneTallies.men,
            women: s.zoneTallies.women,
            children: s.zoneTallies.children,
            firstTimers: s.zoneTallies.firstTimers,
            clientUpdatedAt: s.zoneTallies.clientUpdatedAt,
          })
          .from(s.zoneTallies)
          .where(and(inArray(s.zoneTallies.serviceEventId, eventIds), eq(s.zoneTallies.userId, user.id)))
      : [],
    db
      .select({ id: s.smallGroups.id, name: s.smallGroups.name, landmark: s.smallGroups.landmark })
      .from(s.smallGroups)
      .where(and(eq(s.smallGroups.parishId, parishId), eq(s.smallGroups.isActive, true)))
      .orderBy(asc(s.smallGroups.name)),
    db
      .select({ id: s.serviceTypes.id, name: s.serviceTypes.name })
      .from(s.serviceTypes)
      .where(and(eq(s.serviceTypes.parishId, parishId), eq(s.serviceTypes.isActive, true)))
      .orderBy(asc(s.serviceTypes.name)),
    zoneTotalsFor(db, eventIds, user.id),
  ]);

  return {
    date,
    parishId,
    userId: user.id,
    userName: user.name,
    services,
    zones,
    roster,
    zoneTotals,
    myTallies: myTallies.map((t) => ({ ...t, clientUpdatedAt: t.clientUpdatedAt.toISOString() })),
    tribes,
    specialTypes,
    canManageRoster: can(access, "manageRoster", parishId),
  };
}

/** Per (event, zone): the sum of every other usher's tally. */
export async function zoneTotalsFor(tx: DbOrTx, eventIds: string[], excludeUserId: string, zoneIds?: string[]): Promise<ZoneTotal[]> {
  if (eventIds.length === 0) return [];
  const rows = await tx
    .select({
      serviceEventId: s.zoneTallies.serviceEventId,
      sanctuaryZoneId: s.zoneTallies.sanctuaryZoneId,
      men: sql<number>`coalesce(sum(${s.zoneTallies.men}) filter (where ${s.zoneTallies.userId} <> ${excludeUserId}), 0)::int`,
      women: sql<number>`coalesce(sum(${s.zoneTallies.women}) filter (where ${s.zoneTallies.userId} <> ${excludeUserId}), 0)::int`,
      children: sql<number>`coalesce(sum(${s.zoneTallies.children}) filter (where ${s.zoneTallies.userId} <> ${excludeUserId}), 0)::int`,
      firstTimers: sql<number>`coalesce(sum(${s.zoneTallies.firstTimers}) filter (where ${s.zoneTallies.userId} <> ${excludeUserId}), 0)::int`,
      otherUshers: sql<string[]>`coalesce(array_agg(${s.users.name} order by ${s.users.name}) filter (where ${s.zoneTallies.userId} <> ${excludeUserId}), '{}')`,
    })
    .from(s.zoneTallies)
    .innerJoin(s.users, eq(s.users.id, s.zoneTallies.userId))
    .where(and(inArray(s.zoneTallies.serviceEventId, eventIds), zoneIds?.length ? inArray(s.zoneTallies.sanctuaryZoneId, zoneIds) : undefined))
    .groupBy(s.zoneTallies.serviceEventId, s.zoneTallies.sanctuaryZoneId);
  return rows.map((r) => ({
    serviceEventId: r.serviceEventId,
    sanctuaryZoneId: r.sanctuaryZoneId,
    others: { men: r.men, women: r.women, children: r.children, firstTimers: r.firstTimers },
    otherUshers: r.otherUshers,
  }));
}

/** Members a usher can mark present: search by name or phone within the parish. */
export async function searchMembersForCheckin(access: Access, parishId: string, q: string) {
  assertCan(access, "recordAttendance", parishId);
  const term = q.trim().toLowerCase();
  if (term.length < 2) return [];
  const digits = term.replace(/\D/g, "");
  return db
    .select({
      id: s.members.id,
      firstName: s.members.firstName,
      lastName: s.members.lastName,
      phone: s.members.phone,
      status: s.members.status,
      firstVisitOn: s.members.firstVisitOn,
    })
    .from(s.members)
    .where(
      and(
        eq(s.members.parishId, parishId),
        or(
          sql`lower(${s.members.firstName} || ' ' || ${s.members.lastName}) like ${"%" + term + "%"}`,
          digits.length >= 4 ? sql`${s.members.phone} like ${"%" + digits.slice(-10) + "%"}` : sql`false`,
        ),
      ),
    )
    .orderBy(sql`${s.members.status} = 'FIRST_TIMER' desc`, asc(s.members.firstName))
    .limit(12);
}

export async function membersWithPhone(parishId: string, phone: string) {
  return db
    .select({ id: s.members.id, firstName: s.members.firstName, lastName: s.members.lastName, status: s.members.status })
    .from(s.members)
    .where(and(eq(s.members.parishId, parishId), or(eq(s.members.phone, phone), eq(s.members.whatsappPhone, phone))))
    .limit(5);
}

export async function getRoster(access: Access, eventId: string) {
  const [ev] = await db
    .select({ event: s.serviceEvents, typeName: s.serviceTypes.name })
    .from(s.serviceEvents)
    .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
    .where(eq(s.serviceEvents.id, eventId));
  if (!ev) return null;
  assertCan(access, "manageRoster", ev.event.parishId);
  const today = todayIso();
  const [zones, assignments, ushers] = await Promise.all([
    db.select().from(s.sanctuaryZones).where(and(eq(s.sanctuaryZones.parishId, ev.event.parishId), eq(s.sanctuaryZones.isActive, true))).orderBy(asc(s.sanctuaryZones.sortOrder)),
    db
      .select({ a: s.usherAssignments, name: s.users.name })
      .from(s.usherAssignments)
      .innerJoin(s.users, eq(s.users.id, s.usherAssignments.userId))
      .where(eq(s.usherAssignments.serviceEventId, eventId)),
    db
      .selectDistinct({ id: s.users.id, name: s.users.name })
      .from(s.users)
      .innerJoin(s.roleAssignments, eq(s.roleAssignments.userId, s.users.id))
      .where(
        and(
          eq(s.roleAssignments.scopeLevel, "PARISH"),
          eq(s.roleAssignments.scopeId, ev.event.parishId),
          inArray(s.roleAssignments.role, ["USHER", "HEAD_USHER"]),
          lte(s.roleAssignments.startsOn, today),
          or(isNull(s.roleAssignments.endsOn), gte(s.roleAssignments.endsOn, today)),
          eq(s.users.isActive, true),
        ),
      )
      .orderBy(asc(s.users.name)),
  ]);
  return { event: ev.event, typeName: ev.typeName, zones, assignments, ushers };
}

/** Recent and upcoming services a head usher can roster (yesterday … +14 days). */
export async function rosterableEvents(access: Access, parishId: string) {
  assertCan(access, "manageRoster", parishId);
  const today = todayIso();
  for (let i = 0; i <= 14; i++) await ensureEventsForDate(db, parishId, addDays(today, i));
  return db
    .select({ id: s.serviceEvents.id, date: s.serviceEvents.eventDate, name: s.serviceTypes.name, occurrence: s.serviceEvents.occurrence, startTime: s.serviceEvents.startTime })
    .from(s.serviceEvents)
    .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
    .where(and(eq(s.serviceEvents.parishId, parishId), gte(s.serviceEvents.eventDate, addDays(today, -1)), lte(s.serviceEvents.eventDate, addDays(today, 14))))
    .orderBy(asc(s.serviceEvents.eventDate), asc(s.serviceEvents.startTime));
}

