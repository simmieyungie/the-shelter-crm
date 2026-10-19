import { cn } from "@/lib/utils";

const STEPS = ["Upload", "Match columns", "Review", "Done"] as const;

export function ImportStepper({ step }: { step: 0 | 1 | 2 | 3 }) {
  return (
    <ol aria-label="Import progress" className="mb-6 grid grid-cols-4 gap-1.5">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === step ? "step" : undefined}>
          <span className={cn("block h-1.5 rounded-full", i <= step ? "bg-brand" : "bg-line")} />
          <span className={cn("mt-1.5 block text-xs", i === step ? "font-semibold text-brand" : i < step ? "text-ink" : "text-subtle")}>
            <span className="sr-only">Step {i + 1}: </span>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}
