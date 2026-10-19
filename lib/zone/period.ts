import { addDays, addMonths, diffDays, startOfMonth, startOfWeekSunday } from "@/lib/dates";

export type PeriodKey = "week" | "month" | "quarter";
export type Period = { key: PeriodKey; start: string; end: string; prevStart: string; prevEnd: string; label: string };

function startOfQuarter(iso: string) {
  const m = Number(iso.slice(5, 7));
  const qm = String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0");
  return `${iso.slice(0, 4)}-${qm}-01`;
}

/**
 * Calendar periods (weeks start on Sunday) running up to today. The previous period is cut to the
 * same number of days, so a half-finished month is compared with the first half of last month.
 */
export function periodFor(key: PeriodKey, today: string): Period {
  const start = key === "week" ? startOfWeekSunday(today) : key === "month" ? startOfMonth(today) : startOfQuarter(today);
  const prevStart = key === "week" ? addDays(start, -7) : key === "month" ? addMonths(start, -1) : addMonths(start, -3);
  const elapsed = diffDays(today, start);
  const prevEnd = addDays(prevStart, elapsed) < start ? addDays(prevStart, elapsed) : addDays(start, -1);
  const label = key === "week" ? "This week" : key === "month" ? "This month" : "This quarter";
  return { key, start, end: today, prevStart, prevEnd, label };
}

/** Months used for the remittance KPI: last full month, or the last three full months for a quarter. */
export function remittanceMonths(key: PeriodKey, today: string): string[] {
  const last = addMonths(startOfMonth(today), -1);
  return key === "quarter" ? [addMonths(last, -2), addMonths(last, -1), last] : [last];
}

/** The 8 Sundays ending with the most recent one on or before today, oldest first. */
export function lastSundays(today: string, n = 8): string[] {
  const latest = startOfWeekSunday(today);
  return Array.from({ length: n }, (_, i) => addDays(latest, -7 * (n - 1 - i)));
}

/** Reports for a Sunday are due by the end of Monday (Lagos time). */
export function reportDeadline(sunday: string): Date {
  return new Date(`${addDays(sunday, 2)}T00:00:00+01:00`);
}
