import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { loadAccess, type Access } from "@/lib/auth/scope";
import { todayIso } from "@/lib/dates";
import { db } from "@/lib/db";
import { zoneOverview } from "@/lib/zone/overview";
import { lastSundays, periodFor, remittanceMonths } from "@/lib/zone/period";
import { userByEmail } from "../support/db";

let zonal: Access;
const today = todayIso();

beforeAll(async () => {
  zonal = await loadAccess((await userByEmail("zonalpastor@example.com")).id);
});

/** Independent, hand-written SQL for each number. */
async function handSundayAttendance(from: string, to: string) {
  const rows = await db.execute<{ n: string | null }>(sql`
    select sum(r.men + r.women + r.children) as n
    from service_reports r join service_events e on e.id = r.service_event_id
    where r.status = 'VERIFIED' and e.event_date between ${from} and ${to}
      and extract(dow from e.event_date) = 0
      and r.men is not null and r.women is not null and r.children is not null`);
  return Number(rows[0].n ?? 0);
}

describe("zone overview numbers match hand-computed SQL", () => {
  for (const key of ["week", "month", "quarter"] as const) {
    it(`Sunday attendance (${key})`, async () => {
      const data = await zoneOverview(zonal.overviewParishIds, key);
      const p = periodFor(key, today);
      expect(data.kpis.attendance).toBe(await handSundayAttendance(p.start, p.end));
    });
  }

  it("8-week trend", async () => {
    const data = await zoneOverview(zonal.overviewParishIds, "week");
    for (const d of lastSundays(today)) {
      const point = data.trend.find((t) => t.date === d)!;
      expect(point.total, d).toBe(await handSundayAttendance(d, d));
    }
  });

  it("remittance cleared", async () => {
    const data = await zoneOverview(zonal.overviewParishIds, "month");
    const [month] = remittanceMonths("month", today);
    const rows = await db.execute<{ n: string }>(sql`select count(*) as n from remittances where period_month = ${month} and status = 'CLEARED'`);
    expect(data.kpis.remittance.cleared).toBe(Number(rows[0].n));
    expect(data.kpis.remittance.total).toBe(6);
  });

  it("first-timer retention", async () => {
    const data = await zoneOverview(zonal.overviewParishIds, "week");
    const rows = await db.execute<{ cohort: string; retained: string }>(sql`
      with cohort as (
        select m.id, m.first_visit_on from members m
        where m.first_visit_on between ${today}::date - 60 and ${today}::date - 30)
      select count(*) as cohort,
             count(*) filter (where (select count(*) from attendance_checkins c join service_events e on e.id = c.service_event_id
                                     where c.member_id = cohort.id and e.event_date between cohort.first_visit_on and cohort.first_visit_on + 29) >= 3) as retained
      from cohort`);
    expect(data.kpis.retention.cohort).toBe(Number(rows[0].cohort));
    expect(data.kpis.retention.retained).toBe(Number(rows[0].retained));
    expect(data.kpis.retention.cohort).toBeGreaterThan(0);
  });

  it("only VERIFIED reports count", async () => {
    const before = await zoneOverview(zonal.overviewParishIds, "quarter");
    const unverified = await db.execute<{ n: string | null }>(sql`
      select sum(r.men + r.women + r.children) as n from service_reports r join service_events e on e.id = r.service_event_id
      where r.status <> 'VERIFIED' and extract(dow from e.event_date) = 0 and e.event_date between ${before.period.start} and ${before.period.end}`);
    expect(Number(unverified[0].n ?? 0)).toBeGreaterThan(0); // seed has drafts / submitted reports in range
    expect(before.kpis.attendance).toBe(await handSundayAttendance(before.period.start, before.period.end));
  });

  it("flags the seeded compliance cases", async () => {
    const data = await zoneOverview(zonal.overviewParishIds, "week");
    const by = Object.fromEntries(data.rows.map((r) => [r.parishName, r]));
    expect(by["Victory Chapel"]).toMatchObject({ report: "Overdue", finances: "Not logged" });
    expect(by["Covenant Parish"]).toMatchObject({ finances: "Awaiting pastor", remittance: "Outstanding" });
    expect(by["Dominion Sanctuary"].report).toBe("Late");
    expect(by["Shelter Parish"].report).toBe("Overdue"); // its 2nd Sunday service is still a draft
    expect(by["Hope Centre"].overall).toBe("On track");
  });

  it("an area pastor only sees their area", async () => {
    const area = await loadAccess((await userByEmail("areapastor@example.com")).id);
    const data = await zoneOverview(area.overviewParishIds, "week");
    expect(new Set(data.rows.map((r) => r.areaName))).toEqual(new Set(["Ikeja Area"]));
  });
});
