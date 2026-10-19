import { redirect } from "next/navigation";
import { EntityForm } from "@/components/app/entity-form";
import { PageHeader } from "@/components/app/page-header";
import { requireParishContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDay, formatTime, ordinal } from "@/lib/dates";
import { getRoster, rosterableEvents } from "@/lib/db/queries/count";
import { assignUsher } from "../actions";
import { RemoveUsherButton } from "./remove-usher-button";

export const metadata = { title: "Usher roster" };

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { access, parish } = await requireParishContext();
  if (!can(access, "manageRoster", parish.id)) redirect("/count");
  const events = await rosterableEvents(access, parish.id);
  const { event: wanted } = await searchParams;
  const eventId = events.find((e) => e.id === wanted)?.id ?? events.find((e) => e.date >= new Date().toISOString().slice(0, 10))?.id ?? events[0]?.id;
  const roster = eventId ? await getRoster(access, eventId) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Usher roster" subtitle="Who counts which zone. Ushers can still count any zone." back="/count" />
      <form action="/count/roster" className="mb-5 flex flex-wrap items-center gap-2">
        <label htmlFor="event" className="text-sm text-subtle">
          Service
        </label>
        <select id="event" name="event" defaultValue={eventId} className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm">
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {formatDay(e.date)} · {e.name}
              {e.occurrence > 1 ? ` (${ordinal(e.occurrence)})` : ""} · {formatTime(e.startTime)}
            </option>
          ))}
        </select>
        <button className="h-11 rounded-lg border border-line bg-surface px-4 text-sm font-medium">Open</button>
      </form>

      {roster && (
        <div className="grid gap-5 md:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            {roster.zones.map((z) => {
              const here = roster.assignments.filter((a) => a.a.sanctuaryZoneId === z.id);
              return (
                <section key={z.id} className="rounded-2xl border border-line bg-surface">
                  <h2 className="flex items-center justify-between border-b border-line px-4 py-3 font-semibold">
                    {z.name} <span className="text-sm font-normal text-subtle">{here.length} usher{here.length === 1 ? "" : "s"}</span>
                  </h2>
                  <ul className="divide-y divide-line">
                    {here.map(({ a, name }) => (
                      <li key={a.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                        <span>
                          {name} {a.isLead && <span className="ml-1 rounded-full bg-brand-tint px-2 py-0.5 text-xs text-brand">Lead</span>}
                          {a.checkedInAt && <span className="ml-1 text-xs text-success-text">· on duty</span>}
                        </span>
                        <RemoveUsherButton id={a.id} name={name} />
                      </li>
                    ))}
                    {here.length === 0 && <li className="px-4 py-3 text-sm text-subtle">No one yet.</li>}
                  </ul>
                </section>
              );
            })}
          </div>
          <aside className="h-fit rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-3 font-semibold">Assign an usher</h2>
            <EntityForm
              action={assignUsher}
              hidden={{ serviceEventId: roster.event.id }}
              submitLabel="Assign"
              fields={[
                { name: "userId", label: "Usher", type: "select", required: true, placeholder: "Choose", options: roster.ushers.map((u) => ({ value: u.id, label: u.name })) },
                { name: "sanctuaryZoneId", label: "Zone", type: "select", required: true, placeholder: "Choose", options: roster.zones.map((z) => ({ value: z.id, label: z.name })) },
                { name: "isLead", label: "Zone lead", type: "checkbox" },
              ]}
            />
          </aside>
        </div>
      )}
    </div>
  );
}
