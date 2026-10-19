"use client";

import { X } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/lib/forms";
import { removeUsher } from "../actions";

export function RemoveUsherButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(removeUsher, {});
  useEffect(() => {
    if (state.at && !state.ok && state.error) toast.error(state.error);
  }, [state]);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} aria-label={`Remove ${name}`} className="grid size-10 place-items-center rounded-full text-subtle hover:bg-muted hover:text-danger-text">
        <X className="size-4" aria-hidden />
      </button>
    </form>
  );
}
