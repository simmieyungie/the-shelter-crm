import { ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/app/form-dialog";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/status-pill";
import { Input } from "@/components/ui/input";
import { requireAppContext } from "@/lib/auth/context";
import { canAdminParish, PARISH_ROLES } from "@/lib/auth/permissions";
import { getAdminParishes, listUsers, scopeOptions } from "@/lib/db/queries/admin";
import { formatPhone } from "@/lib/phone";
import { ROLE_LABELS } from "@/lib/labels";
import { saveUser } from "../actions";

export const metadata = { title: "People & roles" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { access, parish } = await requireAppContext();
  const isPastor = !!parish && canAdminParish(access, parish.id);
  if (!access.isSystemAdmin && !isPastor) redirect("/admin");
  const { q } = await searchParams;
  const users = await listUsers(access, q);
  const parishes = await getAdminParishes(access);
  const opts = await scopeOptions(access);
  const defaultParish = parish && canAdminParish(access, parish.id) ? parish.id : parishes[0]?.id;

  const fields = [
    { name: "name", label: "Full name", type: "text" as const, required: true },
    { name: "phone", label: "Phone", type: "tel" as const, placeholder: "0803 123 4567" },
    { name: "email", label: "Email", type: "email" as const },
    { name: "password", label: "Starting password", type: "password" as const, required: true, hint: "At least 8 characters. Ask them to change it." },
    ...(parishes.length > 0
      ? [
          {
            name: "parishId",
            label: "Parish",
            type: "select" as const,
            required: !access.isSystemAdmin,
            defaultValue: defaultParish,
            options: parishes.map((p) => ({ value: p.id, label: p.name })),
          },
          {
            name: "role",
            label: "Role in the parish",
            type: "select" as const,
            required: !access.isSystemAdmin,
            placeholder: access.isSystemAdmin ? "Add roles later" : "Choose a role",
            options: PARISH_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
          },
          {
            name: "departmentId",
            label: "Department (for HODs)",
            type: "select" as const,
            options: opts.departments.filter((d) => !defaultParish || d.parishId === defaultParish).map((d) => ({ value: d.id, label: d.name })),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="People & roles"
        back="/admin"
        actions={<FormDialog title="Add a person" description="They can sign in with their phone or email and this password." trigger={<><Plus className="size-4" aria-hidden /> Add person</>} action={saveUser} fields={fields} columns={2} />}
      />
      <form className="relative mb-4 max-w-md" action="/admin/users">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input name="q" defaultValue={q} placeholder="Search by name, phone or email" aria-label="Search people" className="h-11 pl-9" />
      </form>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {users.map((u) => (
          <li key={u.id}>
            <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {u.name} {!u.isActive && <StatusPill tone="neutral">Disabled</StatusPill>}
                </p>
                <p className="truncate text-sm text-subtle">
                  {[u.phone ? formatPhone(u.phone) : null, u.email].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {u.roles.length === 0 ? (
                    <span className="text-xs text-subtle">No active role</span>
                  ) : (
                    u.roles.map((r) => (
                      <span key={r} className="rounded-full bg-brand-tint px-2 py-0.5 text-xs font-medium text-brand">
                        {ROLE_LABELS[r]}
                      </span>
                    ))
                  )}
                </p>
              </div>
              <ChevronRight className="size-5 text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
        {users.length === 0 && <li className="p-4 text-sm text-subtle">No one matches.</li>}
      </ul>
    </>
  );
}
