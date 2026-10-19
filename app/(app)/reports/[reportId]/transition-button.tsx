"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/forms";
import { transitionReport } from "../actions";

export function TransitionButton({
  reportId,
  to,
  label,
  confirm: confirmText,
  variant = "default",
}: {
  reportId: string;
  to: "verify" | "send_back" | "reopen";
  label: string;
  confirm?: string;
  variant?: "default" | "outline";
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(transitionReport, {});
  useEffect(() => {
    if (!state.at) return;
    if (state.ok) toast.success(state.message ?? "Done");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="to" value={to} />
      <Button type="submit" variant={variant} className="h-11 w-full" disabled={pending}>
        {pending ? "Working…" : label}
      </Button>
    </form>
  );
}
