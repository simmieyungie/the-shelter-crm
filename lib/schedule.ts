// Pure helpers for when services are scheduled. Shared by server and tests.
import { addDays, isFirstFridayOfMonth, weekday } from "@/lib/dates";

export type Schedulable = {
  recurrence: "WEEKLY" | "MONTHLY_FIRST_FRIDAY" | "SPECIAL";
  dayOfWeek: number | null;
};

export function isScheduledOn(type: Schedulable, iso: string): boolean {
  if (type.recurrence === "WEEKLY") return type.dayOfWeek === weekday(iso);
  if (type.recurrence === "MONTHLY_FIRST_FRIDAY") return isFirstFridayOfMonth(iso);
  return false;
}

/** Every scheduled date for the type within [from, to], oldest first. */
export function scheduledDates(type: Schedulable, from: string, to: string): string[] {
  const out: string[] = [];
  if (type.recurrence === "SPECIAL" || from > to) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) if (isScheduledOn(type, d)) out.push(d);
  return out;
}

/** The scheduled date closest to iso (ties go to the earlier date). Searches ±10 days. */
export function nearestScheduledDate(type: Schedulable, iso: string): string | null {
  if (type.recurrence === "SPECIAL") return iso;
  for (let i = 0; i <= 10; i++) {
    if (isScheduledOn(type, addDays(iso, -i))) return addDays(iso, -i);
    if (isScheduledOn(type, addDays(iso, i))) return addDays(iso, i);
  }
  return null;
}
