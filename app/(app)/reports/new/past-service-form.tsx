"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/forms";
import { createPastService } from "./actions";

type TypeOpt = { id: string; name: string; maxPerDay: number; schedule: string };

export function PastServiceForm({
  types,
  typeId,
  date,
  today,
  existing,
  offSchedule,
}: {
  types: TypeOpt[];
  typeId: string;
  date: string;
  today: string;
  existing: { occurrence: number; label: string; hasReport: boolean }[];
  offSchedule: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionState, FormData>(createPastService, {});
  const [currentType, setCurrentType] = useState(typeId);
  const type = types.find((t) => t.id === currentType);
  const max = type?.maxPerDay ?? 1;
  const nextFree = Array.from({ length: max }, (_, i) => i + 1).find((o) => !existing.some((e) => e.occurrence === o)) ?? 1;
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-line bg-surface p-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="serviceTypeId">Service</Label>
          <select
            id="serviceTypeId"
            name="serviceTypeId"
            value={currentType}
            onChange={(e) => {
              setCurrentType(e.target.value);
              router.replace(`/reports/new?type=${e.target.value}${date ? `&date=${date}` : ""}`);
            }}
            className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"
          >
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.schedule})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="eventDate">Date</Label>
          <Input
            id="eventDate"
            name="eventDate"
            type="date"
            max={today}
            defaultValue={date}
            key={date}
            onChange={(e) => e.target.value && router.replace(`/reports/new?type=${currentType}&date=${e.target.value}`)}
            className="h-11"
            aria-invalid={!!fe.eventDate}
          />
          {fe.eventDate && <p className="text-xs text-danger-text">{fe.eventDate}</p>}
        </div>
        {max > 1 && (
          <div className="space-y-1.5">
            <Label htmlFor="occurrence">Which one that day</Label>
            <select id="occurrence" name="occurrence" defaultValue={String(nextFree)} key={`${currentType}${date}`} className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm">
              {Array.from({ length: max }, (_, i) => i + 1).map((o) => {
                const ex = existing.find((e) => e.occurrence === o);
                return (
                  <option key={o} value={o}>
                    {["1st", "2nd", "3rd"][o - 1] ?? `${o}th`} {ex ? (ex.hasReport ? "· already recorded (opens it)" : "· service exists") : ""}
                  </option>
                );
              })}
            </select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="preacher">Preacher (optional)</Label>
          <Input id="preacher" name="preacher" className="h-11" />
        </div>
      </div>
      {offSchedule && <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-text">That date isn&apos;t a usual day for this service. You can still record it.</p>}
      {existing.some((e) => e.hasReport) && max === 1 && (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-ink">This service already has a record on that date. Continuing opens it instead of making a copy.</p>
      )}
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-sm text-danger-text">
          {state.error}
        </p>
      )}
      <Button type="submit" className="h-12 w-full sm:w-auto" disabled={pending}>
        {pending ? "Opening…" : "Continue to attendance & collections"}
      </Button>
    </form>
  );
}
