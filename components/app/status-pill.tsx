import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "brand" | "neutral";

const TONES: Record<Tone, { pill: string; dot: string }> = {
  success: { pill: "bg-success-bg text-success-text", dot: "bg-success" },
  warning: { pill: "bg-warning-bg text-warning-text", dot: "bg-warning" },
  danger: { pill: "bg-danger-bg text-danger-text", dot: "bg-danger" },
  brand: { pill: "bg-brand-tint text-brand", dot: "bg-brand" },
  neutral: { pill: "bg-muted text-subtle", dot: "bg-subtle" },
};

/** Status is never colour alone: always a dot plus a word. */
export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        TONES[tone].pill,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", TONES[tone].dot)} />
      {children}
    </span>
  );
}

export function StatusDot({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink">
      <span aria-hidden className={cn("size-2 rounded-full", TONES[tone].dot)} />
      {label}
    </span>
  );
}
