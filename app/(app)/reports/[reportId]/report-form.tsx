"use client";

import { ChevronDown } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CountInput, MoneyInput } from "@/components/app/money-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDay } from "@/lib/dates";
import type { RecordSource } from "@/lib/db/schema";
import type { ReportPerms } from "@/lib/db/queries/reports";
import type { ActionState } from "@/lib/forms";
import { formatKobo, koboToInput, parseNairaToKobo, sumKobo } from "@/lib/money";
import { saveReport } from "../actions";

type Initial = {
  men: number | null;
  women: number | null;
  children: number | null;
  firstTimers: number | null;
  workersOnDuty: number | null;
  offeringKobo: number | null;
  titheKobo: number | null;
  specialSeedKobo: number | null;
  notes: string | null;
};
type TallyZone = { zoneName: string; men: number; women: number; children: number; firstTimers: number; ushers: { userName: string; men: number; women: number; children: number; firstTimers: number }[] };
type Policy = { parish: number; area: number; zone: number; province: number; national: number };

const str = (n: number | null) => (n === null ? "" : String(n));

export function ReportForm({
  reportId,
  perms,
  isPast,
  source,
  event,
  initial,
  tallyZones,
  tallyCount,
  policy,
  signOff,
}: {
  reportId: string;
  perms: ReportPerms;
  isPast: boolean;
  source: RecordSource;
  event: { date: string; startTime: string; typeName: string; preacher: string | null; theme: string | null };
  initial: Initial;
  tallyZones: TallyZone[];
  tallyCount: number;
  policy: Policy | null;
  signOff: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveReport, {});
  const [typeAttendance, setTypeAttendance] = useState(false);
  const fromTallies = source === "TALLY" && !typeAttendance;
  const readOnly = !perms.canEdit;
  const [v, setV] = useState({
    men: str(initial.men),
    women: str(initial.women),
    children: str(initial.children),
    firstTimers: str(initial.firstTimers),
    workersOnDuty: str(initial.workersOnDuty),
    offering: koboToInput(initial.offeringKobo),
    tithe: koboToInput(initial.titheKobo),
    specialSeed: koboToInput(initial.specialSeedKobo),
  });
  const set = (k: keyof typeof v) => (val: string) => setV((x) => ({ ...x, [k]: val }));

  useEffect(() => {
    if (!state.at) return;
    if (state.ok) toast.success(state.message ?? "Saved");
    else if (state.error) toast.error(state.error);
  }, [state]);

  const totalPeople = v.men === "" || v.women === "" || v.children === "" ? null : Number(v.men) + Number(v.women) + Number(v.children);
  const money = useMemo(() => {
    const parts = [v.offering, v.tithe, v.specialSeed].map((x) => parseNairaToKobo(x));
    const bad = parts.some((p) => p !== null && Number.isNaN(p));
    return { total: bad ? null : sumKobo(...(parts as (number | null)[])), bad };
  }, [v.offering, v.tithe, v.specialSeed]);
  const fe = state.fieldErrors ?? {};

  return (
    <>
      <form action={action} className="space-y-5" noValidate>
        <input type="hidden" name="reportId" value={reportId} />
        <input type="hidden" name="typeAttendance" value={typeAttendance ? "true" : "false"} />

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Service</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-subtle">Date</dt>
              <dd className="font-medium">{formatDay(event.date)}</dd>
            </div>
            <div>
              <dt className="text-subtle">Service</dt>
              <dd className="font-medium">
                {event.typeName} · <span className="font-mono">{event.startTime}</span>
              </dd>
            </div>
          </dl>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="preacher">Preacher</Label>
              <Input id="preacher" name="preacher" defaultValue={event.preacher ?? ""} readOnly={readOnly} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="theme">Theme</Label>
              <Input id="theme" name="theme" defaultValue={event.theme ?? ""} readOnly={readOnly} className="h-11" />
            </div>
          </div>
          {isPast && <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-xs text-ink">Past records don&apos;t need usher tallies. The pastor still signs off before they count in zone totals.</p>}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Attendance</h2>
            {source === "TALLY" && perms.canEdit && (
              <button type="button" className="text-sm font-medium text-brand underline" onClick={() => setTypeAttendance((t) => !t)}>
                {typeAttendance ? "Use usher tallies" : "Type the numbers instead"}
              </button>
            )}
          </div>
          <p className="mb-3 text-xs text-subtle">
            {fromTallies ? `Prefilled from ${tallyCount} usher tall${tallyCount === 1 ? "y" : "ies"}` : "Type the numbers from your records. Leave a box blank if it wasn't counted."}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CountInput id="men" name="men" label="Men" value={v.men} onChange={set("men")} disabled={readOnly || fromTallies} error={fe.men} />
            <CountInput id="women" name="women" label="Women" value={v.women} onChange={set("women")} disabled={readOnly || fromTallies} error={fe.women} />
            <CountInput id="children" name="children" label="Children" value={v.children} onChange={set("children")} disabled={readOnly || fromTallies} error={fe.children} />
            <CountInput id="firstTimers" name="firstTimers" label="First-timers" value={v.firstTimers} onChange={set("firstTimers")} disabled={readOnly || fromTallies} error={fe.firstTimers} />
            <CountInput id="workersOnDuty" name="workersOnDuty" label="Workers on duty" value={v.workersOnDuty} onChange={set("workersOnDuty")} disabled={readOnly} error={fe.workersOnDuty} />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-soft px-4 py-3">
            <span className="font-semibold">Total attendance</span>
            <span data-testid="attendance-total" className="font-mono text-xl font-semibold">
              {totalPeople === null ? "—" : totalPeople.toLocaleString("en-NG")}
            </span>
          </div>
          {totalPeople === null && <p className="mt-1 text-xs text-subtle">Total is unknown until men, women and children are all filled in.</p>}
          {tallyZones.length > 0 && (
            <details className="group mt-3">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-brand">
                <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden /> See tallies by zone
              </summary>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead className="text-left text-xs text-subtle">
                    <tr>
                      <th className="py-2 font-medium">Zone · usher</th>
                      <th className="py-2 text-right font-medium">Men</th>
                      <th className="py-2 text-right font-medium">Women</th>
                      <th className="py-2 text-right font-medium">Children</th>
                      <th className="py-2 text-right font-medium">First-timers</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {tallyZones.map((z) => (
                      <ZoneRows key={z.zoneName} z={z} />
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">Collections</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <MoneyInput id="offering" name="offering" label="Offering" value={v.offering} onChange={set("offering")} disabled={readOnly} error={fe.offering} />
            <MoneyInput id="tithe" name="tithe" label="Tithe" value={v.tithe} onChange={set("tithe")} disabled={readOnly} error={fe.tithe} />
            <MoneyInput id="specialSeed" name="specialSeed" label="Special seed / thanksgiving" value={v.specialSeed} onChange={set("specialSeed")} disabled={readOnly} error={fe.specialSeed} />
          </div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-brand-soft px-4 py-3">
            <span className="font-semibold">Total collections</span>
            <span data-testid="collections-total" className="font-mono text-xl font-semibold">
              {money.bad ? "Check amounts" : formatKobo(money.total)}
            </span>
          </div>
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={initial.notes ?? ""} readOnly={readOnly} rows={3} />
          </div>
        </section>

        {perms.canEdit && (
          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 grid gap-2 rounded-2xl border border-line bg-surface/95 p-3 backdrop-blur sm:grid-cols-2 md:bottom-4">
            <Button type="submit" name="intent" value="save" variant="outline" className="h-12" disabled={pending}>
              Save draft
            </Button>
            <Button type="submit" name="intent" value="submit" className="h-12" disabled={pending}>
              Submit for verification
            </Button>
          </div>
        )}
        {readOnly && (
          <p className="text-sm text-subtle">
            {perms.canReopen || perms.canVerify ? "This report is read-only." : "This report is read-only for you."}
          </p>
        )}
      </form>

      <aside className="space-y-5">
        {signOff}
        <RemittancePreview totalKobo={money.total} policy={policy} />
      </aside>
    </>
  );
}

function ZoneRows({ z }: { z: TallyZone }) {
  return (
    <>
      <tr className="border-t border-line bg-muted/50 font-semibold">
        <td className="py-2 font-sans">{z.zoneName}</td>
        <td className="py-2 text-right">{z.men}</td>
        <td className="py-2 text-right">{z.women}</td>
        <td className="py-2 text-right">{z.children}</td>
        <td className="py-2 text-right">{z.firstTimers}</td>
      </tr>
      {z.ushers.map((u) => (
        <tr key={u.userName} className="text-subtle">
          <td className="py-1.5 pl-3 font-sans">{u.userName}</td>
          <td className="py-1.5 text-right">{u.men}</td>
          <td className="py-1.5 text-right">{u.women}</td>
          <td className="py-1.5 text-right">{u.children}</td>
          <td className="py-1.5 text-right">{u.firstTimers}</td>
        </tr>
      ))}
    </>
  );
}

function RemittancePreview({ totalKobo, policy }: { totalKobo: number | null; policy: Policy | null }) {
  if (!policy) return null;
  const rows: [string, number][] = [
    ["Parish", policy.parish],
    ["Area", policy.area],
    ["Zone", policy.zone],
    ["Province", policy.province],
    ["National", policy.national],
  ];
  return (
    <section aria-label="Remittance preview" className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Remittance preview</h2>
      <p className="mb-3 text-xs text-subtle">How this service&apos;s collections split by level. For information only.</p>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, pct]) => (
            <tr key={label} className="border-t border-line first:border-0">
              <td className="py-1.5">{label}</td>
              <td className="py-1.5 text-right font-mono text-subtle">{pct}%</td>
              <td className="py-1.5 text-right font-mono">{totalKobo === null ? "—" : formatKobo(Math.round((totalKobo * pct) / 100))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
