import { notFound } from "next/navigation";
import { EntityForm } from "@/components/app/entity-form";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/status-pill";
import { requireAppContext } from "@/lib/auth/context";
import { PARISH_ROLES } from "@/lib/auth/permissions";
import { formatDay, todayIso } from "@/lib/dates";
import { getUserDetail, scopeOptions } from "@/lib/db/queries/admin";
import { roleEnum } from "@/lib/db/schema";
import { ROLE_LABELS, SCOPE_LABELS } from "@/lib/labels";
import { saveUser } from "../../actions";
import { EndRoleButton } from "./end-role-button";
import { RoleGrantForm } from "./role-grant-form";

export const metadata = { title: "Person" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await requireAppContext();
  const detail = await getUserDetail(access, id).catch(() => null);
  if (!detail) notFound();
  const { user, assignments, names } = detail;
  const today = todayIso();
  const scopes = await scopeOptions(access);
  const grantable = access.isSystemAdmin ? [...roleEnum.enumValues] : PARISH_ROLES;

  return (
    <>
      <PageHeader title={user.name} back="/admin/users" />
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="mb-4 font-semibold">Details</h2>
          <EntityForm
            action={saveUser}
            hidden={{ id: user.id }}
            fields={[
              { name: "name", label: "Full name", type: "text", required: true, defaultValue: user.name },
              { name: "phone", label: "Phone", type: "tel", defaultValue: user.phone },
              { name: "email", label: "Email", type: "email", defaultValue: user.email },
              { name: "password", label: "New password", type: "password", hint: "Leave blank to keep the current password." },
              { name: "isActive", label: "Can sign in", type: "checkbox", defaultValue: user.isActive },
            ]}
          />
        </section>
        <section className="space-y-5">
          <div className="rounded-2xl border border-line bg-surface">
            <h2 className="border-b border-line p-4 font-semibold">Roles</h2>
            <ul className="divide-y divide-line">
              {assignments.map((a) => {
                const active = a.startsOn <= today && (!a.endsOn || a.endsOn >= today);
                const where = a.scopeLevel === "GLOBAL" ? "Everywhere" : `${SCOPE_LABELS[a.scopeLevel]}: ${names.get(a.scopeId!) ?? "—"}`;
                const extra = a.departmentId ? ` · ${names.get(a.departmentId)}` : a.smallGroupId ? ` · ${names.get(a.smallGroupId)}` : "";
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {ROLE_LABELS[a.role]} {active ? <StatusPill tone="success">Active</StatusPill> : <StatusPill tone="neutral">{a.startsOn > today ? "Starts later" : "Ended"}</StatusPill>}
                      </p>
                      <p className="text-sm text-subtle">
                        {where}
                        {extra} · from {formatDay(a.startsOn)}
                        {a.endsOn ? ` to ${formatDay(a.endsOn)}` : ""}
                      </p>
                    </div>
                    {active && <EndRoleButton id={a.id} label={ROLE_LABELS[a.role]} />}
                  </li>
                );
              })}
              {assignments.length === 0 && <li className="p-4 text-sm text-subtle">No roles yet.</li>}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="mb-4 font-semibold">Give a role</h2>
            <RoleGrantForm userId={user.id} roles={grantable} scopes={scopes} today={today} />
          </div>
        </section>
      </div>
    </>
  );
}
