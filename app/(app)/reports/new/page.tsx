import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { requireParishContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { formatDay, ordinal, todayIso, WEEKDAY_NAMES } from "@/lib/dates";
import { db } from "@/lib/db";
import { datesNeedingRecords } from "@/lib/db/queries/reports-list";
import * as s from "@/lib/db/schema";
import { isScheduledOn } from "@/lib/schedule";
import { cn } from "@/lib/utils";
import { PastServiceForm } from "./past-service-form";

export const metadata = { title: "Add past service" };

export default async function NewPastServicePage({ searchParams }: { searchParams: Promise<{ type?: string; date?: string }> }) {
  const { access, parish } = await requireParishContext();
  if (!can(access, "addPastService", parish.id)) redirect("/reports");
  const sp = await searchParams;
  const types = await db
    .select()
    .from(s.serviceTypes)
    .where(and(eq(s.serviceTypes.parishId, parish.id), eq(s.serviceTypes.isActive, true)))
    .orderBy(s.serviceTypes.name);
  const type = types.find((t) => t.id === sp.type) ?? types[0];
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : "";
  const suggestions = type ? await datesNeedingRecords(parish.id, type.id) : [];
  const existing =
    type && date
      ? await db
          .select({ occurrence: s.serviceEvents.occurrence, reportId: s.serviceReports.id })
          .from(s.serviceEvents)
          .leftJoin(s.serviceReports, eq(s.serviceReports.serviceEventId, s.serviceEvents.id))
          .where(and(eq(s.serviceEvents.serviceTypeId, type.id), eq(s.serviceEvents.eventDate, date)))
      : [];
  const offSchedule = !!(type && date && type.recurrence !== "SPECIAL" && !isScheduledOn(type, date));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add past service" subtitle="Type in a service from your records. The pastor verifies it like any other report." back="/reports" />
      <div className="space-y-5">
        {type && suggestions.length > 0 && (
          <section className="rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold">{type.name}: dates with no approved report</h2>
            <p className="mb-3 text-xs text-subtle">Last 12 weeks. You can also pick any other past date below.</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.slice(0, 16).map((d) => (
                <Link
                  key={d}
                  href={`/reports/new?type=${type.id}&date=${d}`}
                  aria-current={d === date ? "true" : undefined}
                  className={cn("inline-flex h-9 items-center rounded-full border px-3 text-sm", d === date ? "border-brand bg-brand-tint text-brand" : "border-line bg-surface text-ink hover:border-brand/40")}
                >
                  {formatDay(d)}
                </Link>
              ))}
            </div>
          </section>
        )}
        <PastServiceForm
          types={types.map((t) => ({ id: t.id, name: t.name, maxPerDay: t.maxPerDay, schedule: t.recurrence === "WEEKLY" && t.dayOfWeek !== null ? `${WEEKDAY_NAMES[t.dayOfWeek]}s` : t.recurrence === "MONTHLY_FIRST_FRIDAY" ? "First Friday" : "Any day" }))}
          typeId={type?.id ?? ""}
          date={date}
          today={todayIso()}
          existing={existing.map((e) => ({ occurrence: e.occurrence, label: ordinal(e.occurrence), hasReport: !!e.reportId }))}
          offSchedule={offSchedule}
        />
      </div>
    </div>
  );
}
