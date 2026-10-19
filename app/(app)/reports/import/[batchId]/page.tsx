import { notFound, redirect } from "next/navigation";
import { ImportStepper } from "@/components/app/import-stepper";
import { PageHeader } from "@/components/app/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getBatchView } from "@/lib/import/service";
import { DoneStep } from "./done-step";
import { MapStep } from "./map-step";
import { ReviewStep } from "./review-step";

export const metadata = { title: "Import spreadsheet" };
export const dynamic = "force-dynamic";

export default async function BatchPage({ params, searchParams }: { params: Promise<{ batchId: string }>; searchParams: Promise<{ step?: string; show?: string }> }) {
  const { batchId } = await params;
  const sp = await searchParams;
  const { access, user } = await requireAppContext();
  const view = await getBatchView(access, batchId).catch(() => null);
  if (!view) notFound();
  const { batch, rows, types } = view;
  const finished = batch.status === "COMMITTED" || batch.status === "UNDONE";
  let step = sp.step ?? (finished ? "done" : batch.status === "VALIDATED" ? "review" : "map");
  if (finished) step = "done";
  if (step === "review" && batch.status !== "VALIDATED") redirect(`/reports/import/${batchId}?step=map`);
  const stepIndex = ({ map: 1, review: 2, done: 3 } as const)[step as "map" | "review" | "done"] ?? 1;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Import past services" subtitle={`${batch.fileName} · sheet "${batch.sheetName}" · ${batch.rowCount} rows`} back="/reports/import" />
      <ImportStepper step={stepIndex as 1 | 2 | 3} />
      {step === "map" && (
        <MapStep
          batchId={batch.id}
          headers={batch.options.headers}
          columnMap={batch.columnMap}
          confidence={batch.options.confidence ?? {}}
          dateFormat={batch.dateFormat}
          defaultServiceTypeId={batch.options.defaultServiceTypeId ?? null}
          samples={rows.slice(0, 4).map((r) => r.raw)}
          types={types.map((t) => ({ id: t.id, name: t.name }))}
        />
      )}
      {step === "review" && (
        <ReviewStep
          batchId={batch.id}
          rows={rows.map((r) => ({ id: r.id, rowNumber: r.rowNumber, parsed: r.parsed, issues: r.issues, resolution: r.resolution, outcome: r.outcome! }))}
          types={types.map((t) => ({ id: t.id, name: t.name }))}
          show={sp.show}
          canVerify={can(access, "verifyAtImport", batch.parishId)}
        />
      )}
      {step === "done" && (
        <DoneStep
          batchId={batch.id}
          status={batch.status}
          result={batch.options.result ?? null}
          afterStatus={batch.options.afterImportStatus ?? "SUBMITTED"}
          canUndo={batch.status === "COMMITTED" && (batch.committedBy === user.id || can(access, "verifyReport", batch.parishId))}
        />
      )}
    </div>
  );
}
