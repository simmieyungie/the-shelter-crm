"use client";

import { CalendarPlus, ClipboardList } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import type { FormAction } from "@/components/app/entity-form";
import { Button } from "@/components/ui/button";
import { formatDay, formatTime } from "@/lib/dates";
import type { CountBootstrap } from "@/lib/db/queries/count";
import { cn } from "@/lib/utils";
import { serviceLabel } from "./count-types";

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function ChooseScreen({
  bootstrap: b,
  eventId,
  zoneId,
  onEvent,
  onZone,
  onStart,
  addServiceToday,
  online,
}: {
  bootstrap: CountBootstrap;
  eventId: string | null;
  zoneId: string | null;
  onEvent: (id: string) => void;
  onZone: (id: string) => void;
  onStart: () => void;
  addServiceToday: FormAction;
  online: boolean;
}) {
  const firstName = b.userName.split(" ")[0];
  const service = b.services.find((s) => s.eventId === eventId) ?? null;
  const zone = b.zones.find((z) => z.id === zoneId) ?? null;
  const myRoster = b.roster.filter((r) => r.serviceEventId === eventId && r.userId === b.userId);
  const othersHere = (zid: string) => {
    const names = new Set(b.roster.filter((r) => r.serviceEventId === eventId && r.sanctuaryZoneId === zid && r.userId !== b.userId).map((r) => r.userName));
    b.zoneTotals.filter((z) => z.serviceEventId === eventId && z.sanctuaryZoneId === zid).forEach((z) => z.otherUshers.forEach((n) => names.add(n)));
    return [...names];
  };
  const alsoCounting = zone ? othersHere(zone.id) : [];

  return (
    <div className="mx-auto max-w-[560px] space-y-6">
      <div>
        <p className="text-sm text-subtle">{formatDay(b.date)}</p>
        <h1 className="text-2xl font-semibold">
          {greeting()}, {firstName}
        </h1>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Which service?</legend>
        {b.services.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-4 text-sm text-subtle">No service is scheduled for today.</div>
        ) : (
          <div className="space-y-2" role="radiogroup">
            {b.services.map((s) => {
              const selected = s.eventId === eventId;
              return (
                <button
                  key={s.eventId}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onEvent(s.eventId)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border bg-surface p-4 text-left transition-colors",
                    selected ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40",
                  )}
                >
                  <span aria-hidden className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", selected ? "border-brand" : "border-line")}>
                    {selected && <span className="size-2.5 rounded-full bg-brand" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{serviceLabel(s)}</span>
                    <span className="block text-sm text-subtle">
                      <span className="font-mono">{formatTime(s.startTime)}</span>
                      {s.location ? ` · ${s.location}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </fieldset>

      {service && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Which zone are you counting?</legend>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {b.zones.map((z) => {
              const selected = z.id === zoneId;
              const onRoster = myRoster.some((r) => r.sanctuaryZoneId === z.id);
              return (
                <button
                  key={z.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onZone(z.id)}
                  className={cn(
                    "flex min-h-24 flex-col items-start justify-between rounded-2xl border bg-surface p-3 text-left transition-colors",
                    selected ? "border-brand bg-brand-soft" : "border-line hover:border-brand/40",
                  )}
                >
                  <span className="font-semibold leading-tight text-ink">{z.name}</span>
                  <span className="mt-2 flex w-full flex-wrap items-center justify-between gap-1">
                    <span className="text-xs text-subtle">{z.capacity ? <span className="font-mono">{z.capacity} seats</span> : "No capacity set"}</span>
                    {onRoster && <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand">On your roster</span>}
                  </span>
                </button>
              );
            })}
          </div>
          {zone && alsoCounting.length > 0 && (
            <p className="mt-3 rounded-xl bg-brand-soft px-3 py-2 text-sm text-ink">
              Also counting this zone: {alsoCounting.join(", ")}. Your counts add together.
            </p>
          )}
        </fieldset>
      )}

      <Button className="h-12 w-full text-base" disabled={!service || !zone} onClick={onStart}>
        {zone ? `Start tally · ${zone.name}` : "Choose a zone to start"}
      </Button>

      {b.canManageRoster && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href="/count/roster" className="flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-sm font-medium text-ink">
            <ClipboardList className="size-4" aria-hidden /> Usher roster
          </Link>
          <AddService action={addServiceToday} types={b.specialTypes} online={online} />
        </div>
      )}
    </div>
  );
}

function AddService({ action, types, online }: { action: FormAction; types: { id: string; name: string }[]; online: boolean }) {
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (!state.at) return;
    if (state.ok) toast.success(state.message ?? "Added");
    else if (state.error) toast.error(state.error);
  }, [state]);
  return (
    <details className="rounded-xl border border-line bg-surface">
      <summary className="flex h-11 cursor-pointer list-none items-center justify-center gap-2 text-sm font-medium text-ink">
        <CalendarPlus className="size-4" aria-hidden /> Add a service today
      </summary>
      <form action={formAction} className="space-y-2 border-t border-line p-3">
        <label htmlFor="serviceTypeId" className="text-sm text-subtle">
          Service
        </label>
        <select id="serviceTypeId" name="serviceTypeId" className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Button type="submit" className="h-11 w-full" disabled={pending || !online}>
          {online ? "Add for today" : "Needs a connection"}
        </Button>
      </form>
    </details>
  );
}
