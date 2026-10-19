import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { requireParishContext } from "@/lib/auth/context";
import { hasRoleIn, PARISH_ROLES } from "@/lib/auth/permissions";
import { formatDay, todayIso } from "@/lib/dates";
import { boardEvents, getBoard, taskFormOptions } from "@/lib/db/queries/tasks";
import { TaskBoard } from "./task-board";
import { TaskDialog } from "./task-dialog";

export const metadata = { title: "Tasks" };
export const dynamic = "force-dynamic";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ dept?: string; event?: string }> }) {
  const { access, parish, user } = await requireParishContext();
  if (!hasRoleIn(access, parish.id, PARISH_ROLES)) redirect("/");
  const sp = await searchParams;
  const [tasks, options, events] = await Promise.all([
    getBoard(access, user.id, parish.id, { departmentId: sp.dept, eventId: sp.event }),
    taskFormOptions(access, parish.id),
    boardEvents(parish.id),
  ]);
  const overdue = tasks.filter((t) => t.overdue).length;
  const event = events.find((e) => e.id === sp.event);
  const title = event ? `${event.name} · ${formatDay(event.date)}` : "All services";

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={
          <>
            {title} · <span className={overdue ? "font-semibold text-danger-text" : undefined}>{overdue} overdue</span>
          </>
        }
        actions={options.canCreate ? <TaskDialog options={options} today={todayIso()} /> : undefined}
      />
      <form action="/tasks" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="dept" className="block text-xs text-subtle">
            Department
          </label>
          <select id="dept" name="dept" defaultValue={sp.dept ?? ""} className="h-10 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="">All departments</option>
            {options.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            <option value="followup">First-timer follow-up</option>
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="event" className="block text-xs text-subtle">
            Service
          </label>
          <select id="event" name="event" defaultValue={sp.event ?? ""} className="h-10 max-w-64 rounded-lg border border-line bg-surface px-2 text-sm">
            <option value="">All services</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {formatDay(e.date)} · {e.name}
              </option>
            ))}
          </select>
        </div>
        <button className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-medium">Show</button>
      </form>
      <TaskBoard tasks={tasks} options={options} today={todayIso()} />
    </>
  );
}
