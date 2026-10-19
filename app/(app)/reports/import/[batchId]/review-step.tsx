"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { KpiTile } from "@/components/app/kpi-tile";
import { StatusPill, type Tone } from "@/components/app/status-pill";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import type { ImportIssue, ImportParsedRow } from "@/lib/db/schema";
import type { ActionState } from "@/lib/forms";
import { normaliseHeader } from "@/lib/import/fields";
import { issueKey } from "@/lib/import/validate";
import { formatKobo, sumKobo } from "@/lib/money";
import { cn } from "@/lib/utils";
import { commitAction, setResolutionAction, setServiceNameAction } from "../actions";

type Row = {
  id: string;
  rowNumber: number;
  parsed: ImportParsedRow | null;
  issues: ImportIssue[];
  resolution: Record<string, string>;
  outcome: "READY" | "NEEDS_FIX" | "DUPLICATE" | "SKIPPED" | "IMPORTED";
};
type TypeOpt = { id: string; name: string };

const OUTCOME: Record<Row["outcome"], [Tone, string]> = {
  READY: ["success", "Ready"],
  NEEDS_FIX: ["danger", "Needs a fix"],
  DUPLICATE: ["neutral", "Already in app"],
  SKIPPED: ["neutral", "Skipped"],
  IMPORTED: ["success", "Imported"],
};

function optionLabel(opt: string, issue: ImportIssue, types: TypeOpt[]) {
  if (opt === "skip") return "Skip this row";
  if (opt === "zero") return "Import as 0";
  if (opt === "blank") return "Leave blank (unknown)";
  if (opt === "keep") return "Keep men, women and children";
  if (opt === "nearest") return issue.suggestedDate ? `Use nearest service: ${formatDay(issue.suggestedDate)}` : "Use nearest service date";
  if (opt.startsWith("map:")) return `Treat as ${types.find((t) => t.id === opt.slice(4))?.name ?? "service"}`;
  return opt;
}

function useToast(state: ActionState) {
  useEffect(() => {
    if (!state.at) return;
    if (!state.ok && state.error) toast.error(state.error);
  }, [state]);
}

function ResolutionSelect({ batchId, rowIds, issue, value, types, label }: { batchId: string; rowIds: string[]; issue: ImportIssue; value: string; types: TypeOpt[]; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setResolutionAction, {});
  useToast(state);
  const ref = useRef<HTMLFormElement>(null);
  const opts = issue.options;
  return (
    <form ref={ref} action={action}>
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="rowIds" value={rowIds.join(",")} />
      <input type="hidden" name="key" value={issueKey(issue)} />
      <label className="sr-only" htmlFor={`r-${rowIds[0]}-${issueKey(issue)}-${rowIds.length}`}>
        {label}
      </label>
      <select
        id={`r-${rowIds[0]}-${issueKey(issue)}-${rowIds.length}`}
        key={value}
        name="value"
        defaultValue={value}
        aria-busy={pending}
        onChange={() => ref.current?.requestSubmit()}
        className={cn("h-10 w-full min-w-48 rounded-lg border bg-surface px-2 text-sm", value ? "border-line" : "border-danger")}
      >
        {!value && <option value="">Choose what to do</option>}
        {opts.map((o) => (
          <option key={o} value={o}>
            {optionLabel(o, issue, types)}
          </option>
        ))}
      </select>
    </form>
  );
}

function ServiceNameRow({ batchId, name, count, types }: { batchId: string; name: string; count: number; types: TypeOpt[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setServiceNameAction, {});
  useToast(state);
  const ref = useRef<HTMLFormElement>(null);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <span>
        &quot;{name}&quot; <span className="text-sm text-subtle">· {count} row{count === 1 ? "" : "s"}</span>
      </span>
      <form ref={ref} action={action} className="w-full sm:w-64">
        <input type="hidden" name="batchId" value={batchId} />
        <input type="hidden" name="name" value={normaliseHeader(name)} />
        <label className="sr-only" htmlFor={`svc-${name}`}>
          Service for {name}
        </label>
        <select id={`svc-${name}`} name="target" defaultValue="" aria-busy={pending} onChange={() => ref.current?.requestSubmit()} className="h-10 w-full rounded-lg border border-danger bg-surface px-2 text-sm">
          <option value="" disabled>
            Match to a service…
          </option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
          <option value="skip">Skip these rows</option>
        </select>
      </form>
    </li>
  );
}

export function ReviewStep({ batchId, rows, types, show, canVerify }: { batchId: string; rows: Row[]; types: TypeOpt[]; show?: string; canVerify: boolean }) {
  const counts = useMemo(() => {
    const c = { READY: 0, NEEDS_FIX: 0, DUPLICATE: 0, SKIPPED: 0 };
    rows.forEach((r) => r.outcome in c && (c[r.outcome as keyof typeof c] += 1));
    return c;
  }, [rows]);
  const [filter, setFilter] = useState<string>(show ?? (counts.NEEDS_FIX ? "NEEDS_FIX" : "READY"));
  const [commitState, commit, committing] = useActionState<ActionState, FormData>(commitAction, {});
  useToast(commitState);

  // Unknown service names waiting for a batch-wide match.
  const unknownNames = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) for (const i of r.issues) if (i.type === "UNKNOWN_SERVICE" && !r.resolution[issueKey(i)] && i.value && !i.defaultResolution) m.set(i.value, (m.get(i.value) ?? 0) + 1);
    return [...m.entries()];
  }, [rows]);

  // Bulk fixes: unresolved issues grouped by kind.
  const bulk = useMemo(() => {
    const groups = new Map<string, { issue: ImportIssue; rowIds: string[] }>();
    for (const r of rows) {
      if (r.outcome !== "NEEDS_FIX") continue;
      for (const i of r.issues) {
        if (r.resolution[issueKey(i)] || i.defaultResolution || i.type === "UNKNOWN_SERVICE") continue;
        const g = groups.get(issueKey(i)) ?? { issue: i, rowIds: [] };
        g.rowIds.push(r.id);
        groups.set(issueKey(i), g);
      }
    }
    return [...groups.values()].filter((g) => g.rowIds.length > 1);
  }, [rows]);

  const visible = rows.filter((r) => filter === "ALL" || r.outcome === filter).slice(0, 300);
  const tabs: [string, string, number][] = [
    ["NEEDS_FIX", "Need a fix", counts.NEEDS_FIX],
    ["READY", "Ready", counts.READY],
    ["DUPLICATE", "Already in app", counts.DUPLICATE],
    ["SKIPPED", "Skipped", counts.SKIPPED],
    ["ALL", "All", rows.length],
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Ready" value={counts.READY} testId="count-ready" />
        <KpiTile label="Need a fix" value={counts.NEEDS_FIX} tone={counts.NEEDS_FIX ? "danger" : undefined} hint={counts.NEEDS_FIX ? "Choose what to do below" : "All sorted"} testId="count-fix" />
        <KpiTile label="Already in app · skipped" value={counts.DUPLICATE} hint="Never overwritten" testId="count-dup" />
        <KpiTile label="Skipped" value={counts.SKIPPED} testId="count-skipped" />
      </div>
      <p className="text-sm text-subtle">This is a dry run. Nothing is saved to reports until you press Import.</p>

      {unknownNames.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line p-4 font-semibold">Services we don&apos;t recognise</h2>
          <ul className="divide-y divide-line">
            {unknownNames.map(([name, n]) => (
              <ServiceNameRow key={name} batchId={batchId} name={name} count={n} types={types} />
            ))}
          </ul>
        </section>
      )}

      {bulk.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface">
          <h2 className="border-b border-line p-4 font-semibold">Fix several rows at once</h2>
          <ul className="divide-y divide-line">
            {bulk.map((g) => (
              <li key={issueKey(g.issue)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm">
                  {g.rowIds.length} rows: {g.issue.type === "NON_NUMERIC" ? `${g.issue.message.split(" is ")[0]} isn't a number` : g.issue.message}
                </span>
                <div className="w-full sm:w-72">
                  <ResolutionSelect batchId={batchId} rowIds={g.rowIds} issue={g.issue} value="" types={types} label={`Apply to all ${g.rowIds.length} rows`} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-line bg-surface">
        <div role="tablist" aria-label="Rows to show" className="flex gap-2 overflow-x-auto border-b border-line p-3">
          {tabs.map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              onClick={() => setFilter(key)}
              className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm", filter === key ? "border-brand bg-brand-tint text-brand" : "border-line text-subtle")}
            >
              {label} · {n}
            </button>
          ))}
        </div>
        <ul className="divide-y divide-line">
          {visible.map((r) => {
            const p = r.parsed;
            const total = p && p.men !== null && p.women !== null && p.children !== null ? p.men + p.women + p.children : null;
            const money = p ? sumKobo(p.offeringKobo, p.titheKobo, p.specialSeedKobo) : null;
            const [tone, label] = OUTCOME[r.outcome];
            const shownIssues = r.issues.filter((i) => i.type !== "DUPLICATE_EXISTING" || r.outcome === "DUPLICATE");
            return (
              <li key={r.id} data-testid={`row-${r.rowNumber}`} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-mono text-xs text-subtle">Row {r.rowNumber}</span>
                  <span className="font-medium">{p?.eventDate ? formatDay(p.eventDate) : "No date"}</span>
                  <span>
                    {p?.serviceName ?? "No service"}
                    {p && p.occurrence > 1 ? ` (${p.occurrence === 2 ? "2nd" : p.occurrence === 3 ? "3rd" : `${p.occurrence}th`})` : ""}
                  </span>
                  <span className="font-mono">
                    {p ? `${p.men ?? "—"} / ${p.women ?? "—"} / ${p.children ?? "—"} = ${total ?? "—"}` : ""}
                  </span>
                  <span className="font-mono">{formatKobo(money)}</span>
                  <StatusPill tone={tone}>{label}</StatusPill>
                </div>
                {shownIssues.length > 0 && (
                  <ul className="space-y-2">
                    {shownIssues.map((i) => (
                      <li key={issueKey(i)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
                        <span className="text-sm text-ink">{i.message}</span>
                        {i.options.length > 0 && i.type !== "DUPLICATE_EXISTING" && (
                          <div className="w-full sm:w-72">
                            <ResolutionSelect batchId={batchId} rowIds={[r.id]} issue={i} value={r.resolution[issueKey(i)] ?? i.defaultResolution ?? ""} types={types} label={`Row ${r.rowNumber}: ${i.message}`} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
          {visible.length === 0 && <li className="p-6 text-center text-sm text-subtle">Nothing here.</li>}
        </ul>
      </section>

      <form action={commit} className="space-y-4 rounded-2xl border border-line bg-surface p-4">
        <input type="hidden" name="batchId" value={batchId} />
        <fieldset>
          <legend className="mb-2 font-semibold">After import</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input type="radio" name="afterStatus" value="SUBMITTED" defaultChecked className="mt-1 size-4 accent-[var(--brand)]" />
              <span>
                <span className="block text-sm font-medium">Imported · needs pastor check</span>
                <span className="block text-xs text-subtle">They count in zone totals once the pastor verifies them.</span>
              </span>
            </label>
            <label className={cn("flex items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft", canVerify ? "cursor-pointer" : "opacity-50")}>
              <input type="radio" name="afterStatus" value="VERIFIED" disabled={!canVerify} className="mt-1 size-4 accent-[var(--brand)]" />
              <span>
                <span className="block text-sm font-medium">Verified now</span>
                <span className="block text-xs text-subtle">{canVerify ? "You're the pastor: they count straight away." : "Only the parish pastor can choose this."}</span>
              </span>
            </label>
          </div>
        </fieldset>
        {commitState.error && (
          <p role="alert" className="text-sm text-danger-text">
            {commitState.error}
          </p>
        )}
        <Button type="submit" className="h-12 w-full sm:w-auto" disabled={committing || counts.NEEDS_FIX > 0 || counts.READY === 0}>
          {committing ? "Importing…" : counts.NEEDS_FIX > 0 ? `Fix ${counts.NEEDS_FIX} row${counts.NEEDS_FIX === 1 ? "" : "s"} first` : `Import ${counts.READY} service${counts.READY === 1 ? "" : "s"}`}
        </Button>
      </form>
    </div>
  );
}
