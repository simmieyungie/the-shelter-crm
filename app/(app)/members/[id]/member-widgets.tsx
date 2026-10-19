"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/forms";
import { formatDay } from "@/lib/dates";
import { markPresent, mergeMembers, setMilestone } from "../actions";

function useResult(state: ActionState, quiet = false) {
  useEffect(() => {
    if (!state.at) return;
    if (state.ok && !quiet) toast.success(state.message ?? "Saved");
    else if (!state.ok && state.error) toast.error(state.error);
  }, [state, quiet]);
}

export function MilestoneRow({ memberId, milestone, label, done, completedOn, canEdit }: { memberId: string; milestone: string; label: string; done: boolean; completedOn: string | null; canEdit: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setMilestone, {});
  useResult(state, true);
  const ref = useRef<HTMLFormElement>(null);
  const id = `ms-${milestone}`;
  return (
    <li className="py-2">
      <form ref={ref} action={action} className="flex flex-wrap items-center justify-between gap-2">
        <input type="hidden" name="memberId" value={memberId} />
        <input type="hidden" name="milestone" value={milestone} />
        <label htmlFor={id} className="flex min-h-11 items-center gap-3">
          <input id={id} type="checkbox" name="done" defaultChecked={done} disabled={!canEdit || pending} onChange={() => ref.current?.requestSubmit()} className="size-5 accent-[var(--brand)]" />
          <span className="text-sm">{label}</span>
        </label>
        {canEdit ? (
          <input type="date" name="completedOn" aria-label={`${label} date`} defaultValue={completedOn ?? ""} onBlur={() => done && ref.current?.requestSubmit()} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm" />
        ) : (
          <span className="text-xs text-subtle">{completedOn ? formatDay(completedOn) : done ? "Done" : ""}</span>
        )}
      </form>
    </li>
  );
}

export function MarkPresentForm({ memberId, events }: { memberId: string; events: { id: string; label: string }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(markPresent, {});
  useResult(state);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="memberId" value={memberId} />
      <label htmlFor="serviceEventId" className="sr-only">
        Service
      </label>
      <select id="serviceEventId" name="serviceEventId" className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {e.label}
          </option>
        ))}
      </select>
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        Mark present
      </Button>
    </form>
  );
}

export function MergeButton({ keepId, removeId, label }: { keepId: string; removeId: string; label: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mergeMembers, {});
  useResult(state);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Merge ${label} into this record? Their attendance, tasks and messages move here and the other record is removed.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="keepId" value={keepId} />
      <input type="hidden" name="removeId" value={removeId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Same person · merge here
      </Button>
    </form>
  );
}
