"use client";

import { CircleCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/dates";
import type { ActionState } from "@/lib/forms";
import { undoAction } from "../actions";

type Edited = { reportId: string; date: string; serviceName: string };

export function DoneStep({
  batchId,
  status,
  result,
  afterStatus,
  canUndo,
}: {
  batchId: string;
  status: string;
  result: { imported: number; firstDate: string | null; lastDate: string | null } | null;
  afterStatus: string;
  canUndo: boolean;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(undoAction, {});
  const [confirming, setConfirming] = useState(false);
  const edited = (state.data?.edited as Edited[] | undefined) ?? null;
  useEffect(() => {
    if (!state.at) return;
    if (state.ok) toast.success(state.message ?? "Undone");
    else if (state.error) toast.error(state.error);
  }, [state]);

  if (status === "UNDONE") {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center">
        <p className="font-semibold">This import was undone.</p>
        <p className="mt-1 text-sm text-subtle">The services it added have been removed.</p>
        <Button asChild className="mt-4 h-11">
          <Link href="/reports/import">Start a new import</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-line bg-surface p-6 text-center">
        <CircleCheck className="mx-auto size-10 text-success" aria-hidden />
        <p data-testid="import-result" className="mt-2 text-lg font-semibold">
          {result ? `${result.imported} services imported · ${formatDay(result.firstDate)} – ${formatDay(result.lastDate)}` : "Import complete"}
        </p>
        <p className="mt-1 text-sm text-subtle">
          {afterStatus === "VERIFIED" ? "They're verified and count in zone totals." : "They show as “Imported · check” until the pastor verifies them."}
        </p>
        <Button asChild className="mt-4 h-11">
          <Link href="/reports">See reports</Link>
        </Button>
      </div>

      {canUndo && (
        <form action={action} className="rounded-2xl border border-line bg-surface p-4">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="confirmEdited" value={edited ? "yes" : "no"} />
          <h2 className="font-semibold">Made a mistake?</h2>
          <p className="mb-3 text-sm text-subtle">Undo removes only the services this import added. Nothing else is touched.</p>
          {edited && (
            <div role="alert" className="mb-3 rounded-xl bg-warning-bg p-3 text-sm text-warning-text">
              <p className="font-medium">These imported reports were changed after import. Undo will remove them too:</p>
              <ul className="mt-1 list-disc pl-5">
                {edited.map((e) => (
                  <li key={e.reportId}>
                    {e.serviceName} · {formatDay(e.date)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!confirming && !edited ? (
            <Button type="button" variant="outline" className="h-11" onClick={() => setConfirming(true)}>
              <Undo2 className="size-4" aria-hidden /> Undo this import
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="destructive" className="h-11" disabled={pending}>
                {pending ? "Undoing…" : edited ? "Yes, remove them all" : "Yes, undo this import"}
              </Button>
              <Button type="button" variant="ghost" className="h-11" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
