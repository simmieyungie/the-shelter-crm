import { eq as sqlEq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { addDays, startOfMonth, addMonths, todayIso, weekday, lagosDateTime } from "@/lib/dates";
import type { DbOrTx } from "@/lib/db";
import * as s from "@/lib/db/schema";

export const DEV_PASSWORD = "password123";

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Adaeze", "Tunde", "Chioma", "Emeka", "Funmi", "Segun", "Ngozi", "Bola", "Ifeoma", "Kunle", "Yetunde", "Obinna", "Aisha", "Femi", "Kemi", "Uche", "Bisi", "Dapo", "Nkechi", "Tobi"];
const LAST = ["Okafor", "Adeyemi", "Balogun", "Eze", "Ogunleye", "Nwosu", "Bello", "Akinola", "Obi", "Adebayo", "Okonkwo", "Salami", "Ojo", "Uzor", "Afolabi"];

export type SeedSummary = Record<string, number | string>;

export async function seed(db: DbOrTx, opts: { today?: string } = {}): Promise<SeedSummary> {
  const today = opts.today ?? todayIso();
  const rand = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (a: number, b: number) => Math.round(a + rand() * (b - a));
  const passwordHash = await hashPassword(DEV_PASSWORD);

  // Most recent Sunday strictly before today.
  const lastSunday = weekday(today) === 0 ? addDays(today, -7) : addDays(today, -weekday(today));
  const sundays = Array.from({ length: 8 }, (_, i) => addDays(lastSunday, -7 * i)); // newest first
  const lastTuesday = addDays(today, -(((weekday(today) - 2 + 7) % 7) || 7));
  const tuesdays = Array.from({ length: 8 }, (_, i) => addDays(lastTuesday, -7 * i));

  // --- Hierarchy -------------------------------------------------------------
  const [region] = await db.insert(s.regions).values({ name: "Region 1", code: "R01" }).returning();
  const [province] = await db.insert(s.provinces).values({ regionId: region.id, name: "Lagos Province 2", code: "LP02" }).returning();
  const [zone] = await db.insert(s.zones).values({ provinceId: province.id, name: "Lagos Zone 4", code: "LZ04" }).returning();
  const areaRows = await db
    .insert(s.areas)
    .values([
      { zoneId: zone.id, name: "Ikeja Area", code: "LZ04-A1" },
      { zoneId: zone.id, name: "Ogba Area", code: "LZ04-A2" },
      { zoneId: zone.id, name: "Agege Area", code: "LZ04-A3" },
    ])
    .returning();
  const parishDefs = [
    ["Shelter Parish", 0],
    ["Grace Assembly", 0],
    ["Victory Chapel", 1],
    ["Covenant Parish", 1],
    ["Dominion Sanctuary", 2],
    ["Hope Centre", 2],
  ] as const;
  const parishRows = await db
    .insert(s.parishes)
    .values(
      parishDefs.map(([name, a], i) => ({
        areaId: areaRows[a].id,
        name,
        code: `LZ04-P${i + 1}`,
        address: `${10 + i} Church Road, Lagos`,
        phone: `+23480000001${i}0`,
      })),
    )
    .returning();
  const [p1, p2] = parishRows;

  // --- Parish 1 setup ---------------------------------------------------------
  const zonesP1 = await db
    .insert(s.sanctuaryZones)
    .values([
      { parishId: p1.id, name: "Main Floor – Center", capacity: 320, sortOrder: 1 },
      { parishId: p1.id, name: "Gallery – Left", capacity: 140, sortOrder: 2 },
      { parishId: p1.id, name: "Gallery – Right", capacity: 140, sortOrder: 3 },
      { parishId: p1.id, name: "Children's Church", capacity: 90, sortOrder: 4 },
    ])
    .returning();

  const [sun1, sun2, accelerate] = await db
    .insert(s.serviceTypes)
    .values([
      { parishId: p1.id, name: "Sunday 1st Service", dayOfWeek: 0, startTime: "08:00", location: "Main auditorium", recurrence: "WEEKLY" as const },
      { parishId: p1.id, name: "Sunday 2nd Service", dayOfWeek: 0, startTime: "10:30", location: "Main auditorium", recurrence: "WEEKLY" as const, maxPerDay: 2 },
      { parishId: p1.id, name: "Accelerate", dayOfWeek: 2, startTime: "18:30", location: "Main auditorium", recurrence: "WEEKLY" as const },
    ])
    .returning();
  const [special] = await db
    .insert(s.serviceTypes)
    .values({ parishId: p1.id, name: "Special Programme", startTime: "17:00", recurrence: "SPECIAL", location: "Main auditorium" })
    .returning();

  const deptNames = ["Ushering", "Choir", "Technical", "Sanctuary Keepers", "Protocol", "Children's Church"];
  const depts = await db.insert(s.departments).values(deptNames.map((name) => ({ parishId: p1.id, name }))).returning();
  const deptByName = Object.fromEntries(depts.map((d) => [d.name, d]));

  // --- Members (40) -----------------------------------------------------------
  type MemberSeed = typeof s.members.$inferInsert;
  const memberSeeds: MemberSeed[] = [];
  for (let i = 0; i < 40; i++) {
    const firstName = FIRST[i % FIRST.length];
    const lastName = LAST[(i * 7) % LAST.length];
    let status: s.MemberStatus = "REGULAR_MEMBER";
    let firstVisitOn: string | null = null;
    if (i < 6) status = "WORKER";
    else if (i < 16) {
      status = "FIRST_TIMER";
      // 8 in the 30–60 day retention cohort, 2 recent.
      firstVisitOn = i < 14 ? sundays[Math.min(7, 5 + (i % 3))] : sundays[0];
    } else if (i < 18) status = "NEW_CONVERT";
    memberSeeds.push({
      parishId: p1.id,
      firstName,
      lastName,
      phone: `+2348031${String(100000 + i).padStart(6, "0")}`,
      whatsappPhone: i % 3 === 0 ? `+2348031${String(100000 + i).padStart(6, "0")}` : null,
      gender: i % 2 === 0 ? "FEMALE" : "MALE",
      status,
      firstVisitOn,
      consentContact: status === "FIRST_TIMER" ? i % 5 !== 0 : true,
      address: `${i + 1} Allen Avenue, Ikeja`,
    });
  }
  const memberRows = await db.insert(s.members).values(memberSeeds).returning();

  const tribes = await db
    .insert(s.smallGroups)
    .values([
      { parishId: p1.id, name: "Allen Avenue Tribe", address: "4 Allen Avenue", landmark: "Opposite the filling station", leaderMemberId: memberRows[0].id },
      { parishId: p1.id, name: "GRA Tribe", address: "12 Isaac John Street", landmark: "Near the roundabout", leaderMemberId: memberRows[1].id },
    ])
    .returning();
  await db.insert(s.smallGroupMemberships).values(
    memberRows.slice(0, 20).map((m, i) => ({ smallGroupId: tribes[i % 2].id, memberId: m.id, joinedOn: addDays(today, -200) })),
  );
  await db.insert(s.departmentMemberships).values([
    { departmentId: deptByName["Ushering"].id, memberId: memberRows[0].id, role: "HOD" as const },
    { departmentId: deptByName["Ushering"].id, memberId: memberRows[1].id, role: "MEMBER" as const },
    { departmentId: deptByName["Ushering"].id, memberId: memberRows[2].id, role: "MEMBER" as const },
    { departmentId: deptByName["Technical"].id, memberId: memberRows[3].id, role: "HOD" as const },
    { departmentId: deptByName["Technical"].id, memberId: memberRows[4].id, role: "MEMBER" as const },
    { departmentId: deptByName["Choir"].id, memberId: memberRows[5].id, role: "HOD" as const },
  ]);

  // --- Users ------------------------------------------------------------------
  const userDefs: Array<{ key: string; name: string; email: string; phone: string; memberIdx?: number }> = [
    { key: "usher1", name: "Bola Usher", email: "usher1@example.com", phone: "+2348000000001", memberIdx: 1 },
    { key: "usher2", name: "Kemi Usher", email: "usher2@example.com", phone: "+2348000000002", memberIdx: 2 },
    { key: "headUsher", name: "Tunde Head Usher", email: "headusher@example.com", phone: "+2348000000003", memberIdx: 0 },
    { key: "secretary", name: "Funmi Secretary", email: "secretary@example.com", phone: "+2348000000004" },
    { key: "hod", name: "Emeka Technical HOD", email: "hod@example.com", phone: "+2348000000005", memberIdx: 3 },
    { key: "tech", name: "Chioma Technical", email: "tech@example.com", phone: "+2348000000012", memberIdx: 4 },
    { key: "tribe", name: "Ngozi Tribe Leader", email: "tribe@example.com", phone: "+2348000000006" },
    { key: "pastor", name: "Pastor Segun Adeyemi", email: "pastor@example.com", phone: "+2348000000007" },
    { key: "pastor2", name: "Pastor Ifeoma Eze", email: "pastor2@example.com", phone: "+2348000000008" },
    { key: "areaPastor", name: "Pastor Kunle Balogun", email: "areapastor@example.com", phone: "+2348000000009" },
    { key: "areaPastor2", name: "Pastor Aisha Bello", email: "areapastor2@example.com", phone: "+2348000000010" },
    { key: "zonalPastor", name: "Pastor Femi Ojo", email: "zonalpastor@example.com", phone: "+2348000000011" },
    { key: "provAdmin", name: "Provincial Admin", email: "provadmin@example.com", phone: "+2348000000013" },
    { key: "admin", name: "System Admin", email: "admin@example.com", phone: "+2348000000014" },
  ];
  const userRows = await db
    .insert(s.users)
    .values(
      userDefs.map((u) => ({
        name: u.name,
        email: u.email,
        phone: u.phone,
        passwordHash,
        memberId: u.memberIdx !== undefined ? memberRows[u.memberIdx].id : null,
      })),
    )
    .returning();
  const U = Object.fromEntries(userDefs.map((d, i) => [d.key, userRows[i]])) as Record<string, (typeof userRows)[number]>;

  const startsOn = addDays(today, -365);
  await db.insert(s.roleAssignments).values([
    { userId: U.usher1.id, role: "USHER", scopeLevel: "PARISH", scopeId: p1.id, startsOn },
    { userId: U.usher2.id, role: "USHER", scopeLevel: "PARISH", scopeId: p1.id, startsOn },
    { userId: U.headUsher.id, role: "HEAD_USHER", scopeLevel: "PARISH", scopeId: p1.id, startsOn },
    { userId: U.secretary.id, role: "SECRETARY", scopeLevel: "PARISH", scopeId: p1.id, startsOn },
    { userId: U.hod.id, role: "HOD", scopeLevel: "PARISH", scopeId: p1.id, departmentId: deptByName["Technical"].id, startsOn },
    { userId: U.tech.id, role: "USHER", scopeLevel: "PARISH", scopeId: p1.id, startsOn, endsOn: addDays(today, -30) }, // expired
    { userId: U.tribe.id, role: "TRIBE_LEADER", scopeLevel: "PARISH", scopeId: p1.id, smallGroupId: tribes[0].id, startsOn },
    { userId: U.pastor.id, role: "PARISH_PASTOR", scopeLevel: "PARISH", scopeId: p1.id, startsOn },
    { userId: U.pastor2.id, role: "PARISH_PASTOR", scopeLevel: "PARISH", scopeId: p2.id, startsOn },
    { userId: U.areaPastor.id, role: "AREA_PASTOR", scopeLevel: "AREA", scopeId: areaRows[0].id, startsOn },
    // An HOD in one parish who is also an Area Pastor elsewhere (spec §5.2 example).
    { userId: U.areaPastor2.id, role: "AREA_PASTOR", scopeLevel: "AREA", scopeId: areaRows[1].id, startsOn },
    { userId: U.zonalPastor.id, role: "ZONAL_PASTOR", scopeLevel: "ZONE", scopeId: zone.id, startsOn },
    { userId: U.provAdmin.id, role: "PROVINCIAL_ADMIN", scopeLevel: "PROVINCE", scopeId: province.id, startsOn },
    { userId: U.admin.id, role: "SYSTEM_ADMIN", scopeLevel: "GLOBAL", scopeId: null, startsOn },
  ]);
  await db.update(s.parishes).set({ followUpLeadUserId: U.secretary.id }).where(sqlEq(s.parishes.id, p1.id));

  // --- Parish 1 services and reports -------------------------------------------
  const verifiedAt = (d: string) => lagosDateTime(addDays(d, 1), "12:00");
  const submittedAt = (d: string) => lagosDateTime(addDays(d, 1), "09:00");
  let reportCount = 0;
  const p1Events: Array<{ id: string; date: string }> = [];

  async function addReport(opts: {
    parishId: string;
    type: { id: string; startTime: string };
    date: string;
    status: s.ReportStatus;
    source?: s.RecordSource;
    size: number;
    pastorId: string | null;
    draftedBy: string;
    submittedLateDays?: number;
  }) {
    const [ev] = await db
      .insert(s.serviceEvents)
      .values({ parishId: opts.parishId, serviceTypeId: opts.type.id, eventDate: opts.date, startTime: opts.type.startTime, preacher: pick(["Pastor Segun Adeyemi", "Pastor Ifeoma Eze", "Guest minister"]) })
      .returning();
    const men = Math.round(opts.size * (0.38 + rand() * 0.04));
    const women = Math.round(opts.size * (0.45 + rand() * 0.04));
    const children = Math.max(0, opts.size - men - women);
    const submitted = opts.status !== "DRAFT";
    const sub = opts.submittedLateDays ? lagosDateTime(addDays(opts.date, opts.submittedLateDays), "10:00") : submittedAt(opts.date);
    await db.insert(s.serviceReports).values({
      serviceEventId: ev.id,
      men,
      women,
      children,
      firstTimers: between(1, 9),
      workersOnDuty: between(25, 45),
      offeringKobo: between(200_000, 600_000) * 100,
      titheKobo: between(400_000, 1_200_000) * 100,
      specialSeedKobo: rand() < 0.4 ? between(50_000, 200_000) * 100 : null,
      source: opts.source ?? "MANUAL",
      status: opts.status,
      draftedBy: opts.draftedBy,
      submittedAt: submitted ? sub : null,
      submittedBy: submitted ? opts.draftedBy : null,
      verifiedBy: opts.status === "VERIFIED" ? opts.pastorId : null,
      verifiedAt: opts.status === "VERIFIED" ? (opts.submittedLateDays ? addHours(sub, 3) : verifiedAt(opts.date)) : null,
    });
    reportCount++;
    return ev;
  }

  for (let w = 0; w < 8; w++) {
    const d = sundays[w];
    const e1 = await addReport({ parishId: p1.id, type: sun1, date: d, status: "VERIFIED", size: between(380, 460), pastorId: U.pastor.id, draftedBy: U.headUsher.id });
    p1Events.push({ id: e1.id, date: d });
    // Missing Sunday: week 4's 2nd service has no record at all. Week 0's 2nd service is a tally draft.
    if (w === 4) continue;
    if (w === 0) {
      const [ev] = await db.insert(s.serviceEvents).values({ parishId: p1.id, serviceTypeId: sun2.id, eventDate: d, startTime: sun2.startTime }).returning();
      p1Events.push({ id: ev.id, date: d });
      await db.insert(s.usherAssignments).values([
        { serviceEventId: ev.id, sanctuaryZoneId: zonesP1[0].id, userId: U.usher1.id, isLead: true, checkedInAt: lagosDateTime(d, "10:15") },
        { serviceEventId: ev.id, sanctuaryZoneId: zonesP1[0].id, userId: U.usher2.id, checkedInAt: lagosDateTime(d, "10:20") },
        { serviceEventId: ev.id, sanctuaryZoneId: zonesP1[1].id, userId: U.headUsher.id, isLead: true },
      ]);
      const tallies = [
        { zone: zonesP1[0], user: U.usher1, men: 61, women: 74, children: 9, ft: 3 },
        { zone: zonesP1[0], user: U.usher2, men: 58, women: 69, children: 11, ft: 2 },
        { zone: zonesP1[1], user: U.headUsher, men: 41, women: 52, children: 4, ft: 1 },
      ];
      for (const t of tallies) {
        await db.insert(s.zoneTallies).values({
          serviceEventId: ev.id,
          sanctuaryZoneId: t.zone.id,
          userId: t.user.id,
          men: t.men,
          women: t.women,
          children: t.children,
          firstTimers: t.ft,
          clientId: crypto.randomUUID(),
          clientUpdatedAt: lagosDateTime(d, "11:30"),
        });
      }
      const sum = tallies.reduce((a, t) => ({ men: a.men + t.men, women: a.women + t.women, children: a.children + t.children, ft: a.ft + t.ft }), { men: 0, women: 0, children: 0, ft: 0 });
      await db.insert(s.serviceReports).values({
        serviceEventId: ev.id,
        men: sum.men,
        women: sum.women,
        children: sum.children,
        firstTimers: sum.ft,
        source: "TALLY",
        status: "DRAFT",
        draftedBy: U.headUsher.id,
      });
      reportCount++;
      continue;
    }
    const e2 = await addReport({ parishId: p1.id, type: sun2, date: d, status: "VERIFIED", size: between(500, 620), pastorId: U.pastor.id, draftedBy: U.headUsher.id });
    p1Events.push({ id: e2.id, date: d });
  }
  for (let w = 0; w < 8; w++) {
    if (w === 2) continue; // missing midweek service
    await addReport({ parishId: p1.id, type: accelerate, date: tuesdays[w], status: "VERIFIED", size: between(120, 180), pastorId: U.pastor.id, draftedBy: U.secretary.id });
  }

  // First-timer check-ins: in the 30–60 day cohort, members 6–10 came back at least twice more.
  const cohort = memberRows.filter((m) => m.status === "FIRST_TIMER" && m.firstVisitOn && m.firstVisitOn !== sundays[0]);
  for (const [i, m] of cohort.entries()) {
    const firstEvent = p1Events.find((e) => e.date === m.firstVisitOn);
    const later = p1Events.filter((e) => e.date > m.firstVisitOn! && e.date <= addDays(m.firstVisitOn!, 29));
    const returns = i < 5 ? later.slice(0, 3) : later.slice(0, i % 2);
    for (const ev of [firstEvent, ...returns].filter(Boolean) as { id: string }[]) {
      await db.insert(s.attendanceCheckins).values({ serviceEventId: ev.id, memberId: m.id, recordedBy: U.usher1.id }).onConflictDoNothing();
    }
  }
  // Recent first-timers checked in on the latest Sunday.
  for (const m of memberRows.filter((m) => m.firstVisitOn === sundays[0])) {
    await db.insert(s.attendanceCheckins).values({ serviceEventId: p1Events[0].id, memberId: m.id, recordedBy: U.usher1.id });
  }

  // Milestones for a few members.
  await db.insert(s.memberMilestones).values([
    { memberId: memberRows[0].id, milestone: "WATER_BAPTISM", completedOn: addDays(today, -900) },
    { memberId: memberRows[0].id, milestone: "BELIEVERS_CLASS", completedOn: addDays(today, -880) },
    { memberId: memberRows[0].id, milestone: "WORKERS_IN_TRAINING", completedOn: addDays(today, -700) },
    { memberId: memberRows[1].id, milestone: "BELIEVERS_CLASS", completedOn: addDays(today, -300) },
  ]);

  // --- Other parishes: Sunday service + midweek, 8 weeks ---------------------------
  for (const [idx, parish] of parishRows.slice(1).entries()) {
    const [sunday] = await db.insert(s.serviceTypes).values({ parishId: parish.id, name: "Sunday Service", dayOfWeek: 0, startTime: "08:30", location: "Main auditorium" }).returning();
    await db.insert(s.serviceTypes).values({ parishId: parish.id, name: "Midweek Service", dayOfWeek: 3, startTime: "18:00", location: "Main auditorium" });
    await db.insert(s.sanctuaryZones).values([
      { parishId: parish.id, name: "Main Floor", capacity: 250, sortOrder: 1 },
      { parishId: parish.id, name: "Gallery", capacity: 120, sortOrder: 2 },
    ]);
    const size = [0, 260, 180, 320, 140, 210][idx + 1];
    for (let w = 0; w < 8; w++) {
      const d = sundays[w];
      // Victory Chapel (idx 1) has no report for the last Sunday.
      if (idx === 1 && w === 0) continue;
      let status: s.ReportStatus = "VERIFIED";
      let late: number | undefined;
      // Covenant Parish (idx 2): last Sunday submitted 1 day after, still awaiting the pastor.
      if (idx === 2 && w === 0) status = "SUBMITTED";
      // Dominion Sanctuary (idx 3): last Sunday submitted late (3 days after) and verified.
      if (idx === 3 && w === 0) late = 3;
      await addReport({ parishId: parish.id, type: sunday, date: d, status, size: between(size - 25, size + 25), pastorId: idx === 0 ? U.pastor2.id : null, draftedBy: U.admin.id, submittedLateDays: late });
    }
  }

  // --- Remittance -------------------------------------------------------------------
  await db.insert(s.remittancePolicies).values({
    scopeLevel: "GLOBAL",
    scopeId: null,
    effectiveFrom: "2024-01-01",
    parishPct: "50.00",
    areaPct: "10.00",
    zonePct: "10.00",
    provincePct: "10.00",
    nationalPct: "20.00",
  });
  const lastMonth = addMonths(startOfMonth(today), -1);
  const remStatuses: s.RemittanceStatus[] = ["CLEARED", "CLEARED", "OUTSTANDING", "PARTIAL", "CLEARED", "CLEARED"];
  await db.insert(s.remittances).values(
    parishRows.map((p, i) => {
      const due = between(800_000, 2_400_000) * 100;
      const status = remStatuses[i];
      return {
        parishId: p.id,
        periodMonth: lastMonth,
        amountDueKobo: due,
        amountPaidKobo: status === "CLEARED" ? due : status === "PARTIAL" ? Math.round(due / 2) : 0,
        status,
        clearedAt: status === "CLEARED" ? lagosDateTime(addDays(startOfMonth(today), 3), "10:00") : null,
      };
    }),
  );

  // --- Tasks ------------------------------------------------------------------------
  const nextSunday = addDays(lastSunday, 7);
  const [nextEvent] = await db.insert(s.serviceEvents).values({ parishId: p1.id, serviceTypeId: sun1.id, eventDate: nextSunday, startTime: sun1.startTime }).returning();
  await db.insert(s.tasks).values([
    { parishId: p1.id, serviceEventId: nextEvent.id, departmentId: deptByName["Technical"].id, title: "Test the gallery microphones", priority: "HIGH", status: "TODO", assignedBy: U.hod.id, assignedTo: U.tech.id, dueAt: lagosDateTime(addDays(today, -1), "18:00") },
    { parishId: p1.id, serviceEventId: nextEvent.id, departmentId: deptByName["Technical"].id, title: "Set up livestream camera", priority: "URGENT", status: "IN_PROGRESS", assignedBy: U.hod.id, assignedTo: U.hod.id, dueAt: lagosDateTime(nextSunday, "07:00") },
    { parishId: p1.id, serviceEventId: nextEvent.id, departmentId: deptByName["Ushering"].id, title: "Print offering envelopes", priority: "MEDIUM", status: "IN_REVIEW", assignedBy: U.pastor.id, assignedTo: U.headUsher.id, dueAt: lagosDateTime(addDays(nextSunday, -2), "17:00") },
    { parishId: p1.id, serviceEventId: nextEvent.id, departmentId: deptByName["Sanctuary Keepers"].id, title: "Clean the children's church", priority: "LOW", status: "DONE", assignedBy: U.pastor.id, assignedTo: U.headUsher.id, dueAt: lagosDateTime(addDays(today, -2), "17:00"), completedAt: lagosDateTime(addDays(today, -2), "15:00") },
    { parishId: p1.id, serviceEventId: nextEvent.id, departmentId: deptByName["Ushering"].id, title: "Brief new ushers on zone counting", priority: "MEDIUM", status: "TODO", assignedBy: U.pastor.id, assignedTo: U.usher1.id, dueAt: lagosDateTime(addDays(nextSunday, -1), "17:00") },
  ]);

  return {
    today,
    parishes: parishRows.length,
    members: memberRows.length,
    users: userRows.length,
    reports: reportCount,
    specialServiceType: special.name,
    password: DEV_PASSWORD,
  };
}

function addHours(d: Date, h: number) {
  return new Date(d.getTime() + h * 3_600_000);
}

