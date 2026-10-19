"use client";

import { cn } from "@/lib/utils";

/** One row of the usher tally: label, live value and −/+1/+5 buttons (48px tall). */
export function TallyCounter({
  label,
  value,
  onChange,
  steps = [1, 5],
  hint,
  testId,
}: {
  label: string;
  value: number;
  onChange: (delta: number) => void;
  steps?: number[];
  hint?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{label}</p>
        {hint && <p className="text-xs text-subtle">{hint}</p>}
      </div>
      <output aria-live="polite" aria-label={`${label} count`} className="w-14 text-right font-mono text-2xl font-semibold tabular-nums text-ink">
        {value}
      </output>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange(-1)}
          disabled={value <= 0}
          aria-label={`Remove one from ${label}`}
          className="h-12 w-11 rounded-xl border border-line bg-surface font-mono text-lg font-semibold text-ink active:scale-95 disabled:opacity-40"
        >
          −
        </button>
        {steps.map((step) => (
          <button
            key={step}
            type="button"
            onClick={() => onChange(step)}
            aria-label={`Add ${step} to ${label}`}
            className={cn(
              "h-12 rounded-xl font-mono text-base font-semibold active:scale-95",
              step === 1 ? "w-14 bg-brand text-white" : "w-12 border border-brand/30 bg-brand-soft text-brand",
            )}
          >
            +{step}
          </button>
        ))}
      </div>
    </div>
  );
}
