import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { loadAccess } from "@/lib/auth/scope";
import { addDays, todayIso } from "@/lib/dates";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { applySyncItems } from "@/lib/sync/apply";
import { userByEmail } from "../support/db";

let eventId: string;
let zoneId: string;
let otherParishZoneId: string;

beforeAll(async () => {
  const [p1] = await db.select().from(s.parishes).where(eq(s.parishes.name, "Shelter Parish"));
  const [p2] = await db.select().from(s.parishes).where(eq(s.parishes.name, "Grace Assembly"));
  const [type] = await db.select().from(s.serviceTypes).where(and(eq(s.serviceTypes.parishId, p1.id), eq(s.serviceTypes.name, "Special Programme")));
  const [ev] = await db
    .insert(s.serviceEvents)
    .values({ parishId: p1.id, serviceTypeId: type.id, eventDate: todayIso(), startTime: type.startTime })
    .onConflictDoNothing()
    .returning();
  eventId = ev?.id ?? (await db.select().from(s.serviceEvents).where(and(eq(s.serviceEvents.serviceTypeId, type.id), eq(s.serviceEvents.eventDate, todayIso()))))[0].id;
  zoneId = (await db.select().from(s.sanctuaryZones).where(eq(s.sanctuaryZones.parishId, p1.id)))[0].id;
  otherParishZoneId = (await db.select().from(s.sanctuaryZones).where(eq(s.sanctuaryZones.parishId, p2.id)))[0].id;
});

function tally(clientId: string, counts: { men: number; women?: number }, at: string, zone = zoneId, event = eventId) {
  return {
    clientId,
    kind: "tally.upsert" as const,
    payload: { serviceEventId: event, sanctuaryZoneId: zone, men: counts.men, women: counts.women ?? 0, children: 0, firstTimers: 0, clientUpdatedAt: at },
  };
}

describe("applySyncItems", () => {
  it("upserts, ignores an identical resend and keeps the newest write", async () => {
    const usher = await userByEmail("usher1@example.com");
    const access = await loadAccess(usher.id);
    const clientId = randomUUID();

    let res = await applySyncItems(access, usher.id, [tally(clientId, { men: 3 }, "2030-01-01T10:00:00.000Z")]);
    expect(res.results[0].status).toBe("ok");
    res = await applySyncItems(access, usher.id, [tally(clientId, { men: 3 }, "2030-01-01T10:00:00.000Z")]);
    expect(res.results[0].status).toBe("duplicate");
    res = await applySyncItems(access, usher.id, [tally(clientId, { men: 7 }, "2030-01-01T10:05:00.000Z")]);
    expect(res.results[0].status).toBe("ok");
    // An older write arriving late loses.
    res = await applySyncItems(access, usher.id, [tally(clientId, { men: 1 }, "2030-01-01T10:01:00.000Z")]);
    expect(res.results[0].status).toBe("duplicate");

    const [row] = await db.select().from(s.zoneTallies).where(eq(s.zoneTallies.clientId, clientId));
    expect(row.men).toBe(7);
    const [report] = await db.select().from(s.serviceReports).where(eq(s.serviceReports.serviceEventId, eventId));
    expect(report.source).toBe("TALLY");
    expect(report.men).toBeGreaterThanOrEqual(7);
  });

  it("sums several ushers into the draft report and reports others' totals", async () => {
    const u1 = await userByEmail("usher1@example.com");
    const u2 = await userByEmail("usher2@example.com");
    const zone = (await db.select().from(s.sanctuaryZones).where(eq(s.sanctuaryZones.name, "Gallery – Right")))[0].id;
    await applySyncItems(await loadAccess(u1.id), u1.id, [tally(randomUUID(), { men: 10, women: 4 }, new Date().toISOString(), zone)]);
    const res = await applySyncItems(await loadAccess(u2.id), u2.id, [tally(randomUUID(), { men: 5, women: 6 }, new Date().toISOString(), zone)]);
    const others = res.zoneTotals.find((z) => z.sanctuaryZoneId === zone)!;
    expect(others.others.men).toBe(10);
    expect(others.otherUshers).toEqual(["Bola Usher"]);
  });

  it("rejects an usher writing to another parish's zone or an old service", async () => {
    const usher = await userByEmail("usher1@example.com");
    const access = await loadAccess(usher.id);
    let res = await applySyncItems(access, usher.id, [tally(randomUUID(), { men: 1 }, new Date().toISOString(), otherParishZoneId)]);
    expect(res.results[0].status).toBe("rejected");

    const [old] = await db.select().from(s.serviceEvents).where(eq(s.serviceEvents.eventDate, addDays(todayIso(), -50))).limit(1);
    if (old) {
      res = await applySyncItems(access, usher.id, [tally(randomUUID(), { men: 1 }, new Date().toISOString(), zoneId, old.id)]);
      expect(res.results[0].status).toBe("rejected");
    }
  });

  it("rejects ushers from another parish entirely", async () => {
    const pastor2 = await userByEmail("pastor2@example.com");
    const res = await applySyncItems(await loadAccess(pastor2.id), pastor2.id, [tally(randomUUID(), { men: 1 }, new Date().toISOString())]);
    expect(res.results[0].status).toBe("rejected");
  });

  it("creates a first-timer once, with a check-in and a welcome message", async () => {
    const usher = await userByEmail("usher2@example.com");
    const access = await loadAccess(usher.id);
    const clientId = randomUUID();
    const item = {
      clientId,
      kind: "member.create" as const,
      payload: { serviceEventId: eventId, firstName: "Ada", lastName: "Test", phone: "0803 999 0000", consentContact: true },
    };
    const first = await applySyncItems(access, usher.id, [item]);
    const second = await applySyncItems(access, usher.id, [item]);
    expect(first.results[0].status).toBe("ok");
    expect(second.results[0]).toMatchObject({ status: "duplicate", memberId: first.results[0].memberId });
    const memberId = first.results[0].memberId!;
    const [m] = await db.select().from(s.members).where(eq(s.members.id, memberId));
    expect(m).toMatchObject({ phone: "+2348039990000", status: "FIRST_TIMER", firstVisitOn: todayIso() });
    expect(await db.select().from(s.attendanceCheckins).where(eq(s.attendanceCheckins.memberId, memberId))).toHaveLength(1);
    expect(await db.select().from(s.outboundMessages).where(eq(s.outboundMessages.relatedMemberId, memberId))).toHaveLength(1);
  });
});
