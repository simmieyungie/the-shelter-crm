import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EntityForm } from "@/components/app/entity-form";
import { FormDialog } from "@/components/app/form-dialog";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/status-pill";
import { requireAppContext } from "@/lib/auth/context";
import { canAdminParish } from "@/lib/auth/permissions";
import { formatTime, WEEKDAY_NAMES } from "@/lib/dates";
import { getAdminParishes, getParishSetup } from "@/lib/db/queries/admin";
import { RECURRENCE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { saveDepartment, saveParishSettings, saveSanctuaryZone, saveServiceType, saveSmallGroup } from "../actions";

export const metadata = { title: "Parish setup" };

const TABS = [
  ["zones", "Sanctuary zones"],
  ["services", "Services"],
  ["departments", "Departments"],
  ["tribes", "Tribes"],
  ["settings", "Settings"],
] as const;
type Tab = (typeof TABS)[number][0];

export default async function ParishSetupPage({ searchParams }: { searchParams: Promise<{ parish?: string; tab?: string }> }) {
  const { access, parish: current } = await requireAppContext();
  const sp = await searchParams;
  const options = await getAdminParishes(access);
  const parishId = sp.parish && options.some((p) => p.id === sp.parish) ? sp.parish : current && canAdminParish(access, current.id) ? current.id : options[0]?.id;
  if (!parishId) redirect("/admin");
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "zones") as Tab;
  const setup = await getParishSetup(access, parishId);
  const hidden = { parishId };
  const q = (t: string) => `/admin/parish?parish=${parishId}&tab=${t}`;

  return (
    <>
      <PageHeader title="Parish setup" subtitle={setup.parish.name} back="/admin" />
      {options.length > 1 && (
        <form className="mb-4 flex items-center gap-2" action="/admin/parish">
          <label htmlFor="parish" className="text-sm text-subtle">
            Parish
          </label>
          <select id="parish" name="parish" defaultValue={parishId} className="h-10 rounded-lg border border-line bg-surface px-3 text-sm">
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="tab" value={tab} />
          <button className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-medium">Open</button>
        </form>
      )}
      <nav aria-label="Setup sections" className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={q(key)}
            aria-current={tab === key ? "page" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium",
              tab === key ? "border-brand bg-brand-tint text-brand" : "border-line bg-surface text-subtle",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "zones" && (
        <Section
          title="Sanctuary zones"
          note="Ushers count by zone. Capacity is optional."
          add={<FormDialog title="Add sanctuary zone" trigger={<><Plus className="size-4" aria-hidden /> Add zone</>} action={saveSanctuaryZone} hidden={hidden} fields={zoneFields()} />}
        >
          {setup.zones.map((z) => (
            <Item key={z.id} title={z.name} meta={[z.capacity ? `Capacity ${z.capacity}` : "No capacity set", `Order ${z.sortOrder}`]} inactive={!z.isActive}>
              <FormDialog title={`Edit ${z.name}`} trigger={<Pencil className="size-4" aria-label={`Edit ${z.name}`} />} triggerVariant="ghost" triggerSize="icon" action={saveSanctuaryZone} hidden={{ ...hidden, id: z.id }} fields={zoneFields(z)} />
            </Item>
          ))}
        </Section>
      )}

      {tab === "services" && (
        <Section
          title="Services"
          note="Set how many times a service can hold on one day. Most parishes leave this at 1."
          add={<FormDialog title="Add service" trigger={<><Plus className="size-4" aria-hidden /> Add service</>} action={saveServiceType} hidden={hidden} fields={serviceFields()} columns={2} />}
        >
          {setup.serviceTypes.map((t) => (
            <Item
              key={t.id}
              title={t.name}
              meta={[
                t.recurrence === "WEEKLY" && t.dayOfWeek !== null ? `${WEEKDAY_NAMES[t.dayOfWeek]}s` : RECURRENCE_LABELS[t.recurrence],
                formatTime(t.startTime),
                t.maxPerDay > 1 ? `Up to ${t.maxPerDay} a day` : "Once a day",
                t.location ?? "",
              ].filter(Boolean)}
              inactive={!t.isActive}
            >
              <FormDialog title={`Edit ${t.name}`} trigger={<Pencil className="size-4" aria-label={`Edit ${t.name}`} />} triggerVariant="ghost" triggerSize="icon" action={saveServiceType} hidden={{ ...hidden, id: t.id }} fields={serviceFields(t)} columns={2} />
            </Item>
          ))}
        </Section>
      )}

      {tab === "departments" && (
        <Section
          title="Departments"
          add={<FormDialog title="Add department" trigger={<><Plus className="size-4" aria-hidden /> Add department</>} action={saveDepartment} hidden={hidden} fields={[{ name: "name", label: "Name", type: "text", required: true }]} />}
        >
          {setup.departments.map((d) => (
            <Item key={d.id} title={d.name} meta={[]}>
              <FormDialog title={`Rename ${d.name}`} trigger={<Pencil className="size-4" aria-label={`Rename ${d.name}`} />} triggerVariant="ghost" triggerSize="icon" action={saveDepartment} hidden={{ ...hidden, id: d.id }} fields={[{ name: "name", label: "Name", type: "text", required: true, defaultValue: d.name }]} />
            </Item>
          ))}
        </Section>
      )}

      {tab === "tribes" && (
        <Section
          title="Tribes and house fellowships"
          note="First-timers are invited to the tribe chosen when they register."
          add={<FormDialog title="Add tribe" trigger={<><Plus className="size-4" aria-hidden /> Add tribe</>} action={saveSmallGroup} hidden={hidden} fields={groupFields(setup.members)} columns={2} />}
        >
          {setup.groups.map(({ group: g, leaderFirst, leaderLast }) => (
            <Item key={g.id} title={g.name} meta={[g.typeName, leaderFirst ? `Leader: ${leaderFirst} ${leaderLast}` : "No leader", g.landmark ?? g.address ?? ""].filter(Boolean)} inactive={!g.isActive}>
              <FormDialog title={`Edit ${g.name}`} trigger={<Pencil className="size-4" aria-label={`Edit ${g.name}`} />} triggerVariant="ghost" triggerSize="icon" action={saveSmallGroup} hidden={{ ...hidden, id: g.id }} fields={groupFields(setup.members, g)} columns={2} />
            </Item>
          ))}
        </Section>
      )}

      {tab === "settings" && (
        <div className="max-w-xl rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-4 font-semibold">Parish settings</h2>
          <EntityForm
            action={saveParishSettings}
            hidden={hidden}
            fields={[
              {
                name: "followUpLeadUserId",
                label: "Follow-up lead",
                type: "select",
                defaultValue: setup.parish.followUpLeadUserId,
                options: setup.users.map((u) => ({ value: u.id, label: u.name })),
                placeholder: "Parish pastor (default)",
                hint: "Gets the Day-3 call task for every new first-timer.",
              },
              { name: "address", label: "Address", type: "text", defaultValue: setup.parish.address },
              { name: "phone", label: "Phone", type: "tel", defaultValue: setup.parish.phone },
              { name: "email", label: "Email", type: "email", defaultValue: setup.parish.email },
            ]}
          />
        </div>
      )}
    </>
  );
}

function Section({ title, note, add, children }: { title: string; note?: string; add: React.ReactNode; children: React.ReactNode }) {
  const empty = Array.isArray(children) && children.length === 0;
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {note && <p className="text-sm text-subtle">{note}</p>}
        </div>
        {add}
      </div>
      <ul className="divide-y divide-line">{empty ? <li className="p-4 text-sm text-subtle">Nothing here yet.</li> : children}</ul>
    </section>
  );
}

function Item({ title, meta, inactive, children }: { title: string; meta: string[]; inactive?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-medium">
          {title} {inactive && <StatusPill tone="neutral">Inactive</StatusPill>}
        </p>
        {meta.length > 0 && <p className="truncate text-sm text-subtle">{meta.join(" · ")}</p>}
      </div>
      {children}
    </li>
  );
}

function zoneFields(z?: { name: string; capacity: number | null; sortOrder: number; isActive: boolean }) {
  return [
    { name: "name", label: "Name", type: "text" as const, required: true, defaultValue: z?.name, placeholder: "Gallery – Left" },
    { name: "capacity", label: "Capacity (seats)", type: "number" as const, min: 0, defaultValue: z?.capacity },
    { name: "sortOrder", label: "Order on screen", type: "number" as const, min: 0, defaultValue: z?.sortOrder ?? 0 },
    { name: "isActive", label: "In use", type: "checkbox" as const, defaultValue: z?.isActive ?? true },
  ];
}

function serviceFields(t?: { name: string; recurrence: keyof typeof RECURRENCE_LABELS; dayOfWeek: number | null; startTime: string; location: string | null; maxPerDay: number; isActive: boolean }) {
  return [
    { name: "name", label: "Name", type: "text" as const, required: true, defaultValue: t?.name, placeholder: "Sunday 1st Service" },
    {
      name: "recurrence",
      label: "How often",
      type: "select" as const,
      required: true,
      defaultValue: t?.recurrence ?? "WEEKLY",
      options: Object.entries(RECURRENCE_LABELS).map(([value, label]) => ({ value, label })),
    },
    {
      name: "dayOfWeek",
      label: "Day",
      type: "select" as const,
      defaultValue: t?.dayOfWeek !== null && t?.dayOfWeek !== undefined ? String(t.dayOfWeek) : "0",
      options: WEEKDAY_NAMES.map((label, i) => ({ value: String(i), label })),
      hint: "Used for weekly services.",
    },
    { name: "startTime", label: "Start time", type: "time" as const, required: true, defaultValue: t?.startTime?.slice(0, 5) ?? "08:00" },
    { name: "location", label: "Location", type: "text" as const, defaultValue: t?.location, placeholder: "Main auditorium" },
    {
      name: "maxPerDay",
      label: "Times it can hold on one day",
      type: "number" as const,
      min: 1,
      defaultValue: t?.maxPerDay ?? 1,
      hint: "Set to 2 or more if you sometimes run this service twice on the same date.",
    },
    { name: "isActive", label: "Active", type: "checkbox" as const, defaultValue: t?.isActive ?? true },
  ];
}

function groupFields(
  members: { id: string; firstName: string; lastName: string }[],
  g?: { typeName: string; name: string; address: string | null; landmark: string | null; leaderMemberId: string | null; isActive: boolean },
) {
  return [
    { name: "name", label: "Name", type: "text" as const, required: true, defaultValue: g?.name },
    { name: "typeName", label: "Type", type: "text" as const, required: true, defaultValue: g?.typeName ?? "Tribe" },
    { name: "address", label: "Address", type: "text" as const, defaultValue: g?.address },
    { name: "landmark", label: "Landmark", type: "text" as const, defaultValue: g?.landmark },
    {
      name: "leaderMemberId",
      label: "Leader",
      type: "select" as const,
      defaultValue: g?.leaderMemberId,
      options: members.map((m) => ({ value: m.id, label: `${m.firstName} ${m.lastName}` })),
    },
    { name: "isActive", label: "Active", type: "checkbox" as const, defaultValue: g?.isActive ?? true },
  ];
}
