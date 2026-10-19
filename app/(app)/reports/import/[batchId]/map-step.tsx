"use client";

import { useActionState, useState } from "react";
import { StatusPill } from "@/components/app/status-pill";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/forms";
import { IMPORT_FIELDS, SKIP } from "@/lib/import/fields";
import { DATE_FORMATS } from "@/lib/import/validate";
import { saveMappingAction } from "../actions";

type Cell = string | number | boolean | null;

function show(v: Cell | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  return String(v).slice(0, 24);
}

export function MapStep({
  batchId,
  headers,
  columnMap,
  confidence,
  dateFormat,
  defaultServiceTypeId,
  samples,
  types,
}: {
  batchId: string;
  headers: string[];
  columnMap: Record<string, string>;
  confidence: Record<string, "high" | "low" | "none">;
  dateFormat: string;
  defaultServiceTypeId: string | null;
  samples: Record<string, Cell>[];
  types: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveMappingAction, {});
  const [map, setMap] = useState<Record<string, string>>(() => Object.fromEntries(headers.map((_, i) => [String(i), columnMap[String(i)] ?? SKIP])));
  const used = Object.values(map).filter((f) => f !== SKIP);
  const dupes = new Set(used.filter((f, i) => used.indexOf(f) !== i));
  const hasService = used.includes("service_type");
  const hasDate = used.includes("event_date");
  const onlyTotal = used.includes("total") && !used.some((f) => f === "men" || f === "women" || f === "children");
  const dateCol = Object.entries(map).find(([, f]) => f === "event_date")?.[0];
  const dateSamples = dateCol ? samples.map((s) => show(s[dateCol])).filter((v) => v !== "—") : [];

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="batchId" value={batchId} />
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line p-4">
          <h2 className="font-semibold">Match your columns</h2>
          <p className="text-sm text-subtle">We guessed from the headings. Check anything marked &quot;Check this&quot;. Columns you don&apos;t need can be left as &quot;Don&apos;t import&quot;.</p>
        </div>
        <ul className="divide-y divide-line">
          {headers.map((h, i) => {
            const key = String(i);
            const low = confidence[key] === "low" && map[key] === columnMap[key];
            const dupe = map[key] !== SKIP && dupes.has(map[key]);
            return (
              <li key={key} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_1fr_220px] sm:items-center">
                <div className="min-w-0">
                  <p className="font-medium">
                    {h} {low && <StatusPill tone="warning">Check this</StatusPill>}
                  </p>
                </div>
                <p className="truncate font-mono text-xs text-subtle">{samples.map((s) => show(s[key])).join(" · ")}</p>
                <div>
                  <label htmlFor={`col_${i}`} className="sr-only">
                    Field for {h}
                  </label>
                  <select
                    id={`col_${i}`}
                    name={`col_${i}`}
                    value={map[key]}
                    onChange={(e) => setMap((m) => ({ ...m, [key]: e.target.value }))}
                    aria-invalid={dupe}
                    className={`h-11 w-full rounded-lg border bg-surface px-3 text-sm ${dupe ? "border-danger" : "border-line"}`}
                  >
                    <option value={SKIP}>Don&apos;t import</option>
                    {IMPORT_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  {dupe && <p className="mt-1 text-xs text-danger-text">Another column already uses this.</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-4 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="dateFormat" className="text-sm font-medium">
            How are dates written?
          </label>
          <select id="dateFormat" name="dateFormat" defaultValue={dateFormat} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
            {DATE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f === "DD/MM/YYYY" ? "DD/MM/YYYY (18/10/2026)" : f === "MM/DD/YYYY" ? "MM/DD/YYYY (10/18/2026)" : "YYYY-MM-DD (2026-10-18)"}
              </option>
            ))}
          </select>
          <p className="text-xs text-subtle">
            Excel dates are read automatically.{dateSamples.length ? ` Your first dates: ${dateSamples.join(", ")}.` : ""}
          </p>
        </div>
        {!hasService && (
          <div className="space-y-1.5">
            <label htmlFor="defaultServiceTypeId" className="text-sm font-medium">
              No service column. Which service are these rows for?
            </label>
            <select id="defaultServiceTypeId" name="defaultServiceTypeId" defaultValue={defaultServiceTypeId ?? ""} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
              <option value="">Choose a service</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {onlyTotal && (
        <p className="rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning-text">
          Your sheet has a Total column but no Men, Women or Children. Reports store attendance as men, women and children, so these services will import with attendance unknown. The total is only used to check the other columns.
        </p>
      )}
      {!hasDate && <p className="text-sm text-danger-text">Match one column to Date to continue.</p>}
      {state.error && (
        <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger-text">
          {state.error}
        </p>
      )}
      <Button type="submit" className="h-12 w-full sm:w-auto" disabled={pending || !hasDate || dupes.size > 0}>
        {pending ? "Checking every row…" : "Continue to review"}
      </Button>
    </form>
  );
}
