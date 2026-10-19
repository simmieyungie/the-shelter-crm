import Link from "next/link";
import { redirect } from "next/navigation";
import { ImportStepper } from "@/components/app/import-stepper";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/status-pill";
import { requireParishContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDateTime } from "@/lib/dates";
import { recentBatches } from "@/lib/import/service";
import { UploadStep } from "./upload-step";

export const metadata = { title: "Import spreadsheet" };

const STATUS = { UPLOADED: ["neutral", "Not finished"], MAPPED: ["neutral", "Not finished"], VALIDATED: ["warning", "In review"], COMMITTED: ["success", "Imported"], UNDONE: ["neutral", "Undone"] } as const;

export default async function ImportPage() {
  const { access, parish } = await requireParishContext();
  if (!can(access, "runImport", parish.id)) redirect("/reports");
  const batches = await recentBatches(access, parish.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Import past services" subtitle={`Bring in ${parish.name}'s history from Excel or CSV.`} back="/reports" />
      <ImportStepper step={0} />
      <UploadStep parishId={parish.id} />
      {batches.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold">Recent imports</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {batches.map((b) => (
              <li key={b.id}>
                <Link href={`/reports/import/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/60">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {b.fileName} · {b.sheetName}
                    </span>
                    <span className="block text-xs text-subtle">
                      {formatDateTime(b.createdAt)} · {b.rowCount} rows
                    </span>
                  </span>
                  <StatusPill tone={STATUS[b.status][0]}>{STATUS[b.status][1]}</StatusPill>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
