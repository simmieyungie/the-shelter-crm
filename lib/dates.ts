// Dates are stored as ISO "YYYY-MM-DD" strings (date columns) or timestamptz.
// Everything is displayed in Africa/Lagos (UTC+1, no daylight saving).

export const TZ = "Africa/Lagos";

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const shortDayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const isoInLagos = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "Sun 18 Oct 2026" (en-GB adds a comma after the weekday in some runtimes; strip it). */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  return dayFormatter.format(toUtcDate(iso)).replace(",", "");
}

export function formatShortDay(iso: string): string {
  return shortDayFormatter.format(toUtcDate(iso));
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return dateTimeFormatter.format(typeof d === "string" ? new Date(d) : d).replace(",", "");
}

/** "08:00:00" -> "8:00 am" style is avoided; we show 24h "08:00". */
export function formatTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

/** Today's date in Lagos as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return isoInLagos.format(now);
}

export function addDays(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtcDate(a).getTime() - toUtcDate(b).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(iso: string): number {
  return toUtcDate(iso).getUTCDay();
}

export function startOfWeekSunday(iso: string): string {
  return addDays(iso, -weekday(iso));
}

export function startOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(iso: string, months: number): string {
  const d = toUtcDate(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return toIso(d);
}

export function isFirstFridayOfMonth(iso: string): boolean {
  return weekday(iso) === 5 && Number(iso.slice(8, 10)) <= 7;
}

/** A Date for the given Lagos-local date and time ("HH:MM[:SS]"). */
export function lagosDateTime(iso: string, time = "00:00"): Date {
  const hhmm = time.slice(0, 5).padStart(5, "0");
  return new Date(`${iso}T${hhmm}:00+01:00`);
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
