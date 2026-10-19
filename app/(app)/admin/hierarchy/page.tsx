import { Pencil, Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/app/form-dialog";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/status-pill";
import { requireAppContext } from "@/lib/auth/context";
import { getHierarchy } from "@/lib/db/queries/admin";
import { saveHierarchyNode } from "../actions";

export const metadata = { title: "Hierarchy" };

type Level = "region" | "province" | "zone" | "area" | "parish";
const LABEL: Record<Level, string> = { region: "region", province: "province", zone: "zone", area: "area", parish: "parish" };

function nodeFields(level: Level, node?: { name: string; code: string; address?: string | null; phone?: string | null; email?: string | null; isActive?: boolean }) {
  const fields = [
    { name: "name", label: "Name", type: "text" as const, required: true, defaultValue: node?.name },
    { name: "code", label: "Code", type: "text" as const, required: true, defaultValue: node?.code, hint: "Short unique code, e.g. LZ04-P7" },
  ];
  if (level !== "parish") return fields;
  return [
    ...fields,
    { name: "address", label: "Address", type: "text" as const, defaultValue: node?.address },
    { name: "phone", label: "Phone", type: "tel" as const, defaultValue: node?.phone },
    { name: "email", label: "Email", type: "email" as const, defaultValue: node?.email },
    { name: "isActive", label: "Active", type: "checkbox" as const, defaultValue: node?.isActive ?? true },
  ];
}

function AddChild({ level, parentId, parentName }: { level: Level; parentId?: string; parentName?: string }) {
  return (
    <FormDialog
      title={`Add ${LABEL[level]}${parentName ? ` to ${parentName}` : ""}`}
      trigger={
        <>
          <Plus className="size-4" aria-hidden /> Add {LABEL[level]}
        </>
      }
      triggerVariant="ghost"
      triggerSize="sm"
      action={saveHierarchyNode}
      hidden={{ level, ...(parentId ? { parentId } : {}) }}
      fields={nodeFields(level)}
    />
  );
}

function Edit({ level, node }: { level: Level; node: { id: string; name: string; code: string } }) {
  return (
    <FormDialog
      title={`Edit ${node.name}`}
      trigger={<Pencil className="size-4" aria-label={`Edit ${node.name}`} />}
      triggerVariant="ghost"
      triggerSize="icon"
      action={saveHierarchyNode}
      hidden={{ level, id: node.id }}
      fields={nodeFields(level, node)}
    />
  );
}

export default async function HierarchyPage() {
  const { access } = await requireAppContext();
  if (!access.isSystemAdmin) redirect("/admin");
  const h = await getHierarchy(access);

  return (
    <>
      <PageHeader title="Hierarchy" subtitle="Region → Province → Zone → Area → Parish" back="/admin" actions={<AddChild level="region" />} />
      <div className="space-y-4">
        {h.regions.map((r) => (
          <section key={r.id} className="rounded-2xl border border-line bg-surface p-4">
            <Row level="region" node={r} />
            <div className="ml-3 mt-2 space-y-3 border-l border-line pl-4">
              {h.provinces.filter((p) => p.regionId === r.id).map((p) => (
                <div key={p.id}>
                  <Row level="province" node={p} />
                  <div className="ml-3 mt-2 space-y-3 border-l border-line pl-4">
                    {h.zones.filter((z) => z.provinceId === p.id).map((z) => (
                      <div key={z.id}>
                        <Row level="zone" node={z} />
                        <div className="ml-3 mt-2 space-y-2 border-l border-line pl-4">
                          {h.areas.filter((a) => a.zoneId === z.id).map((a) => (
                            <div key={a.id}>
                              <Row level="area" node={a} />
                              <ul className="ml-3 mt-1 space-y-1 border-l border-line pl-4">
                                {h.parishes.filter((x) => x.areaId === a.id).map((x) => (
                                  <li key={x.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 hover:bg-muted">
                                    <span className="min-w-0">
                                      <span className="font-medium">{x.name}</span> <span className="font-mono text-xs text-subtle">{x.code}</span>
                                      {!x.isActive && <StatusPill tone="neutral" className="ml-2">Inactive</StatusPill>}
                                    </span>
                                    <Edit level="parish" node={x} />
                                  </li>
                                ))}
                              </ul>
                              <div className="ml-7"><AddChild level="parish" parentId={a.id} parentName={a.name} /></div>
                            </div>
                          ))}
                          <AddChild level="area" parentId={z.id} parentName={z.name} />
                        </div>
                      </div>
                    ))}
                    <AddChild level="zone" parentId={p.id} parentName={p.name} />
                  </div>
                </div>
              ))}
              <AddChild level="province" parentId={r.id} parentName={r.name} />
            </div>
          </section>
        ))}
        {h.regions.length === 0 && <p className="text-sm text-subtle">No regions yet. Add the first one.</p>}
      </div>
    </>
  );
}

function Row({ level, node }: { level: Level; node: { id: string; name: string; code: string } }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="min-w-0">
        <span className="text-xs uppercase tracking-wide text-subtle">{LABEL[level]}</span>{" "}
        <span className="font-semibold">{node.name}</span> <span className="font-mono text-xs text-subtle">{node.code}</span>
      </p>
      <Edit level={level} node={node} />
    </div>
  );
}

