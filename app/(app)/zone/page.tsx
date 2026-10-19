import { AlertTriangle, Clock, PhoneCall } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { KpiTile } from "@/components/app/kpi-tile";
import { PageHeader } from "@/components/app/page-header";
import { StatusDot, StatusPill, type Tone } from "@/components/app/status-pill";
import { requireAppContext } from "@/lib/auth/context";
import { canSeeZoneOverview } from "@/lib/auth/permissions";
import { formatDateTime, formatDay } from "@/lib/dates";
import { zoneOverview, type FinanceState, type Overall, type RemitState, type ReportState } from "@/lib/zone/overview";
import type { PeriodKey } from "@/lib/zone/period";
import { cn } from "@/lib/utils";
import { TrendChart } from "./trend-chart";

export const metadata = { title: "Zone overview" };
export const dynamic = "force-dynamic";

const REPORT_TONE: Record<ReportState, Tone> = { Submitted: "success", Late: "warning", Overdue: "danger", "Not due yet": "neutral", "No service": "neutral" };
const FIN_TONE: Record<FinanceState, Tone> = { Verified: "success", "Awaiting pastor": "warning", "Not logged": "danger" };
const REMIT_TONE: Record<RemitState, Tone> = { Cleared: "success", Outstanding: "danger", "Not recorded": "neutral" };
const OVERALL_TONE: Record<Overall, Tone> = { "On track": "success", Watch: "warning", "Follow up": "danger" };

export default async function ZonePage({ searchParams }: { searchParams: Promise<{ period?: string; area?: string }> }) {
  const { access } = await requireAppContext();
  if (!canSeeZoneOverview(access)) redirect("/");
  const sp = await searchParams;
  const periodKey: PeriodKey = sp.period === "month" || sp.period === "quarter" ? sp.period : "week";
  const all = await zoneOverview(access.overviewParishIds, periodKey);
  const areas = [...new Set(all.rows.map((r) => r.areaName))];
  const data = sp.area && areas.includes(sp.area) ? await zoneOverview(all.rows.filter((r) => r.areaName === sp.area).map((r) => r.parishId), periodKey) : all;
  const k = data.kpis;
  const q = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { period: periodKey, area: sp.area, ...p };
    Object.entries(merged).forEach(([key, v]) => v && u.set(key, v));
    return `/zone?${u}`;
  };
  const change = k.attendanceChange;
  const monthName = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

  return (
    <>
      <PageHeader title="Zone overview" subtitle={`${data.rows.length} parishes · last Sunday ${formatDay(data.lastSunday)}`} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <nav aria-label="Period" className="flex rounded-xl bg-muted p-1">
          {(["week", "month", "quarter"] as const).map((p) => (
            <Link key={p} href={q({ period: p })} aria-current={p === periodKey ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium", p === periodKey ? "bg-surface text-brand shadow-sm" : "text-subtle")}>
              {p === "week" ? "This week" : p === "month" ? "This month" : "This quarter"}
            </Link>
          ))}
        </nav>
        {areas.length > 1 && (
          <nav aria-label="Area" className="flex flex-wrap gap-1">
            <Link href={q({ area: undefined })} aria-current={!sp.area ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-3 text-sm", !sp.area ? "border-brand bg-brand-tint text-brand" : "border-line bg-surface text-subtle")}>
              All areas
            </Link>
            {areas.map((a) => (
              <Link key={a} href={q({ area: a })} aria-current={sp.area === a ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-3 text-sm", sp.area === a ? "border-brand bg-brand-tint text-brand" : "border-line bg-surface text-subtle")}>
                {a}
              </Link>
            ))}
          </nav>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          testId="kpi-attendance"
          label="Sunday attendance"
          value={k.attendance.toLocaleString("en-NG")}
          hint={change === null ? "No earlier figures to compare" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}% vs same days last ${periodKey}`}
          tone={change === null ? undefined : change >= 0 ? "success" : "danger"}
        />
        <KpiTile
          testId="kpi-retention"
          label="First-timer retention (30 days)"
          value={k.retention.rate === null ? "—" : `${Math.round(k.retention.rate)}%`}
          hint={`${k.retention.retained} of ${k.retention.cohort} came 3+ times · target ${k.retention.target}%`}
          tone={k.retention.rate === null ? undefined : k.retention.rate >= k.retention.target ? "success" : "warning"}
        />
        <KpiTile
          testId="kpi-remittance"
          label="Remittance cleared"
          value={`${k.remittance.cleared} / ${k.remittance.total}`}
          hint={k.remittance.months.length === 1 ? `For ${monthName(k.remittance.months[0])}` : `All of ${monthName(k.remittance.months[0])} – ${monthName(k.remittance.months[2])}`}
          tone={k.remittance.cleared === k.remittance.total ? "success" : "warning"}
        />
        <KpiTile testId="kpi-workers" label="Workers on duty" value={k.workersOnDuty.toLocaleString("en-NG")} hint={`${k.absentUshers} rostered usher${k.absentUshers === 1 ? "" : "s"} absent`} tone={k.absentUshers ? "warning" : undefined} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-[1fr_380px]">
        <TrendChart data={data.trend} />
        <section className="rounded-2xl border border-line bg-surface p-4" aria-labelledby="attention">
          <h2 id="attention" className="mb-3 font-semibold">
            Needs attention
          </h2>
          <ul className="space-y-3 text-sm" data-testid="attention">
            {data.attention.noReport.map((r) => (
              <li key={r.parishId} className="flex gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <span>
                  <span className="font-medium">{r.parishName}</span> has no report for Sunday {formatDay(data.lastSunday)}
                </span>
              </li>
            ))}
            {data.attention.stale.map((r) => (
              <li key={r.reportId} className="flex gap-2">
                <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  <span className="font-medium">{r.parishName}</span>: {r.serviceName} {formatDay(r.date)} waiting for the pastor since {formatDateTime(r.submittedAt)}
                </span>
              </li>
            ))}
            {data.attention.followUps.map((f) => (
              <li key={f.parishId} className="flex gap-2">
                <PhoneCall className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                <span>
                  <span className="font-medium">{f.parishName}</span>: {f.n} first-timer call{f.n === 1 ? "" : "s"} still open
                </span>
              </li>
            ))}
            {data.attention.noReport.length + data.attention.stale.length + data.attention.followUps.length === 0 && <li className="text-subtle">Nothing needs attention right now.</li>}
          </ul>
        </section>
      </div>

      <section aria-labelledby="compliance">
        <h2 id="compliance" className="mb-2 font-semibold">
          Parish compliance · Sunday {formatDay(data.lastSunday)}
        </h2>
        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
          <table className="w-full min-w-[760px] text-sm" data-testid="compliance-table">
            <thead className="border-b border-line text-left text-xs text-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Parish</th>
                <th className="px-4 py-2 font-medium">Area</th>
                <th className="px-4 py-2 text-right font-medium">Attendance</th>
                <th className="px-4 py-2 font-medium">Report</th>
                <th className="px-4 py-2 font-medium">Finances</th>
                <th className="px-4 py-2 font-medium">Remittance</th>
                <th className="px-4 py-2 font-medium">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rows.map((r) => (
                <tr key={r.parishId}>
                  <td className="px-4 py-3 font-medium">{r.parishName}</td>
                  <td className="px-4 py-3 text-subtle">{r.areaName}</td>
                  <td className="px-4 py-3 text-right font-mono">{r.attendance?.toLocaleString("en-NG") ?? "—"}</td>
                  <td className="px-4 py-3">
                    <StatusDot tone={REPORT_TONE[r.report]} label={r.report} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusDot tone={FIN_TONE[r.finances]} label={r.finances} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusDot tone={REMIT_TONE[r.remittance]} label={r.remittance} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={OVERALL_TONE[r.overall]}>{r.overall}</StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Phone cards */}
        <ul className="space-y-2 md:hidden">
          {data.rows.map((r) => (
            <li key={r.parishId} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{r.parishName}</p>
                  <p className="text-xs text-subtle">
                    {r.areaName} · <span className="font-mono">{r.attendance?.toLocaleString("en-NG") ?? "—"}</span>
                  </p>
                </div>
                <StatusPill tone={OVERALL_TONE[r.overall]}>{r.overall}</StatusPill>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2">
                {(
                  [
                    ["Report", r.report, REPORT_TONE[r.report]],
                    ["Finances", r.finances, FIN_TONE[r.finances]],
                    ["Remittance", r.remittance, REMIT_TONE[r.remittance]],
                  ] as const
                ).map(([l, v, tone]) => (
                  <div key={l} className="rounded-lg bg-muted/60 p-2">
                    <dt className="text-[11px] text-subtle">{l}</dt>
                    <dd className="mt-0.5">
                      <StatusDot tone={tone} label={v} />
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
