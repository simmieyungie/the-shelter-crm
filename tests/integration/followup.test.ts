import { and, eq, like } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { runFollowUpPipeline, sendDueMessages } from "@/lib/followup-jobs/pipeline";
import { userByEmail } from "../support/db";

const FIRST = "2026-02-01"; // a Sunday, well away from the seed's own first-timers
let parishId: string;
let keen: string; // comes 3 times
let once: string; // comes once
let quiet: string; // no consent

async function event(date: string) {
  const [type] = await db.select().from(s.serviceTypes).where(and(eq(s.serviceTypes.parishId, parishId), eq(s.serviceTypes.name, "Special Programme")));
  const [ev] = await db.insert(s.serviceEvents).values({ parishId, serviceTypeId: type.id, eventDate: date, startTime: "17:00" }).onConflictDoNothing().returning();
  return ev?.id ?? (await db.select().from(s.serviceEvents).where(and(eq(s.serviceEvents.serviceTypeId, type.id), eq(s.serviceEvents.eventDate, date))))[0].id;
}

beforeAll(async () => {
  [{ id: parishId }] = await db.select({ id: s.parishes.id }).from(s.parishes).where(eq(s.parishes.name, "Shelter Parish"));
  const usher = await userByEmail("usher1@example.com");
  const mk = async (firstName: string, consent: boolean) =>
    (
      await db
        .insert(s.members)
        .values({ parishId, firstName, lastName: "Fastforward", phone: `+23480900${Math.floor(Math.random() * 90000 + 10000)}`, status: "FIRST_TIMER", firstVisitOn: FIRST, consentContact: consent })
        .returning()
    )[0].id;
  keen = await mk("Keen", true);
  once = await mk("Once", true);
  quiet = await mk("Quiet", false);
  for (const [m, dates] of [
    [keen, [FIRST, addDays(FIRST, 7), addDays(FIRST, 21)]],
    [once, [FIRST]],
    [quiet, [FIRST]],
  ] as const) {
    for (const d of dates) await db.insert(s.attendanceCheckins).values({ serviceEventId: await event(d), memberId: m, recordedBy: usher.id });
  }
});

const tasksFor = (memberId: string, key: string) => db.select().from(s.tasks).where(and(eq(s.tasks.memberId, memberId), like(s.tasks.dedupeKey, `followup:${key}:%`)));
const messagesFor = (memberId: string) => db.select().from(s.outboundMessages).where(eq(s.outboundMessages.relatedMemberId, memberId));

describe("first-timer follow-up pipeline (fast-forward)", () => {
  it("day 0 queues a welcome only with consent", async () => {
    await runFollowUpPipeline(db, FIRST);
    expect((await messagesFor(keen)).map((m) => m.templateKey)).toEqual(["welcome"]);
    expect(await messagesFor(quiet)).toHaveLength(0);
    expect(await tasksFor(keen, "day3")).toHaveLength(0);
  });

  it("day 3 creates the call task exactly once, assigned to the follow-up lead", async () => {
    await runFollowUpPipeline(db, addDays(FIRST, 3));
    await runFollowUpPipeline(db, addDays(FIRST, 3));
    await runFollowUpPipeline(db, addDays(FIRST, 4));
    const tasks = await tasksFor(keen, "day3");
    expect(tasks).toHaveLength(1);
    const secretary = await userByEmail("secretary@example.com");
    expect(tasks[0]).toMatchObject({ kind: "FOLLOW_UP", assignedTo: secretary.id, title: "Call Keen Fastforward, capture prayer points" });
    expect(await tasksFor(quiet, "day3")).toHaveLength(1); // call still happens without message consent
  });

  it("day 7 and 14 queue the tribe and Believers' Class invites once", async () => {
    await runFollowUpPipeline(db, addDays(FIRST, 7));
    await runFollowUpPipeline(db, addDays(FIRST, 14));
    await runFollowUpPipeline(db, addDays(FIRST, 15));
    expect((await messagesFor(keen)).map((m) => m.templateKey).sort()).toEqual(["believersClass", "tribeInvite", "welcome"]);
    expect(await messagesFor(quiet)).toHaveLength(0);
  });

  it("day 30 promotes 3+ visits to REGULAR_MEMBER and flags the rest", async () => {
    await runFollowUpPipeline(db, addDays(FIRST, 30));
    await runFollowUpPipeline(db, addDays(FIRST, 31));
    const [k] = await db.select().from(s.members).where(eq(s.members.id, keen));
    const [o] = await db.select().from(s.members).where(eq(s.members.id, once));
    expect(k.status).toBe("REGULAR_MEMBER");
    expect(o.status).toBe("FIRST_TIMER");
    expect(await tasksFor(once, "day30")).toHaveLength(1);
    expect(await tasksFor(keen, "day30")).toHaveLength(0);
  });

  it("the stub sender marks due messages as sent", async () => {
    const n = await sendDueMessages(db);
    expect(n).toBeGreaterThan(0);
    expect((await messagesFor(keen)).every((m) => m.status === "SENT")).toBe(true);
  });
});
