import { FileSpreadsheet, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/status-pill";
import { Button } from "@/components/ui/button";
import { requireParishContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDay, ordinal } from "@/lib/dates";
import { listReportsWithGaps, type ReportRow } from "@/lib/db/queries/reports-list";
import { formatKobo } from "@/lib/money";
import { reportPill, totalAttendance } from "@/lib/reports/status";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; type?: string }> }) {
  const { access, parish } = await requireParishContext();
  if (!can(access, "viewReports", parish.id)) redirect("/");
  const sp = await searchParams;
  const { rows, from, to, types, gapCount } = await listReportsWithGaps(access, parish.id, { from: sp.from, to: sp.to, typeId: sp.type });
  const canImport = can(access, "runImport", parish.id);
  const canAdd = can(access, "addPastService", parish.id);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${parish.name} · services and collections`}
        actions={
          <>
            {canImport && (
              <Button asChild variant="outline" className="h-10">
                <Link href="/reports/import">
                  <FileSpreadsheet className="size-4" aria-hidden /> Import spreadsheet
                </Link>
              </Button>
            )}
            {canAdd && (
              <Button asChild className="h-10">
                <Link href="/reports/new">
                  <Plus className="size-4" aria-hidden /> Add past service
                </Link>
              </Button>
            )}
          </>
        }
      />

      <form action="/reports" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="from" className="block text-xs text-subtle">
            From
          </label>
          <input id="from" name="from" type="date" defaultValue={from} max={to} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label htmlFor="to" className="block text-xs text-subtle">
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={to} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label htmlFor="type" className="block text-xs text-subtle">
            Service
          </label>
          <select id="type" name="type" defaultValue={sp.type ?? ""} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="">All services</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium">Show</button>
      </form>

      {gapCount > 0 && (canAdd || canImport) && (
        <div data-testid="backlog-banner" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-danger/40 bg-surface p-4">
          <div>
            <p className="font-semibold">
              {gapCount} past service{gapCount === 1 ? " has" : "s have"} no record
            </p>
            <p className="text-sm text-subtle">Between {formatDay(from)} and {formatDay(to)}. Type them in or import your spreadsheet.</p>
          </div>
          {canImport && (
            <Button asChild variant="outline" className="h-10">
              <Link href="/reports/import">Import now</Link>
            </Button>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="hidden grid-cols-[150px_1fr_110px_150px_150px] gap-3 border-b border-line px-4 py-2 text-xs font-medium text-subtle md:grid">
          <span>Date</span>
          <span>Service</span>
          <span className="text-right">Attendance</span>
          <span className="text-right">Collections</span>
          <span className="text-right">Status</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <Row key={r.kind === "report" ? r.reportId : `gap:${r.serviceTypeId}:${r.date}`} r={r} canAdd={canAdd} />
          ))}
          {rows.length === 0 && <li className="p-6 text-center text-sm text-subtle">No services in this range.</li>}
        </ul>
      </div>
    </>
  );
}

function Row({ r, canAdd }: { r: ReportRow; canAdd: boolean }) {
  if (r.kind === "gap") {
    const content = (
      <>
        <span className="text-sm font-medium md:font-normal">{formatDay(r.date)}</span>
        <span className="text-sm text-ink">{r.serviceName}</span>
        <span className="hidden text-right font-mono text-sm text-subtle md:block">—</span>
        <span className="hidden text-right font-mono text-sm text-subtle md:block">—</span>
        <span className="md:text-right">
          <StatusPill tone="danger">No record · add</StatusPill>
        </span>
      </>
    );
    return (
      <li data-testid="gap-row">
        {canAdd ? (
          <Link href={`/reports/new?type=${r.serviceTypeId}&date=${r.date}`} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/60 md:grid-cols-[150px_1fr_110px_150px_150px] md:items-center">
            {content}
          </Link>
        ) : (
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[150px_1fr_110px_150px_150px] md:items-center">{content}</div>
        )}
      </li>
    );
  }
  const [tone, label] = reportPill(r.status, r.source);
  const total = totalAttendance(r);
  return (
    <li>
      <Link
        href={`/reports/${r.reportId}`}
        className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/60 md:grid-cols-[150px_1fr_110px_150px_150px] md:items-center"
      >
        <span className="text-sm font-medium md:font-normal">{formatDay(r.date)}</span>
        <span className="order-3 text-sm text-ink md:order-none">
          {r.serviceName}
          {r.occurrence > 1 ? ` (${ordinal(r.occurrence)})` : ""}
        </span>
        <span className="order-4 font-mono text-sm md:order-none md:text-right">
          <span className="text-subtle md:hidden">Attendance </span>
          {total === null ? "—" : total.toLocaleString("en-NG")}
        </span>
        <span className="order-5 col-span-2 font-mono text-sm md:order-none md:col-span-1 md:text-right">
          <span className="text-subtle md:hidden">Collections </span>
          {formatKobo(r.collectionsKobo)}
        </span>
        <span className="order-2 md:order-none md:text-right">
          <StatusPill tone={tone}>{label}</StatusPill>
        </span>
      </Link>
    </li>
  );
}
