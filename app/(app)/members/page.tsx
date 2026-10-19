import { and, asc, eq } from "drizzle-orm";
import { ChevronRight, Plus, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormDialog } from "@/components/app/form-dialog";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/status-pill";
import { Input } from "@/components/ui/input";
import { requireParishContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDay } from "@/lib/dates";
import { db } from "@/lib/db";
import { listMembers } from "@/lib/db/queries/members";
import * as s from "@/lib/db/schema";
import { MEMBER_STATUS_LABELS } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { cn } from "@/lib/utils";
import { saveMember } from "./actions";
import { memberFields, STATUS_TONE } from "./member-fields";

export const metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const { access, parish } = await requireParishContext();
  if (!can(access, "viewMembers", parish.id)) redirect("/");
  const sp = await searchParams;
  const { rows, hasMore, page, total } = await listMembers(access, parish.id, { q: sp.q, status: sp.status, page: Number(sp.page) || 1 });
  const tribes = await db.select({ id: s.smallGroups.id, name: s.smallGroups.name }).from(s.smallGroups).where(and(eq(s.smallGroups.parishId, parish.id), eq(s.smallGroups.isActive, true))).orderBy(asc(s.smallGroups.name));
  const href = (p: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    Object.entries({ q: sp.q, status: sp.status, ...p }).forEach(([k, v]) => v && u.set(k, v));
    return `/members?${u}`;
  };

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={`${total} ${sp.status ? MEMBER_STATUS_LABELS[sp.status as s.MemberStatus]?.toLowerCase() + "s" : "people"} · ${parish.name}`}
        actions={
          can(access, "editMembers", parish.id) ? (
            <FormDialog title="Add a person" trigger={<><Plus className="size-4" aria-hidden /> Add member</>} action={saveMember} fields={memberFields(tribes)} columns={2} />
          ) : undefined
        }
      />
      <form action="/members" className="relative mb-3 max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <Input name="q" defaultValue={sp.q} placeholder="Search by name, phone or email" aria-label="Search members" className="h-11 pl-9" />
      </form>
      <nav aria-label="Filter by status" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {[["", "Everyone"], ...Object.entries(MEMBER_STATUS_LABELS)].map(([v, l]) => (
          <Link key={v} href={href({ status: v || undefined, page: undefined })} aria-current={(sp.status ?? "") === v ? "page" : undefined} className={cn("inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-sm", (sp.status ?? "") === v ? "border-brand bg-brand-tint text-brand" : "border-line bg-surface text-subtle")}>
            {l}
          </Link>
        ))}
      </nav>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map((m) => (
          <li key={m.id}>
            <Link href={`/members/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {m.firstName} {m.lastName}
                  <StatusPill tone={STATUS_TONE[m.status]}>{MEMBER_STATUS_LABELS[m.status]}</StatusPill>
                  {m.sharedPhone > 0 && <StatusPill tone="warning">Shares a phone</StatusPill>}
                </p>
                <p className="truncate text-sm text-subtle">
                  <span className="font-mono">{m.phone ? formatPhone(m.phone) : "No phone"}</span>
                  {m.firstVisitOn ? ` · first came ${formatDay(m.firstVisitOn)}` : ""}
                </p>
              </div>
              <ChevronRight className="size-5 text-subtle" aria-hidden />
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="p-6 text-center text-sm text-subtle">No one matches.</li>}
      </ul>
      <div className="mt-4 flex justify-between">
        {page > 1 ? <Link className="text-sm font-medium text-brand underline" href={href({ page: String(page - 1) })}>Previous</Link> : <span />}
        {hasMore && <Link className="text-sm font-medium text-brand underline" href={href({ page: String(page + 1) })}>Next</Link>}
      </div>
    </>
  );
}
