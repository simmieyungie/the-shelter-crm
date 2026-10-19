import { Building2, ChevronRight, Church, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { requireAppContext } from "@/lib/auth/context";
import { canAdminParish } from "@/lib/auth/permissions";

export const metadata = { title: "Admin" };

export default async function AdminHome() {
  const { access, parish } = await requireAppContext();
  const parishAdmin = !!parish && canAdminParish(access, parish.id);
  if (!access.isSystemAdmin && !parishAdmin && access.overviewParishIds.length === 0) redirect("/");
  const cards = [
    access.isSystemAdmin && { href: "/admin/hierarchy", icon: Building2, title: "Hierarchy", body: "Regions, provinces, zones, areas and parishes." },
    (access.isSystemAdmin || parishAdmin) && { href: "/admin/parish", icon: Church, title: "Parish setup", body: "Sanctuary zones, services, departments, tribes and follow-up lead." },
    (access.isSystemAdmin || parishAdmin) && { href: "/admin/users", icon: Users, title: "People & roles", body: "User accounts and what each person can do." },
    (access.isSystemAdmin || access.overviewParishIds.length > 0) && { href: "/admin/remittance", icon: Wallet, title: "Remittance", body: "Monthly remittance status and the split between levels." },
  ].filter(Boolean) as { href: string; icon: typeof Users; title: string; body: string }[];
  return (
    <>
      <PageHeader title="Admin" subtitle="Set up your church structure and who can do what." />
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 hover:border-brand/40 hover:bg-brand-soft/40">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
              <c.icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{c.title}</span>
              <span className="block text-sm text-subtle">{c.body}</span>
            </span>
            <ChevronRight className="size-5 text-subtle" aria-hidden />
          </Link>
        ))}
      </div>
    </>
  );
}
