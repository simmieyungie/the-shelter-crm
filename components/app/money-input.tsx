"use client";

import { cn } from "@/lib/utils";

/** ₦-prefixed amount field. Accepts "145,000" or "145000.50"; the server parses to kobo. */
export function MoneyInput({
  id,
  name,
  label,
  value,
  onChange,
  disabled,
  error,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <div className={cn("flex rounded-lg border bg-surface focus-within:ring-2 focus-within:ring-brand/30", error ? "border-danger" : "border-line", disabled && "bg-muted")}>
        <span aria-hidden className="grid place-items-center px-3 font-mono text-sm text-subtle">
          ₦
        </span>
        <input
          id={id}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          readOnly={disabled}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className="h-11 min-w-0 flex-1 rounded-r-lg bg-transparent pr-3 text-right font-mono text-base outline-none disabled:text-subtle"
        />
      </div>
      {error && (
        <p id={`${id}-err`} className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

export function CountInput({
  id,
  name,
  label,
  value,
  onChange,
  disabled,
  error,
  placeholder = "0",
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        disabled={disabled}
        readOnly={disabled}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className={cn(
          "h-11 w-full rounded-lg border bg-surface px-3 text-right font-mono text-base outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:bg-muted disabled:text-subtle",
          error ? "border-danger" : "border-line",
        )}
      />
      {error && (
        <p id={`${id}-err`} className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
