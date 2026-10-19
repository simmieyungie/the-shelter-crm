import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { loadAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { saveReportTx, transitionReportTx, type ReportInput } from "@/lib/reports/mutations";
import { userByEmail } from "../support/db";

const input: ReportInput = {
  men: 100,
  women: 120,
  children: 30,
  firstTimers: 4,
  workersOnDuty: 22,
  offeringKobo: 14_500_050,
  titheKobo: null,
  specialSeedKobo: 0,
  notes: "Good service",
  preacher: "Pastor Segun",
  theme: null,
  typeAttendance: true,
};

let reportId: string;

beforeAll(async () => {
  const [p1] = await db.select().from(s.parishes).where(eq(s.parishes.name, "Shelter Parish"));
  const [type] = await db.select().from(s.serviceTypes).where(and(eq(s.serviceTypes.parishId, p1.id), eq(s.serviceTypes.name, "Accelerate")));
  const [ev] = await db.insert(s.serviceEvents).values({ parishId: p1.id, serviceTypeId: type.id, eventDate: "2026-01-06", startTime: type.startTime }).returning();
  const [r] = await db.insert(s.serviceReports).values({ serviceEventId: ev.id, source: "MANUAL", status: "DRAFT" }).returning();
  reportId = r.id;
});

async function as(email: string) {
  const u = await userByEmail(email);
  return { user: u, access: await loadAccess(u.id) };
}

describe("service report workflow", () => {
  it("stores blanks as unknown and money as kobo, then submits", async () => {
    const { user, access } = await as("secretary@example.com");
    const after = await db.transaction((tx) => saveReportTx(tx, access, user.id, reportId, input, true));
    expect(after).toMatchObject({ status: "SUBMITTED", offeringKobo: 14_500_050, titheKobo: null, specialSeedKobo: 0, submittedBy: user.id });
  });

  it("does not let an usher or a head usher verify", async () => {
    for (const email of ["usher1@example.com", "headusher@example.com"]) {
      const { user, access } = await as(email);
      await expect(db.transaction((tx) => transitionReportTx(tx, access, user.id, reportId, "verify"))).rejects.toThrow();
    }
  });

  it("lets the parish pastor verify, after which fields are locked", async () => {
    const pastor = await as("pastor@example.com");
    const v = await db.transaction((tx) => transitionReportTx(tx, pastor.access, pastor.user.id, reportId, "verify"));
    expect(v.status).toBe("VERIFIED");
    const sec = await as("secretary@example.com");
    await expect(db.transaction((tx) => saveReportTx(tx, sec.access, sec.user.id, reportId, { ...input, men: 1 }, false))).rejects.toThrow(/locked/);
    const [row] = await db.select().from(s.serviceReports).where(eq(s.serviceReports.id, reportId));
    expect(row.men).toBe(100);
  });

  it("only lets HEAD_USHER or PARISH_PASTOR reopen", async () => {
    const sec = await as("secretary@example.com");
    await expect(db.transaction((tx) => transitionReportTx(tx, sec.access, sec.user.id, reportId, "reopen"))).rejects.toThrow(/Head Usher or Parish Pastor/);
    const other = await as("pastor2@example.com");
    await expect(db.transaction((tx) => transitionReportTx(tx, other.access, other.user.id, reportId, "reopen"))).rejects.toThrow();
    const hu = await as("headusher@example.com");
    const r = await db.transaction((tx) => transitionReportTx(tx, hu.access, hu.user.id, reportId, "reopen"));
    expect(r).toMatchObject({ status: "REOPENED", verifiedBy: null });
  });

  it("records every change after reopening in the audit log", async () => {
    const hu = await as("headusher@example.com");
    await db.transaction((tx) => saveReportTx(tx, hu.access, hu.user.id, reportId, { ...input, men: 101 }, false));
    const rows = await db.select().from(s.auditLog).where(and(eq(s.auditLog.entity, "service_report"), eq(s.auditLog.entityId, reportId)));
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["submit", "verify", "reopen", "edit_after_reopen"]));
    const edit = rows.find((r) => r.action === "edit_after_reopen")!;
    expect((edit.before as { men: number }).men).toBe(100);
    expect((edit.after as { men: number }).men).toBe(101);
  });
});
