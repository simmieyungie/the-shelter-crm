"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/forms";
import { endRoleAssignment } from "../../actions";

export function EndRoleButton({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(endRoleAssignment, {});
  useEffect(() => {
    if (!state.at) return;
    if (state.ok) toast.success(state.message ?? "Done");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`End the ${label} role from today?`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        End role
      </Button>
    </form>
  );
}
