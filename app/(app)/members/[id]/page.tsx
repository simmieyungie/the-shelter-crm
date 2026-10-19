import { notFound } from "next/navigation";
import { EntityForm } from "@/components/app/entity-form";
import { PageHeader } from "@/components/app/page-header";
import { StatusPill } from "@/components/app/status-pill";
import { requireParishContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { diffDays, formatDateTime, formatDay, todayIso } from "@/lib/dates";
import { getMember } from "@/lib/db/queries/members";
import { milestoneEnum } from "@/lib/db/schema";
import { MEMBER_STATUS_LABELS, MILESTONE_LABELS, TASK_STATUS_LABELS } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { saveMember } from "../actions";
import { memberFields, STATUS_TONE } from "../member-fields";
import { MarkPresentForm, MergeButton, MilestoneRow } from "./member-widgets";

export const metadata = { title: "Member" };

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access, parish } = await requireParishContext();
  const data = await getMember(access, id).catch(() => null);
  if (!data || data.member.parishId !== parish.id) notFound();
  const { member: m, milestones, visits, tasks, messages, groups, sameNumber, recentEvents, tribes } = data;
  const canEdit = can(access, "editMembers", parish.id);
  const daysSince = m.firstVisitOn ? diffDays(todayIso(), m.firstVisitOn) : null;
  const visitsIn30 = m.firstVisitOn ? visits.filter((v) => v.date >= m.firstVisitOn! && diffDays(v.date, m.firstVisitOn!) <= 29).length : 0;

  // One timeline of everything that's happened in their follow-up.
  const timeline = [
    ...visits.map((v) => ({ at: `${v.date}T12:00:00+01:00`, label: `Attended ${v.service}`, detail: `Marked by ${v.by}` })),
    ...tasks.map((t) => ({ at: t.dueAt.toISOString(), label: t.title, detail: `${TASK_STATUS_LABELS[t.status]} · ${t.assignee}` })),
    ...messages.map((msg) => ({ at: (msg.sentAt ?? msg.scheduledFor).toISOString(), label: `${msg.channel === "WHATSAPP" ? "WhatsApp" : msg.channel === "SMS" ? "SMS" : "Email"}: ${msg.templateKey.replace(/([A-Z])/g, " $1").toLowerCase()}`, detail: msg.status === "SENT" ? "Sent" : msg.status === "QUEUED" ? `Queued for ${formatDateTime(msg.scheduledFor)}` : "Failed" })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <PageHeader
        back="/members"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {m.firstName} {m.lastName} <StatusPill tone={STATUS_TONE[m.status]}>{MEMBER_STATUS_LABELS[m.status]}</StatusPill>
          </span>
        }
        subtitle={[m.phone ? formatPhone(m.phone) : "No phone", groups.map((g) => g.name).join(", ") || null, m.firstVisitOn ? `first came ${formatDay(m.firstVisitOn)}` : null].filter(Boolean).join(" · ")}
      />

      {m.status === "FIRST_TIMER" && daysSince !== null && (
        <p className="mb-4 rounded-xl bg-brand-soft px-4 py-3 text-sm text-ink">
          {daysSince <= 30
            ? `Day ${daysSince} of 30 · ${visitsIn30} visit${visitsIn30 === 1 ? "" : "s"} so far. Three visits in their first 30 days makes them a regular member.`
            : `Their first 30 days ended with ${visitsIn30} visit${visitsIn30 === 1 ? "" : "s"}. ${visitsIn30 >= 3 ? "The 06:00 follow-up job will make them a regular member." : "The pastor has a follow-up task for them."}`}
          {!m.consentContact && " They haven't agreed to messages, so only the call happens."}
        </p>
      )}

      {sameNumber.length > 0 && canEdit && (
        <section className="mb-4 rounded-xl border border-warning/40 bg-warning-bg p-4 text-sm text-warning-text">
          <p className="font-medium">Same phone number as:</p>
          <ul className="mt-2 space-y-2">
            {sameNumber.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2">
                <a href={`/members/${o.id}`} className="underline">
                  {o.firstName} {o.lastName} ({MEMBER_STATUS_LABELS[o.status]})
                </a>
                <MergeButton keepId={m.id} removeId={o.id} label={`${o.firstName} ${o.lastName}`} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Only merge if it&apos;s the same person. Families often share a phone.</p>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-3 font-semibold">Details</h2>
            {canEdit ? (
              <EntityForm action={saveMember} hidden={{ id: m.id }} fields={memberFields(tribes, m, groups[0]?.id)} columns={2} />
            ) : (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-subtle">Phone</dt><dd className="font-mono">{formatPhone(m.phone)}</dd></div>
                <div><dt className="text-subtle">WhatsApp</dt><dd className="font-mono">{formatPhone(m.whatsappPhone)}</dd></div>
                <div><dt className="text-subtle">Email</dt><dd>{m.email ?? "—"}</dd></div>
                <div><dt className="text-subtle">Address</dt><dd>{m.address ?? "—"}</dd></div>
              </dl>
            )}
          </section>
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-3 font-semibold">Milestones</h2>
            <ul className="divide-y divide-line">
              {milestoneEnum.enumValues.map((ms) => {
                const done = milestones.find((x) => x.milestone === ms);
                return <MilestoneRow key={ms} memberId={m.id} milestone={ms} label={MILESTONE_LABELS[ms]} done={!!done} completedOn={done?.completedOn ?? null} canEdit={canEdit} />;
              })}
            </ul>
          </section>
        </div>
        <aside className="space-y-5">
          {can(access, "recordAttendance", parish.id) && recentEvents.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-4">
              <h2 className="mb-3 font-semibold">Mark present</h2>
              <MarkPresentForm memberId={m.id} events={recentEvents.map((e) => ({ id: e.id, label: `${formatDay(e.date)} · ${e.name}` }))} />
            </section>
          )}
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="mb-3 font-semibold">Follow-up history</h2>
            <ol className="space-y-3 border-l border-line pl-4">
              {timeline.map((t, i) => (
                <li key={i} className="relative text-sm">
                  <span aria-hidden className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-brand" />
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs text-subtle">
                    {formatDateTime(t.at)} · {t.detail}
                  </p>
                </li>
              ))}
              {timeline.length === 0 && <li className="text-sm text-subtle">Nothing yet.</li>}
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
