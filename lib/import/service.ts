import "server-only";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { writeAudit } from "@/lib/audit";
import { can, ForbiddenError } from "@/lib/auth/permissions";
import type { Access } from "@/lib/auth/scope";
import { todayIso } from "@/lib/dates";
import { db, type DbOrTx, type Tx } from "@/lib/db";
import * as s from "@/lib/db/schema";
import { UserError } from "@/lib/forms";
import { autoMap, type MapTarget } from "./fields";
import type { ExtractedSheet } from "./parse";
import { summarise, validateRows, type DateFormat } from "./validate";

export async function getBatchForUser(access: Access, batchId: string, tx: DbOrTx = db) {
  const [batch] = await tx.select().from(s.importBatches).where(eq(s.importBatches.id, batchId));
  if (!batch) throw new UserError("Import not found.");
  if (!can(access, "runImport", batch.parishId)) throw new ForbiddenError("You can't import for this parish.");
  return batch;
}

export async function createBatch(access: Access, userId: string, parishId: string, fileName: string, sheetName: string, table: ExtractedSheet) {
  if (!can(access, "runImport", parishId)) throw new ForbiddenError("You can't import for this parish.");
  if (table.dataRows.length === 0) throw new UserError("That sheet has no rows under the header.");
  const auto = autoMap(table.headers);
  const columnMap = Object.fromEntries(Object.entries(auto).map(([i, m]) => [i, m.field]));
  const confidence = Object.fromEntries(Object.entries(auto).map(([i, m]) => [i, m.confidence]));
  return db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(s.importBatches)
      .values({
        parishId,
        uploadedBy: userId,
        fileName: fileName.slice(0, 200),
        sheetName: sheetName.slice(0, 100),
        rowCount: table.dataRows.length,
        columnMap,
        dateFormat: "DD/MM/YYYY",
        options: { headerRowIndex: table.headerRowIndex, headers: table.headers, confidence, serviceNameMap: {}, afterImportStatus: "SUBMITTED" },
        status: "UPLOADED",
      })
      .returning();
    const values = table.dataRows.map((r) => ({
      importBatchId: batch.id,
      rowNumber: r.rowNumber,
      raw: Object.fromEntries(r.cells.map((c, i) => [String(i), c])),
    }));
    for (let i = 0; i < values.length; i += 500) await tx.insert(s.importRows).values(values.slice(i, i + 500));
    return batch.id;
  });
}

async function existingKeys(tx: DbOrTx, parishId: string) {
  const rows = await tx
    .select({ typeId: s.serviceEvents.serviceTypeId, date: s.serviceEvents.eventDate, occ: s.serviceEvents.occurrence })
    .from(s.serviceEvents)
    .innerJoin(s.serviceReports, eq(s.serviceReports.serviceEventId, s.serviceEvents.id))
    .where(eq(s.serviceEvents.parishId, parishId));
  return new Set(rows.map((r) => `${r.typeId}|${r.date}|${r.occ}`));
}

async function parishServiceTypes(tx: DbOrTx, parishId: string) {
  return tx
    .select({ id: s.serviceTypes.id, name: s.serviceTypes.name, recurrence: s.serviceTypes.recurrence, dayOfWeek: s.serviceTypes.dayOfWeek, maxPerDay: s.serviceTypes.maxPerDay, startTime: s.serviceTypes.startTime })
    .from(s.serviceTypes)
    .where(eq(s.serviceTypes.parishId, parishId))
    .orderBy(asc(s.serviceTypes.name));
}

/** Re-runs validation for every row of the batch and stores the results (dry run). */
export async function revalidate(tx: Tx, batch: typeof s.importBatches.$inferSelect) {
  const rows = await tx.select().from(s.importRows).where(eq(s.importRows.importBatchId, batch.id)).orderBy(asc(s.importRows.rowNumber));
  const results = validateRows(
    rows.map((r) => ({ rowNumber: r.rowNumber, raw: r.raw, resolution: r.resolution })),
    {
      columnMap: batch.columnMap as Record<string, MapTarget>,
      dateFormat: batch.dateFormat as DateFormat,
      serviceTypes: await parishServiceTypes(tx, batch.parishId),
      defaultServiceTypeId: batch.options.defaultServiceTypeId ?? null,
      serviceNameMap: (batch.options.serviceNameMap ?? {}) as Record<string, string>,
      existingKeys: await existingKeys(tx, batch.parishId),
      today: todayIso(),
    },
  );
  const byNumber = new Map(results.map((r) => [r.rowNumber, r]));
  const payload = rows.map((r) => {
    const res = byNumber.get(r.rowNumber)!;
    return { id: r.id, parsed: res.parsed, issues: res.issues, outcome: res.outcome };
  });
  for (let i = 0; i < payload.length; i += 1000) {
    const chunk = JSON.stringify(payload.slice(i, i + 1000));
    await tx.execute(sql`
      update import_rows r set parsed = v.parsed, issues = v.issues, outcome = v.outcome::import_outcome, updated_at = now()
      from jsonb_to_recordset(${chunk}::jsonb) as v(id uuid, parsed jsonb, issues jsonb, outcome text)
      where r.id = v.id`);
  }
  const summary = summarise(results);
  await tx
    .update(s.importBatches)
    .set({ status: "VALIDATED", options: { ...batch.options, summary } })
    .where(eq(s.importBatches.id, batch.id));
  return summary;
}

export async function saveMapping(
  access: Access,
  batchId: string,
  input: { columnMap: Record<string, MapTarget>; dateFormat: DateFormat; defaultServiceTypeId: string | null },
) {
  return db.transaction(async (tx) => {
    const batch = await getBatchForUser(access, batchId, tx);
    if (batch.status === "COMMITTED" || batch.status === "UNDONE") throw new UserError("This import is finished.");
    const used = Object.values(input.columnMap).filter((f) => f !== "skip");
    if (new Set(used).size !== used.length) throw new UserError("Two columns are matched to the same field. Each field can only be used once.");
    if (!used.includes("event_date")) throw new UserError("Match one column to Date.");
    if (!used.includes("service_type") && !input.defaultServiceTypeId) throw new UserError("Match a Service column, or choose which service every row is for.");
    const updated = { ...batch, columnMap: input.columnMap, dateFormat: input.dateFormat, options: { ...batch.options, defaultServiceTypeId: input.defaultServiceTypeId }, status: "MAPPED" as const };
    await tx.update(s.importBatches).set({ columnMap: updated.columnMap, dateFormat: updated.dateFormat, options: updated.options, status: "MAPPED" }).where(eq(s.importBatches.id, batchId));
    return revalidate(tx, updated);
  });
}

/** Sets one resolution on several rows at once ("apply to all"). */
export async function setResolution(access: Access, batchId: string, rowIds: string[], key: string, value: string) {
  return db.transaction(async (tx) => {
    const batch = await getBatchForUser(access, batchId, tx);
    if (batch.status !== "VALIDATED") throw new UserError("This import can't be changed now.");
    if (rowIds.length) {
      await tx
        .update(s.importRows)
        .set({ resolution: sql`${s.importRows.resolution} || jsonb_build_object(${key}::text, ${value}::text)` })
        .where(and(eq(s.importRows.importBatchId, batchId), inArray(s.importRows.id, rowIds)));
    }
    return revalidate(tx, batch);
  });
}

export async function setServiceName(access: Access, batchId: string, name: string, target: string) {
  return db.transaction(async (tx) => {
    const batch = await getBatchForUser(access, batchId, tx);
    if (batch.status !== "VALIDATED") throw new UserError("This import can't be changed now.");
    const options = { ...batch.options, serviceNameMap: { ...(batch.options.serviceNameMap ?? {}), [name]: target } };
    await tx.update(s.importBatches).set({ options }).where(eq(s.importBatches.id, batchId));
    return revalidate(tx, { ...batch, options });
  });
}

/** Step 4: one transaction creates the missing services and their reports. */
export async function commitBatch(access: Access, userId: string, batchId: string, afterStatus: "SUBMITTED" | "VERIFIED") {
  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(s.importBatches).where(eq(s.importBatches.id, batchId)).for("update");
    if (!locked) throw new UserError("Import not found.");
    const batch = await getBatchForUser(access, batchId, tx);
    if (batch.status !== "VALIDATED") throw new UserError(batch.status === "COMMITTED" ? "This import was already committed." : "Review the rows first.");
    if (afterStatus === "VERIFIED" && !can(access, "verifyAtImport", batch.parishId)) throw new ForbiddenError("Only the parish pastor can mark imported services as verified.");

    const summary = await revalidate(tx, batch);
    if (summary.NEEDS_FIX > 0) throw new UserError(`${summary.NEEDS_FIX} row${summary.NEEDS_FIX === 1 ? "" : "s"} still need a fix.`);
    const ready = await tx
      .select()
      .from(s.importRows)
      .where(and(eq(s.importRows.importBatchId, batchId), eq(s.importRows.outcome, "READY")))
      .orderBy(asc(s.importRows.rowNumber));
    if (ready.length === 0) throw new UserError("There are no rows ready to import.");

    const types = new Map((await parishServiceTypes(tx, batch.parishId)).map((t) => [t.id, t]));
    const now = new Date();
    let createdEvents = 0;
    const dates: string[] = [];
    for (const row of ready) {
      const p = row.parsed!;
      const type = types.get(p.serviceTypeId!)!;
      const [existing] = await tx
        .select({ id: s.serviceEvents.id })
        .from(s.serviceEvents)
        .where(and(eq(s.serviceEvents.parishId, batch.parishId), eq(s.serviceEvents.serviceTypeId, type.id), eq(s.serviceEvents.eventDate, p.eventDate!), eq(s.serviceEvents.occurrence, p.occurrence)));
      let eventId = existing?.id;
      if (!eventId) {
        [{ id: eventId }] = await tx
          .insert(s.serviceEvents)
          .values({ parishId: batch.parishId, serviceTypeId: type.id, eventDate: p.eventDate!, startTime: type.startTime, occurrence: p.occurrence, preacher: p.preacher, importBatchId: batch.id })
          .returning({ id: s.serviceEvents.id });
        createdEvents++;
      } else if (p.preacher) {
        await tx.update(s.serviceEvents).set({ preacher: p.preacher }).where(eq(s.serviceEvents.id, eventId));
      }
      await tx.insert(s.serviceReports).values({
        serviceEventId: eventId,
        men: p.men,
        women: p.women,
        children: p.children,
        firstTimers: p.firstTimers,
        workersOnDuty: p.workersOnDuty,
        offeringKobo: p.offeringKobo,
        titheKobo: p.titheKobo,
        specialSeedKobo: p.specialSeedKobo,
        notes: p.notes,
        source: "IMPORT",
        importBatchId: batch.id,
        status: afterStatus,
        draftedBy: userId,
        submittedAt: now,
        submittedBy: userId,
        verifiedBy: afterStatus === "VERIFIED" ? userId : null,
        verifiedAt: afterStatus === "VERIFIED" ? now : null,
        createdAt: now,
        updatedAt: now,
      });
      dates.push(p.eventDate!);
    }
    await tx.update(s.importRows).set({ outcome: "IMPORTED" }).where(inArray(s.importRows.id, ready.map((r) => r.id)));
    dates.sort();
    const result = { imported: ready.length, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null, createdEvents };
    await tx
      .update(s.importBatches)
      .set({ status: "COMMITTED", committedAt: now, committedBy: userId, options: { ...batch.options, summary, afterImportStatus: afterStatus, result } })
      .where(eq(s.importBatches.id, batchId));
    await writeAudit(tx, { actorUserId: userId, entity: "import_batch", entityId: batchId, action: "commit", after: result });
    return result;
  });
}

export type UndoResult = { done: true; removedReports: number; removedEvents: number } | { done: false; edited: { reportId: string; date: string; serviceName: string }[] };

/** Undo: removes exactly the reports (and services) this batch created. Asks before removing edited ones. */
export async function undoBatch(access: Access, userId: string, batchId: string, confirmEdited: boolean): Promise<UndoResult> {
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(s.importBatches).where(eq(s.importBatches.id, batchId)).for("update");
    if (!batch) throw new UserError("Import not found.");
    if (!access.parishIds.includes(batch.parishId)) throw new ForbiddenError();
    if (batch.committedBy !== userId && !can(access, "verifyReport", batch.parishId)) throw new ForbiddenError("Only the person who imported this, or the parish pastor, can undo it.");
    if (batch.status !== "COMMITTED") throw new UserError("Only a committed import can be undone.");

    const reports = await tx
      .select({ id: s.serviceReports.id, updatedAt: s.serviceReports.updatedAt, createdAt: s.serviceReports.createdAt, status: s.serviceReports.status, date: s.serviceEvents.eventDate, serviceName: s.serviceTypes.name })
      .from(s.serviceReports)
      .innerJoin(s.serviceEvents, eq(s.serviceEvents.id, s.serviceReports.serviceEventId))
      .innerJoin(s.serviceTypes, eq(s.serviceTypes.id, s.serviceEvents.serviceTypeId))
      .where(eq(s.serviceReports.importBatchId, batchId));
    const reportIds = reports.map((r) => r.id);
    const touched = reportIds.length
      ? await tx.selectDistinct({ id: s.auditLog.entityId }).from(s.auditLog).where(and(eq(s.auditLog.entity, "service_report"), inArray(s.auditLog.entityId, reportIds)))
      : [];
    const touchedIds = new Set(touched.map((t) => t.id));
    const edited = reports.filter((r) => touchedIds.has(r.id) || r.updatedAt.getTime() - r.createdAt.getTime() > 1000);
    if (edited.length && !confirmEdited) return { done: false, edited: edited.map((r) => ({ reportId: r.id, date: r.date, serviceName: r.serviceName })) };

    if (reportIds.length) await tx.delete(s.serviceReports).where(inArray(s.serviceReports.id, reportIds));
    // Remove services this batch created, unless something else now hangs off them.
    const created = await tx.select({ id: s.serviceEvents.id }).from(s.serviceEvents).where(eq(s.serviceEvents.importBatchId, batchId));
    let removedEvents = 0;
    for (const { id } of created) {
      const [dep] = await tx.execute<{ n: number }>(sql`
        select (select count(*) from service_reports where service_event_id = ${id})
             + (select count(*) from zone_tallies where service_event_id = ${id})
             + (select count(*) from attendance_checkins where service_event_id = ${id})
             + (select count(*) from usher_assignments where service_event_id = ${id})
             + (select count(*) from tasks where service_event_id = ${id}) as n`);
      if (Number(dep.n) === 0) {
        await tx.delete(s.serviceEvents).where(eq(s.serviceEvents.id, id));
        removedEvents++;
      } else {
        await tx.update(s.serviceEvents).set({ importBatchId: null }).where(eq(s.serviceEvents.id, id));
      }
    }
    await tx.update(s.importRows).set({ outcome: "SKIPPED" }).where(and(eq(s.importRows.importBatchId, batchId), eq(s.importRows.outcome, "IMPORTED")));
    await tx.update(s.importBatches).set({ status: "UNDONE", undoneAt: new Date(), undoneBy: userId }).where(eq(s.importBatches.id, batchId));
    await writeAudit(tx, {
      actorUserId: userId,
      entity: "import_batch",
      entityId: batchId,
      action: "undo",
      before: { reports: reports.length, editedConfirmed: edited.map((e) => e.id) },
      after: { removedReports: reportIds.length, removedEvents },
    });
    return { done: true, removedReports: reportIds.length, removedEvents };
  });
}

export async function getBatchView(access: Access, batchId: string) {
  const batch = await getBatchForUser(access, batchId);
  const [rows, types] = await Promise.all([
    db.select().from(s.importRows).where(eq(s.importRows.importBatchId, batchId)).orderBy(asc(s.importRows.rowNumber)),
    parishServiceTypes(db, batch.parishId),
  ]);
  return { batch, rows, types };
}

export async function recentBatches(access: Access, parishId: string) {
  if (!can(access, "runImport", parishId)) return [];
  return db
    .select()
    .from(s.importBatches)
    .where(and(eq(s.importBatches.parishId, parishId), isNotNull(s.importBatches.id)))
    .orderBy(sql`${s.importBatches.createdAt} desc`)
    .limit(10);
}
