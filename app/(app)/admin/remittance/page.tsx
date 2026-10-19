import { Pencil, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/app/form-dialog";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill, type Tone } from "@/components/app/status-pill";
import { requireAppContext } from "@/lib/auth/context";
import { addMonths, formatDay, startOfMonth, todayIso } from "@/lib/dates";
import { getHierarchy, getRemittanceAdmin } from "@/lib/db/queries/admin";
import type { RemittanceStatus } from "@/lib/db/schema";
import { formatKobo, koboToInput } from "@/lib/money";
import { SCOPE_LABELS } from "@/lib/labels";
import { saveRemittance, saveRemittancePolicy } from "../actions";

export const metadata = { title: "Remittance" };

const STATUS: Record<RemittanceStatus, [Tone, string]> = {
  CLEARED: ["success", "Cleared"],
  PARTIAL: ["warning", "Part-paid"],
  OUTSTANDING: ["danger", "Outstanding"],
};

function monthLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
}

export default async function RemittancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { access } = await requireAppContext();
  if (!access.isSystemAdmin && access.overviewParishIds.length === 0) redirect("/admin");
  const { month } = await searchParams;
  const periodMonth = month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : addMonths(startOfMonth(todayIso()), -1);
  const { rows, policies } = await getRemittanceAdmin(access, periodMonth);
  const h = access.isSystemAdmin ? await getHierarchy(access) : null;

  return (
    <>
      <PageHeader title="Remittance" subtitle="Status only. Payments are made outside the app." back="/admin" />
      <form className="mb-4 flex items-center gap-2" action="/admin/remittance">
        <label htmlFor="month" className="text-sm text-subtle">
          Month
        </label>
        <input id="month" name="month" type="month" defaultValue={periodMonth.slice(0, 7)} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm" />
        <button className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-medium">Show</button>
      </form>

      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-surface">
        <h2 className="border-b border-line p-4 font-semibold">{monthLabel(periodMonth)}</h2>
        <ul className="divide-y divide-line">
          {rows.map(({ parishId, parishName, areaName, remittance: r }) => {
            const [tone, label] = r ? STATUS[r.status] : (["neutral", "Not recorded"] as [Tone, string]);
            return (
              <li key={parishId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{parishName}</p>
                  <p className="text-sm text-subtle">{areaName}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-right font-mono text-sm">
                    {r ? `${formatKobo(r.amountPaidKobo)} of ${formatKobo(r.amountDueKobo)}` : "—"}
                  </span>
                  <StatusPill tone={tone}>{label}</StatusPill>
                  <FormDialog
                    title={`${parishName} · ${monthLabel(periodMonth)}`}
                    trigger={<Pencil className="size-4" aria-label={`Update ${parishName}`} />}
                    triggerVariant="ghost"
                    triggerSize="icon"
                    action={saveRemittance}
                    hidden={{ parishId, periodMonth: periodMonth.slice(0, 7) }}
                    fields={[
                      { name: "amountDue", label: "Amount due (₦)", type: "text", required: true, inputMode: "decimal", defaultValue: koboToInput(r?.amountDueKobo ?? null) },
                      { name: "amountPaid", label: "Amount paid (₦)", type: "text", required: true, inputMode: "decimal", defaultValue: koboToInput(r?.amountPaidKobo ?? 0) },
                    ]}
                  />
                </div>
              </li>
            );
          })}
          {rows.length === 0 && <li className="p-4 text-sm text-subtle">No parishes in your scope.</li>}
        </ul>
      </section>

      <section className="rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
          <div>
            <h2 className="font-semibold">Remittance split</h2>
            <p className="text-sm text-subtle">The newest split that covers a parish applies.</p>
          </div>
          {h && (
            <FormDialog
              title="New remittance split"
              description="The five shares must add up to 100%."
              trigger={<><Plus className="size-4" aria-hidden /> New split</>}
              action={saveRemittancePolicy}
              columns={2}
              fields={[
                { name: "scopeLevel", label: "Applies to", type: "select", required: true, defaultValue: "GLOBAL", options: [{ value: "GLOBAL", label: "Everywhere" }, { value: "REGION", label: "A region" }, { value: "PROVINCE", label: "A province" }, { value: "ZONE", label: "A zone" }] },
                { name: "scopeId", label: "Which one", type: "select", options: [...h.regions.map((r) => ({ value: r.id, label: `Region: ${r.name}` })), ...h.provinces.map((p) => ({ value: p.id, label: `Province: ${p.name}` })), ...h.zones.map((z) => ({ value: z.id, label: `Zone: ${z.name}` }))], hint: "Leave blank for everywhere." },
                { name: "effectiveFrom", label: "From", type: "date", required: true, defaultValue: startOfMonth(todayIso()) },
                { name: "parishPct", label: "Parish %", type: "number", required: true, min: 0 },
                { name: "areaPct", label: "Area %", type: "number", required: true, min: 0 },
                { name: "zonePct", label: "Zone %", type: "number", required: true, min: 0 },
                { name: "provincePct", label: "Province %", type: "number", required: true, min: 0 },
                { name: "nationalPct", label: "National %", type: "number", required: true, min: 0 },
              ]}
            />
          )}
        </div>
        <ul className="divide-y divide-line">
          {policies.map((p) => (
            <li key={p.id} className="px-4 py-3 text-sm">
              <p className="font-medium">
                {SCOPE_LABELS[p.scopeLevel]} · from {formatDay(p.effectiveFrom)}
              </p>
              <p className="font-mono text-subtle">
                Parish {Number(p.parishPct)}% · Area {Number(p.areaPct)}% · Zone {Number(p.zonePct)}% · Province {Number(p.provincePct)}% · National {Number(p.nationalPct)}%
              </p>
            </li>
          ))}
          {policies.length === 0 && <li className="p-4 text-sm text-subtle">No split set yet.</li>}
        </ul>
      </section>
    </>
  );
}
