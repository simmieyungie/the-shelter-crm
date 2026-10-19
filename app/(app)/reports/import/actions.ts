"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAppContext } from "@/lib/auth/context";
import { type ActionState, optionalUuid, runAction, uuid } from "@/lib/forms";
import { IMPORT_FIELDS, SKIP } from "@/lib/import/fields";
import { commitBatch, saveMapping, setResolution, setServiceName, undoBatch } from "@/lib/import/service";
import { DATE_FORMATS } from "@/lib/import/validate";

const fieldKeys = [SKIP, ...IMPORT_FIELDS.map((f) => f.key as string)] as [string, ...string[]];

export async function saveMappingAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let ok = false;
  let batchId = "";
  const result = await runAction(
    z.object({ batchId: uuid(), dateFormat: z.enum(DATE_FORMATS as [string, ...string[]]), defaultServiceTypeId: optionalUuid() }).passthrough(),
    fd,
    async (d) => {
      const { access } = await requireAppContext();
      const columnMap: Record<string, (typeof fieldKeys)[number]> = {};
      for (const [k, v] of fd.entries()) {
        const m = k.match(/^col_(\d+)$/);
        if (m) columnMap[m[1]] = z.enum(fieldKeys).parse(String(v));
      }
      await saveMapping(access, d.batchId, { columnMap: columnMap as never, dateFormat: d.dateFormat as never, defaultServiceTypeId: d.defaultServiceTypeId });
      ok = true;
      batchId = d.batchId;
    },
  );
  if (ok) redirect(`/reports/import/${batchId}?step=review`);
  return result;
}

const resolutionSchema = z.object({ batchId: uuid(), key: z.string().min(1).max(60), value: z.string().min(1).max(60), rowIds: z.string() });

export async function setResolutionAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(resolutionSchema, fd, async (d) => {
    const { access } = await requireAppContext();
    const ids = d.rowIds.split(",").filter(Boolean).slice(0, 5000);
    await setResolution(access, d.batchId, ids, d.key, d.value);
    revalidatePath(`/reports/import/${d.batchId}`);
    return ids.length > 1 ? `Applied to ${ids.length} rows` : "Updated";
  });
}

export async function setServiceNameAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(z.object({ batchId: uuid(), name: z.string().min(1), target: z.string().min(1) }), fd, async (d) => {
    const { access } = await requireAppContext();
    await setServiceName(access, d.batchId, d.name, d.target);
    revalidatePath(`/reports/import/${d.batchId}`);
    return "Service matched";
  });
}

export async function commitAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  let done = "";
  const result = await runAction(z.object({ batchId: uuid(), afterStatus: z.enum(["SUBMITTED", "VERIFIED"]) }), fd, async (d) => {
    const { access, user } = await requireAppContext();
    await commitBatch(access, user.id, d.batchId, d.afterStatus);
    revalidatePath("/reports");
    done = d.batchId;
  });
  if (done) redirect(`/reports/import/${done}?step=done`);
  return result;
}

export async function undoAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(z.object({ batchId: uuid(), confirmEdited: z.enum(["yes", "no"]) }), fd, async (d) => {
    const { access, user } = await requireAppContext();
    const res = await undoBatch(access, user.id, d.batchId, d.confirmEdited === "yes");
    revalidatePath("/reports");
    revalidatePath(`/reports/import/${d.batchId}`);
    if (!res.done) return { ok: false, message: "Some imported reports were changed after import.", data: { edited: res.edited } };
    return `Import undone. ${res.removedReports} report${res.removedReports === 1 ? "" : "s"} removed.`;
  });
}
