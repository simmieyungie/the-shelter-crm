"use client";

import { Plus } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDay } from "@/lib/dates";
import type { BoardTask } from "@/lib/db/queries/tasks";
import type { ActionState } from "@/lib/forms";
import { PRIORITY_LABELS } from "@/lib/labels";
import { saveTaskAction } from "./actions";

export type TaskOptions = {
  departments: { id: string; name: string }[];
  assignees: { id: string; name: string; departmentIds: string[] | null }[];
  events: { id: string; date: string; name: string; occurrence: number }[];
  canCreate: boolean;
};

const lagos = (iso: string) => {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return { date, time };
};

export function TaskDialog({
  options,
  today,
  task,
  open: controlledOpen,
  onOpenChange,
}: {
  options: TaskOptions;
  today: string;
  task?: BoardTask;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [state, action, pending] = useActionState<ActionState, FormData>(saveTaskAction, {});
  const [dept, setDept] = useState(task?.departmentId ?? options.departments[0]?.id ?? "");
  const people = options.assignees.filter((a) => !a.departmentIds || !dept || a.departmentIds.includes(dept));
  const due = task ? lagos(task.dueAt) : { date: today, time: "17:00" };
  const fe = state.fieldErrors ?? {};

  useEffect(() => {
    if (!state.at) return;
    if (state.ok) {
      toast.success(state.message ?? "Saved");
      setOpen(false);
    } else if (state.error) toast.error(state.error);
  }, [state, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!task && (
        <DialogTrigger asChild>
          <Button className="h-10">
            <Plus className="size-4" aria-hidden /> New task
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4" noValidate>
          {task && <input type="hidden" name="id" value={task.id} />}
          <div className="space-y-1.5">
            <Label htmlFor="title">What needs doing?</Label>
            <Input id="title" name="title" defaultValue={task?.title} required className="h-11" aria-invalid={!!fe.title} />
            {fe.title && <p className="text-xs text-danger-text">{fe.title}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Details (optional)</Label>
            <Textarea id="description" name="description" defaultValue={task?.description ?? ""} rows={2} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="departmentId">Department</Label>
              <select id="departmentId" name="departmentId" value={dept} onChange={(e) => setDept(e.target.value)} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
                {options.assignees.some((a) => a.departmentIds === null) && <option value="">No department</option>}
                {options.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assignedTo">Assign to</Label>
              <select id="assignedTo" name="assignedTo" key={dept} defaultValue={task?.assignedTo ?? people[0]?.id} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm" aria-invalid={!!fe.assignedTo}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {people.length === 0 && <p className="text-xs text-subtle">No one in this department has an account yet.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <select id="priority" name="priority" defaultValue={task?.priority ?? "MEDIUM"} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="serviceEventId">For service (optional)</Label>
              <select id="serviceEventId" name="serviceEventId" defaultValue={task?.serviceEventId ?? ""} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
                <option value="">Not tied to a service</option>
                {options.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {formatDay(e.date)} · {e.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" defaultValue={due.date} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dueTime">Due time</Label>
              <Input id="dueTime" name="dueTime" type="time" defaultValue={due.time} className="h-11" />
            </div>
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-danger-text">
              {state.error}
            </p>
          )}
          <Button type="submit" className="h-11 w-full sm:w-auto" disabled={pending}>
            {pending ? "Saving…" : task ? "Save changes" : "Create task"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

