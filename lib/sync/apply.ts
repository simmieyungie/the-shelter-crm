import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { can, hasRoleIn } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/scope";
import { addDays, todayIso } from "@/lib/dates";
import { db, type Tx } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { zoneTotalsFor } from "@/lib/db/queries/count";
import { queueWelcome } from "@/lib/followup";
import type { MemberCreatePayload, SyncItem, SyncResponse } from "@/lib/offline/protocol";
import { normalisePhone } from "@/lib/phone";
import { recomputeTallyReport } from "@/lib/reports/tally";

/** How far back an offline device may still send counts for a service. */
export const TALLY_WINDOW_DAYS = 7;

class Rejected extends Error {}

type EventRow = { id: string; parishId: string; eventDate: string };

async function loadEvent(tx: Tx, id: string): Promise<EventRow> {
  const [ev] = await tx
    .select({ id: s.serviceEvents.id, parishId: s.serviceEvents.parishId, eventDate: s.serviceEvents.eventDate })
    .from(s.serviceEvents)
    .where(eq(s.serviceEvents.id, id));
  if (!ev) throw new Rejected("That service no longer exists.");
  return ev;
}

function assertTallyWindow(ev: EventRow) {
  const today = todayIso();
  if (ev.eventDate > today) throw new Rejected("You can't count a service before it happens.");
  if (ev.eventDate < addDays(today, -TALLY_WINDOW_DAYS)) throw new Rejected("That service is too old to count. Ask the Head Usher to enter the numbers on the report.");
}

/** Applies a batch from the offline outbox. Each item is its own transaction. */
export async function applySyncItems(access: Access, userId: string, items: SyncItem[]): Promise<SyncResponse> {
  const results: SyncResponse["results"] = [];
  const touched = new Map<string, Set<string>>(); // eventId -> zoneIds

  for (const item of items) {
    try {
      const result = await db.transaction(async (tx) => {
        switch (item.kind) {
          case "tally.upsert":
            return applyTally(tx, access, userId, item.clientId, item.payload, touched);
          case "member.create":
            return applyMemberCreate(tx, access, userId, item.clientId, item.payload);
          case "checkin.create":
            return applyCheckin(tx, access, userId, item.payload.serviceEventId, item.payload.memberId);
        }
      });
      results.push({ clientId: item.clientId, ...result });
    } catch (err) {
      if (err instanceof Rejected) results.push({ clientId: item.clientId, status: "rejected", error: err.message });
      else {
        console.error("sync item failed", item.kind, err);
        results.push({ clientId: item.clientId, status: "error", error: "Server error" });
      }
    }
  }

  const zoneTotals = [];
  for (const [eventId, zones] of touched) zoneTotals.push(...(await zoneTotalsFor(db, [eventId], userId, [...zones])));
  return { results, zoneTotals };
}

async function applyTally(
  tx: Tx,
  access: Access,
  userId: string,
  clientId: string,
  p: Extract<SyncItem, { kind: "tally.upsert" }>["payload"],
  touched: Map<string, Set<string>>,
) {
  const ev = await loadEvent(tx, p.serviceEventId);
  if (!can(access, "submitTally", ev.parishId)) throw new Rejected("You're not an usher in this parish.");
  assertTallyWindow(ev);
  const [zone] = await tx
    .select({ id: s.sanctuaryZones.id })
    .from(s.sanctuaryZones)
    .where(and(eq(s.sanctuaryZones.id, p.sanctuaryZoneId), eq(s.sanctuaryZones.parishId, ev.parishId)));
  if (!zone) throw new Rejected("That zone isn't part of this parish.");

  // Same clientId already stored with this or a newer timestamp: nothing to do.
  const [existingByClient] = await tx.select().from(s.zoneTallies).where(eq(s.zoneTallies.clientId, clientId));
  if (existingByClient && (existingByClient.serviceEventId !== p.serviceEventId || existingByClient.sanctuaryZoneId !== p.sanctuaryZoneId || existingByClient.userId !== userId))
    throw new Rejected("This tally belongs to a different service or usher.");

  const clientUpdatedAt = new Date(p.clientUpdatedAt);
  const values = { men: p.men, women: p.women, children: p.children, firstTimers: p.firstTimers, clientUpdatedAt };
  const updated = await tx
    .insert(s.zoneTallies)
    .values({ serviceEventId: p.serviceEventId, sanctuaryZoneId: p.sanctuaryZoneId, userId, clientId, ...values })
    .onConflictDoUpdate({
      target: [s.zoneTallies.serviceEventId, s.zoneTallies.sanctuaryZoneId, s.zoneTallies.userId],
      set: { ...values, clientId, updatedAt: new Date() },
      // Last write wins per (event, zone, user).
      setWhere: sql`excluded.client_updated_at > ${s.zoneTallies.clientUpdatedAt}`,
    })
    .returning({ id: s.zoneTallies.id });

  (touched.get(p.serviceEventId) ?? touched.set(p.serviceEventId, new Set()).get(p.serviceEventId)!).add(p.sanctuaryZoneId);

  if (updated.length === 0) return { status: existingByClient ? ("duplicate" as const) : ("stale" as const) };

  await recomputeTallyReport(tx, p.serviceEventId);
  // Counting means the usher is on duty.
  await tx
    .update(s.usherAssignments)
    .set({ checkedInAt: new Date() })
    .where(and(eq(s.usherAssignments.serviceEventId, p.serviceEventId), eq(s.usherAssignments.userId, userId), isNull(s.usherAssignments.checkedInAt)));
  return { status: "ok" as const };
}

async function applyMemberCreate(tx: Tx, access: Access, userId: string, clientId: string, p: MemberCreatePayload) {
  const [already] = await tx.select({ id: s.members.id }).from(s.members).where(eq(s.members.clientId, clientId));
  if (already) return { status: "duplicate" as const, memberId: already.id };

  const ev = await loadEvent(tx, p.serviceEventId);
  if (!hasRoleIn(access, ev.parishId, ["USHER", "HEAD_USHER"])) throw new Rejected("You're not an usher in this parish.");
  const phone = normalisePhone(p.phone);
  if (!phone) throw new Rejected(`The phone number for ${p.firstName} doesn't look right.`);
  const whatsapp = p.whatsappPhone ? normalisePhone(p.whatsappPhone) : null;

  if (p.smallGroupId) {
    const [g] = await tx.select({ id: s.smallGroups.id }).from(s.smallGroups).where(and(eq(s.smallGroups.id, p.smallGroupId), eq(s.smallGroups.parishId, ev.parishId)));
    if (!g) throw new Rejected("That tribe isn't part of this parish.");
  }

  const [member] = await tx
    .insert(s.members)
    .values({
      parishId: ev.parishId,
      firstName: p.firstName,
      lastName: p.lastName,
      phone,
      whatsappPhone: whatsapp,
      gender: p.gender ?? null,
      status: "FIRST_TIMER",
      firstVisitOn: ev.eventDate,
      consentContact: p.consentContact,
      clientId,
    })
    .returning();

  await tx.insert(s.attendanceCheckins).values({ serviceEventId: ev.id, memberId: member.id, recordedBy: userId }).onConflictDoNothing();
  if (p.smallGroupId) {
    await tx.insert(s.smallGroupMemberships).values({ smallGroupId: p.smallGroupId, memberId: member.id, joinedOn: ev.eventDate }).onConflictDoNothing();
  }
  const [parish] = await tx.select({ name: s.parishes.name }).from(s.parishes).where(eq(s.parishes.id, ev.parishId));
  await queueWelcome(tx, member, parish.name, ev.eventDate);
  return { status: "ok" as const, memberId: member.id };
}

async function applyCheckin(tx: Tx, access: Access, userId: string, serviceEventId: string, memberId: string) {
  const ev = await loadEvent(tx, serviceEventId);
  if (!can(access, "recordAttendance", ev.parishId)) throw new Rejected("You can't record attendance in this parish.");
  const [m] = await tx.select({ parishId: s.members.parishId }).from(s.members).where(eq(s.members.id, memberId));
  if (!m || m.parishId !== ev.parishId) throw new Rejected("That person isn't in this parish.");
  const rows = await tx
    .insert(s.attendanceCheckins)
    .values({ serviceEventId, memberId, recordedBy: userId })
    .onConflictDoNothing()
    .returning({ id: s.attendanceCheckins.id });
  return { status: rows.length ? ("ok" as const) : ("duplicate" as const) };
}
