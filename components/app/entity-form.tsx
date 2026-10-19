"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionState } from "@/lib/forms";
import { cn } from "@/lib/utils";

export type Field =
  | { name: string; label: string; type: "text" | "email" | "tel" | "password" | "date" | "time"; required?: boolean; defaultValue?: string | null; placeholder?: string; hint?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"] }
  | { name: string; label: string; type: "number"; required?: boolean; defaultValue?: number | string | null; min?: number; placeholder?: string; hint?: string }
  | { name: string; label: string; type: "textarea"; required?: boolean; defaultValue?: string | null; placeholder?: string; hint?: string }
  | { name: string; label: string; type: "select"; required?: boolean; defaultValue?: string | null; options: { value: string; label: string }[]; placeholder?: string; hint?: string }
  | { name: string; label: string; type: "checkbox"; defaultValue?: boolean; hint?: string };

export type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function EntityForm({
  action,
  fields,
  hidden,
  submitLabel = "Save",
  onDone,
  className,
  columns = 1,
}: {
  action: FormAction;
  fields: Field[];
  hidden?: Record<string, string>;
  submitLabel?: string;
  onDone?: () => void;
  className?: string;
  columns?: 1 | 2;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.at) return;
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      formRef.current?.reset();
      onDone?.();
    } else if (state.error) toast.error(state.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);

  return (
    <form ref={formRef} action={formAction} className={cn("space-y-4", className)} noValidate>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div className={cn("grid gap-4", columns === 2 && "sm:grid-cols-2")}>
        {fields.map((f) => (
          <FieldControl key={f.name} field={f} error={state.fieldErrors?.[f.name]} />
        ))}
      </div>
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-sm text-danger-text">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-11 min-w-28">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

function FieldControl({ field: f, error }: { field: Field; error?: string }) {
  const id = `f-${f.name}`;
  const describedBy = error ? `${id}-err` : f.hint ? `${id}-hint` : undefined;
  if (f.type === "checkbox") {
    return (
      <div className="flex items-start gap-3 sm:col-span-2">
        <input
          id={id}
          name={f.name}
          type="checkbox"
          defaultChecked={f.defaultValue}
          className="mt-0.5 size-5 accent-[var(--brand)]"
          aria-describedby={describedBy}
        />
        <div>
          <Label htmlFor={id}>{f.label}</Label>
          {f.hint && (
            <p id={`${id}-hint`} className="text-xs text-subtle">
              {f.hint}
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("space-y-1.5", f.type === "textarea" && "sm:col-span-2")}>
      <Label htmlFor={id}>
        {f.label}
        {"required" in f && f.required && <span className="text-danger-text"> *</span>}
      </Label>
      {f.type === "select" ? (
        <select
          id={id}
          name={f.name}
          defaultValue={f.defaultValue ?? ""}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          {!f.required && <option value="">{f.placeholder ?? "—"}</option>}
          {f.required && f.placeholder && (
            <option value="" disabled>
              {f.placeholder}
            </option>
          )}
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : f.type === "textarea" ? (
        <Textarea id={id} name={f.name} defaultValue={f.defaultValue ?? ""} placeholder={f.placeholder} aria-invalid={!!error} aria-describedby={describedBy} />
      ) : (
        <Input
          id={id}
          name={f.name}
          type={f.type}
          defaultValue={f.defaultValue ?? ""}
          placeholder={f.placeholder}
          min={f.type === "number" ? f.min : undefined}
          inputMode={f.type === "number" ? "numeric" : f.type === "tel" ? "tel" : "inputMode" in f ? f.inputMode : undefined}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className="h-11"
        />
      )}
      {error ? (
        <p id={`${id}-err`} className="text-xs text-danger-text">
          {error}
        </p>
      ) : f.hint ? (
        <p id={`${id}-hint`} className="text-xs text-subtle">
          {f.hint}
        </p>
      ) : null}
    </div>
  );
}
