"use client";

import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { BoardTask } from "@/lib/db/queries/tasks";
import type { TaskStatus } from "@/lib/db/schema";
import { PRIORITY_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { moveTaskAction } from "./actions";
import { TaskDialog, type TaskOptions } from "./task-dialog";

const COLUMNS: TaskStatus[] = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];

function dueLabel(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date(iso))
    .replace(",", "");
}

export function TaskBoard({ tasks, options, today }: { tasks: BoardTask[]; options: TaskOptions; today: string }) {
  const [optimistic, setOptimistic] = useOptimistic(tasks, (state, move: { id: string; status: TaskStatus }) =>
    state.map((t) => (t.id === move.id ? { ...t, status: move.status, overdue: move.status === "DONE" ? false : t.overdue } : t)),
  );
  const [, startTransition] = useTransition();
  const [phoneColumn, setPhoneColumn] = useState<TaskStatus>("TODO");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  function move(task: BoardTask, status: TaskStatus) {
    if (task.status === status) return;
    if (!task.canMove) {
      toast.error("Only the person assigned or their HOD can move this task.");
      return;
    }
    startTransition(async () => {
      setOptimistic({ id: task.id, status });
      const res = await moveTaskAction(task.id, status);
      if (!res.ok) toast.error(res.error ?? "Couldn't move the task");
      else toast.success(`Moved to ${TASK_STATUS_LABELS[status]}`);
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const task = optimistic.find((t) => t.id === e.active.id);
    const to = e.over?.id as TaskStatus | undefined;
    if (task && to && COLUMNS.includes(to)) move(task, to);
  }

  const byColumn = (c: TaskStatus) => optimistic.filter((t) => t.status === c);

  return (
    <>
      {/* Desktop: drag-and-drop board */}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div data-testid="task-board" className="hidden gap-3 md:grid md:grid-cols-4">
          {COLUMNS.map((c) => (
            <Column key={c} status={c} count={byColumn(c).length}>
              {byColumn(c).map((t) => (
                <DraggableCard key={t.id} task={t}>
                  <TaskCard task={t} onMove={move} options={options} today={today} />
                </DraggableCard>
              ))}
            </Column>
          ))}
        </div>
      </DndContext>

      {/* Phone: one column at a time */}
      <div className="md:hidden">
        <div role="tablist" aria-label="Task status" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {COLUMNS.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={phoneColumn === c}
              onClick={() => setPhoneColumn(c)}
              className={cn("inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium", phoneColumn === c ? "border-brand bg-brand-tint text-brand" : "border-line bg-surface text-subtle")}
            >
              {TASK_STATUS_LABELS[c]} · {byColumn(c).length}
            </button>
          ))}
        </div>
        <ul className="space-y-2" data-testid="phone-column">
          {byColumn(phoneColumn).map((t) => (
            <li key={t.id}>
              <TaskCard task={t} onMove={move} options={options} today={today} />
            </li>
          ))}
          {byColumn(phoneColumn).length === 0 && <li className="rounded-2xl border border-dashed border-line p-6 text-center text-sm text-subtle">Nothing here.</li>}
        </ul>
      </div>
    </>
  );
}

function Column({ status, count, children }: { status: TaskStatus; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} aria-label={TASK_STATUS_LABELS[status]} data-testid={`column-${status}`} className={cn("min-h-64 rounded-2xl bg-muted/70 p-2 transition-colors", isOver && "bg-brand-soft ring-2 ring-brand/30")}>
      <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold">
        {TASK_STATUS_LABELS[status]} <span className="font-mono text-xs text-subtle">{count}</span>
      </h2>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function DraggableCard({ task, children }: { task: BoardTask; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !task.canMove });
  return (
    <li
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn(isDragging && "relative z-50 opacity-90 shadow-lg", task.canMove && "cursor-grab active:cursor-grabbing")}
      {...listeners}
      {...attributes}
      aria-roledescription="Draggable task"
    >
      {children}
    </li>
  );
}

function TaskCard({ task: t, onMove, options, today }: { task: BoardTask; onMove: (t: BoardTask, s: TaskStatus) => void; options: TaskOptions; today: string }) {
  const [editing, setEditing] = useState(false);
  return (
    <article data-testid="task-card" data-overdue={t.overdue ? "true" : "false"} className={cn("rounded-xl border bg-surface p-3", t.overdue ? "border-2 border-danger" : "border-line")}>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <PriorityPill priority={t.priority} />
        {t.kind === "FOLLOW_UP" ? (
          <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand">Follow-up</span>
        ) : (
          t.departmentName && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-subtle">{t.departmentName}</span>
        )}
        <div className="ml-auto" onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Actions for ${t.title}`} className="grid size-8 place-items-center rounded-full text-subtle hover:bg-muted">
              <Ellipsis className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {t.canMove && (
                <>
                  <DropdownMenuLabel className="text-xs text-subtle">Move to</DropdownMenuLabel>
                  {COLUMNS.filter((c) => c !== t.status).map((c) => (
                    <DropdownMenuItem key={c} onSelect={() => onMove(t, c)}>
                      {TASK_STATUS_LABELS[c]}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {t.memberId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href={`/members/${t.memberId}`}>Open member</Link>
                  </DropdownMenuItem>
                </>
              )}
              {t.canManage && t.kind === "OPERATIONS" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setEditing(true)}>Edit task</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onMove(t, "CANCELLED")} className="text-danger-text">
                    Cancel task
                  </DropdownMenuItem>
                </>
              )}
              {!t.canMove && !t.memberId && <DropdownMenuLabel className="text-xs font-normal text-subtle">View only</DropdownMenuLabel>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {editing && <TaskDialog options={options} today={today} task={t} open={editing} onOpenChange={setEditing} />}
      <h3 className="text-sm font-semibold leading-snug text-ink">{t.title}</h3>
      <p className="mt-1 text-xs text-subtle">{t.assigneeName}</p>
      <p className={cn("mt-1 font-mono text-xs", t.overdue ? "font-bold text-danger-text" : "text-subtle")}>
        {t.overdue ? "Overdue · " : t.status === "DONE" ? "Done · was due " : "Due "}
        {dueLabel(t.dueAt)}
      </p>
    </article>
  );
}

function PriorityPill({ priority }: { priority: BoardTask["priority"] }) {
  const cls =
    priority === "URGENT"
      ? "bg-danger text-white"
      : priority === "HIGH"
        ? "bg-danger-bg text-danger-text"
        : priority === "MEDIUM"
          ? "bg-warning-bg text-warning-text"
          : "bg-muted text-subtle";
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", cls)}>{PRIORITY_LABELS[priority]}</span>;
}
