import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/status-pill";
import { requireAppContext } from "@/lib/auth/context";
import { formatDateTime, formatDay, formatTime, ordinal } from "@/lib/dates";
import { getReport } from "@/lib/db/queries/reports";
import { reportPill } from "@/lib/reports/status";
import { ReportForm } from "./report-form";
import { TransitionButton } from "./transition-button";

export const metadata = { title: "Service report" };

export default async function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  const { access } = await requireAppContext();
  const data = await getReport(access, reportId).catch(() => null);
  if (!data) notFound();
  const { report, event, type, perms } = data;
  const [tone, label] = reportPill(report.status, report.source);
  const name = event.occurrence > 1 ? `${type.name} (${ordinal(event.occurrence)})` : type.name;
  const isPast = report.source !== "TALLY";

  const steps: { label: string; done: boolean; detail: string }[] = [
    isPast
      ? { label: "Past record", done: true, detail: report.source === "IMPORT" ? "Imported from a spreadsheet" : "Typed from parish records" }
      : { label: "Tallies received", done: data.ushersSynced > 0, detail: `${data.ushersSynced} of ${data.ushersExpected || data.ushersSynced} ushers synced` },
    { label: "Draft by Head Usher", done: !!report.submittedAt || report.status === "VERIFIED", detail: report.submittedAt ? `${data.submitterName ?? "Submitted"} · ${formatDateTime(report.submittedAt)}` : data.drafterName ? `Started by ${data.drafterName}` : "Not submitted yet" },
    { label: "Verified by pastor", done: report.status === "VERIFIED", detail: report.verifiedAt ? `${data.verifierName} · ${formatDateTime(report.verifiedAt)}` : "Waiting" },
    { label: "Sent to Area office", done: report.status === "VERIFIED", detail: report.status === "VERIFIED" ? "Counts in Area and Zone totals" : "After the pastor verifies" },
  ];

  return (
    <>
      <PageHeader
        back="/reports"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {name} · {formatDay(event.eventDate)} <StatusPill tone={tone}>{label}</StatusPill>
          </span>
        }
        subtitle={data.parishName}
      />
      {data.lateTallies > 0 && (
        <p role="status" className="mb-4 rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning-text">
          {data.lateTallies} usher tall{data.lateTallies === 1 ? "y" : "ies"} arrived or changed after this report was submitted. They are not in the numbers below.
          {perms.canReopen || perms.canSendBack ? " Reopen or send the report back to include them." : ""}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <ReportForm
          reportId={report.id}
          perms={perms}
          isPast={isPast}
          source={report.source}
          event={{ date: event.eventDate, startTime: formatTime(event.startTime), typeName: name, preacher: event.preacher, theme: event.theme }}
          initial={{
            men: report.men,
            women: report.women,
            children: report.children,
            firstTimers: report.firstTimers,
            workersOnDuty: report.workersOnDuty,
            offeringKobo: report.offeringKobo,
            titheKobo: report.titheKobo,
            specialSeedKobo: report.specialSeedKobo,
            notes: report.notes,
          }}
          tallyZones={data.tallyZones.map((z) => ({ ...z, ushers: z.ushers.map((u) => ({ userName: u.userName, men: u.men, women: u.women, children: u.children, firstTimers: u.firstTimers })) }))}
          tallyCount={data.ushersSynced}
          policy={
            data.policy
              ? {
                  parish: Number(data.policy.parishPct),
                  area: Number(data.policy.areaPct),
                  zone: Number(data.policy.zonePct),
                  province: Number(data.policy.provincePct),
                  national: Number(data.policy.nationalPct),
                }
              : null
          }
          signOff={
            <section aria-label="Sign-off" className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="mb-3 font-semibold">Sign-off</h2>
              <ol className="space-y-3">
                {steps.map((st, i) => (
                  <li key={st.label} className="flex gap-3">
                    <span
                      aria-hidden
                      className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${st.done ? "bg-success text-white" : "border border-line text-subtle"}`}
                    >
                      {st.done ? "✓" : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {st.label}
                        <span className="sr-only">{st.done ? " (done)" : " (not yet)"}</span>
                      </span>
                      <span className="block text-xs text-subtle">{st.detail}</span>
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-xs text-subtle">
                Verifying pastor: <span className="font-medium text-ink">{data.pastors.map((p) => p.name).join(", ") || "None assigned"}</span>
              </p>
              <div className="mt-4 grid gap-2">
                {perms.canVerify && <TransitionButton reportId={report.id} to="verify" label="Verify report" confirm="Verify this report? It will be locked and count in Area and Zone totals." />}
                {perms.canSendBack && <TransitionButton reportId={report.id} to="send_back" label="Send back for changes" variant="outline" />}
                {perms.canReopen && <TransitionButton reportId={report.id} to="reopen" label="Reopen report" variant="outline" confirm="Reopen this verified report? It stops counting in zone totals until verified again, and every change is recorded." />}
              </div>
              {data.history.length > 0 && (
                <details className="mt-4 text-xs text-subtle">
                  <summary className="cursor-pointer">History</summary>
                  <ul className="mt-2 space-y-1">
                    {data.history.map((h, i) => (
                      <li key={i}>
                        {formatDateTime(h.at)} · {h.actor ?? "System"} · {h.action.replace(/_/g, " ")}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          }
        />
      </div>
    </>
  );
}
