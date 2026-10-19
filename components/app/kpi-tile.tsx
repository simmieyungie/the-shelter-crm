import { cn } from "@/lib/utils";

export function KpiTile({
  label,
  value,
  hint,
  tone,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "success" | "danger" | "warning";
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-medium text-subtle">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-ink md:text-3xl">{value}</p>
      {hint && (
        <p
          className={cn(
            "mt-1 text-xs",
            tone === "success" && "text-success-text",
            tone === "danger" && "text-danger-text",
            tone === "warning" && "text-warning-text",
            !tone && "text-subtle",
          )}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
