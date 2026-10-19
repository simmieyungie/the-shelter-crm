import { readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { loadAccess, type Access } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { extractTable, readWorkbook } from "@/lib/import/parse";
import { commitBatch, createBatch, getBatchView, setResolution, setServiceName, undoBatch } from "@/lib/import/service";
import { issueKey } from "@/lib/import/validate";
import { saveMapping } from "@/lib/import/service";
import { userByEmail } from "../support/db";

let parishId: string;
let secretary: { id: string; access: Access };
let pastor: { id: string; access: Access };

beforeAll(async () => {
  [{ id: parishId }] = await db.select({ id: s.parishes.id }).from(s.parishes).where(eq(s.parishes.name, "Shelter Parish"));
  const sec = await userByEmail("secretary@example.com");
  const pas = await userByEmail("pastor@example.com");
  secretary = { id: sec.id, access: await loadAccess(sec.id) };
  pastor = { id: pas.id, access: await loadAccess(pas.id) };
});

function messyTable() {
  const sheets = readWorkbook(readFileSync("tests/fixtures/imports/messy-register.xlsx"), "messy-register.xlsx");
  return extractTable(sheets[0].rows);
}

async function resolveAll(batchId: string) {
  // Map the unknown service, then pick a resolution for every remaining issue (first non-skip option).
  await setServiceName(secretary.access, batchId, "youth service", (await db.select().from(s.serviceTypes).where(and(eq(s.serviceTypes.parishId, parishId), eq(s.serviceTypes.name, "Special Programme"))))[0].id);
  for (let guard = 0; guard < 20; guard++) {
    const { rows } = await getBatchView(secretary.access, batchId);
    const todo = rows.filter((r) => r.outcome === "NEEDS_FIX");
    if (!todo.length) return;
    const r = todo[0];
    const issue = r.issues.find((i) => !r.resolution[issueKey(i)] && !i.defaultResolution)!;
    const choice = issue.type === "DUPLICATE_IN_FILE" ? "skip" : (issue.options.find((o) => o !== "skip") ?? "skip");
    await setResolution(secretary.access, batchId, [r.id], issueKey(issue), choice);
  }
  throw new Error("could not resolve");
}

describe("spreadsheet import", () => {
  let batchId: string;

  it("refuses users without import rights", async () => {
    const usher = await userByEmail("usher1@example.com");
    await expect(createBatch(await loadAccess(usher.id), usher.id, parishId, "x.xlsx", "2026", messyTable())).rejects.toThrow();
  });

  it("detects issues in a dry run without writing reports", async () => {
    const before = await db.select({ n: sql<number>`count(*)::int` }).from(s.serviceReports);
    batchId = await createBatch(secretary.access, secretary.id, parishId, "messy-register.xlsx", "2026", messyTable());
    const { batch } = await getBatchView(secretary.access, batchId);
    const summary = await saveMapping(secretary.access, batchId, { columnMap: batch.columnMap as Record<string, never>, dateFormat: "DD/MM/YYYY", defaultServiceTypeId: null });
    expect(summary.NEEDS_FIX).toBeGreaterThan(0);
    const after = await db.select({ n: sql<number>`count(*)::int` }).from(s.serviceReports);
    expect(after[0].n).toBe(before[0].n);
  });

  it("blocks commit while rows need a fix, and only pastors can verify at import", async () => {
    await expect(commitBatch(secretary.access, secretary.id, batchId, "SUBMITTED")).rejects.toThrow(/need a fix/);
    await resolveAll(batchId);
    await expect(commitBatch(secretary.access, secretary.id, batchId, "VERIFIED")).rejects.toThrow(/pastor/);
  });

  it("commits atomically, storing blanks as NULL", async () => {
    const result = await commitBatch(secretary.access, secretary.id, batchId, "SUBMITTED");
    expect(result.imported).toBeGreaterThan(5);
    expect(result.firstDate).toBe("2026-03-01");
    const reports = await db.select().from(s.serviceReports).where(eq(s.serviceReports.importBatchId, batchId));
    expect(reports).toHaveLength(result.imported);
    expect(reports.every((r) => r.source === "IMPORT" && r.status === "SUBMITTED")).toBe(true);
    const row22 = reports.find((r) => r.men === 140)!;
    expect(row22.women).toBeNull(); // blank stayed unknown
  });

  it("skips duplicates of services already in the app", async () => {
    const id2 = await createBatch(secretary.access, secretary.id, parishId, "again.xlsx", "2026", messyTable());
    const { batch } = await getBatchView(secretary.access, id2);
    const summary = await saveMapping(secretary.access, id2, { columnMap: batch.columnMap as Record<string, never>, dateFormat: "DD/MM/YYYY", defaultServiceTypeId: null });
    expect(summary.DUPLICATE).toBeGreaterThanOrEqual(6);
  });

  it("undo removes exactly that batch, asking first about edited reports", async () => {
    const otherReports = await db.select({ n: sql<number>`count(*)::int` }).from(s.serviceReports).where(sql`${s.serviceReports.importBatchId} is distinct from ${batchId}`);
    const [one] = await db.select().from(s.serviceReports).where(eq(s.serviceReports.importBatchId, batchId)).limit(1);
    await db.insert(s.auditLog).values({ actorUserId: secretary.id, entity: "service_report", entityId: one.id, action: "save" });

    const usher = await userByEmail("usher1@example.com");
    await expect(undoBatch(await loadAccess(usher.id), usher.id, batchId, false)).rejects.toThrow();

    const ask = await undoBatch(pastor.access, pastor.id, batchId, false);
    expect(ask.done).toBe(false);
    if (!ask.done) expect(ask.edited.map((e) => e.reportId)).toEqual([one.id]);

    const done = await undoBatch(pastor.access, pastor.id, batchId, true);
    expect(done.done).toBe(true);
    expect(await db.select().from(s.serviceReports).where(eq(s.serviceReports.importBatchId, batchId))).toHaveLength(0);
    expect(await db.select().from(s.serviceEvents).where(eq(s.serviceEvents.importBatchId, batchId))).toHaveLength(0);
    const still = await db.select({ n: sql<number>`count(*)::int` }).from(s.serviceReports);
    expect(still[0].n).toBe(otherReports[0].n);
    const [b] = await db.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
    expect(b.status).toBe("UNDONE");
  });
});
