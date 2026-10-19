// Pure validation of import rows (spec §7.4 step 3). No database access: callers pass context in.
import type { ImportIssue, ImportParsedRow } from "@/lib/db/schema";
import { parseNairaToKobo } from "@/lib/money";
import { isScheduledOn, nearestScheduledDate, type Schedulable } from "@/lib/schedule";
import { COUNT_FIELDS, MONEY_FIELDS, normaliseHeader, SKIP, type ImportField, type MapTarget } from "./fields";
import { excelSerialToIso, type Cell } from "./parse";

export type DateFormat = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";
export const DATE_FORMATS: DateFormat[] = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];

export type ServiceTypeCtx = Schedulable & { id: string; name: string; maxPerDay: number };

export type ValidateContext = {
  columnMap: Record<string, MapTarget>; // column index -> field
  dateFormat: DateFormat;
  serviceTypes: ServiceTypeCtx[];
  defaultServiceTypeId: string | null;
  /** Normalised spreadsheet service name -> service type id, or "skip". */
  serviceNameMap: Record<string, string>;
  /** `${serviceTypeId}|${date}|${occurrence}` for events that already have a report. */
  existingKeys: Set<string>;
  today: string;
};

export type RowInput = { rowNumber: number; raw: Record<string, Cell>; resolution: Record<string, string> };
export type RowOutcome = "READY" | "NEEDS_FIX" | "DUPLICATE" | "SKIPPED";
export type RowResult = { rowNumber: number; parsed: ImportParsedRow | null; issues: ImportIssue[]; outcome: RowOutcome };

export const issueKey = (i: Pick<ImportIssue, "type" | "field">) => (i.field ? `${i.type}:${i.field}` : i.type);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function validIso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const fullYear = (y: number) => (y < 100 ? 2000 + y : y);

/** Parses a date cell. Excel serials are handled automatically; text follows the chosen format. */
export function parseDateCell(value: Cell, format: DateFormat): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value > 20000 && value < 80000 ? excelSerialToIso(value) : null;
  const s = String(value).trim().replace(/\s+/g, " ");
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return validIso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) {
    const [a, b, y] = [+m[1], +m[2], fullYear(+m[3])];
    if (format === "MM/DD/YYYY") return validIso(y, a, b);
    if (format === "YYYY-MM-DD") return validIso(y, b, a) ?? validIso(y, a, b);
    return validIso(y, b, a);
  }
  // "18 Oct 2026", "Sun 18th October, 2026"
  m = s.match(/^(?:[a-z]{3,9},? )?(\d{1,2})(?:st|nd|rd|th)?[ -]([a-z]{3,9})\.?,?[ -](\d{2,4})$/i);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return mi >= 0 ? validIso(fullYear(+m[3]), mi + 1, +m[1]) : null;
  }
  // "October 18, 2026"
  m = s.match(/^(?:[a-z]{3,9},? )?([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{2,4})$/i);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return mi >= 0 ? validIso(fullYear(+m[3]), mi + 1, +m[2]) : null;
  }
  return null;
}

type Num = { kind: "num"; n: number } | { kind: "blank" } | { kind: "bad"; text: string };

const BLANKISH = /^\s*$/;

export function parseCountCell(value: Cell): Num {
  if (value === null || value === undefined || (typeof value === "string" && BLANKISH.test(value))) return { kind: "blank" };
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? { kind: "num", n: value } : { kind: "bad", text: String(value) };
  const t = String(value).trim().replace(/[,\s]/g, "");
  if (/^\d+$/.test(t)) return { kind: "num", n: Number(t) };
  if (/^\d+\.0+$/.test(t)) return { kind: "num", n: Math.trunc(Number(t)) };
  return { kind: "bad", text: String(value).trim() };
}

export function parseMoneyCell(value: Cell): Num {
  if (value === null || value === undefined || (typeof value === "string" && BLANKISH.test(value))) return { kind: "blank" };
  const k = parseNairaToKobo(typeof value === "number" ? value : String(value));
  if (k === null) return { kind: "blank" };
  return Number.isNaN(k) ? { kind: "bad", text: String(value).trim() } : { kind: "num", n: k };
}

function parseTime(value: Cell): number | null {
  if (typeof value === "number" && value >= 0 && value < 1) return Math.round(value * 1440); // Excel time fraction
  const m = String(value ?? "").trim().match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let h = +m[1];
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return h * 60 + +m[2];
}

const FIELD_LABEL: Record<string, string> = {
  men: "Men",
  women: "Women",
  children: "Children",
  first_timers: "First-timers",
  workers_on_duty: "Workers",
  offering: "Offering",
  tithe: "Tithe",
  special_seed: "Special seed",
};

const PARSED_KEY = {
  men: "men",
  women: "women",
  children: "children",
  first_timers: "firstTimers",
  workers_on_duty: "workersOnDuty",
  offering: "offeringKobo",
  tithe: "titheKobo",
  special_seed: "specialSeedKobo",
} as const;

export function validateRows(rows: RowInput[], ctx: ValidateContext): RowResult[] {
  const colFor = (field: ImportField) => Object.entries(ctx.columnMap).find(([, f]) => f === field)?.[0];
  const cell = (row: RowInput, field: ImportField): Cell | undefined => {
    const c = colFor(field);
    return c === undefined ? undefined : (row.raw[c] ?? null);
  };
  const typesById = new Map(ctx.serviceTypes.map((t) => [t.id, t]));
  const typesByName = new Map(ctx.serviceTypes.map((t) => [normaliseHeader(t.name), t]));
  const hasTime = colFor("time") !== undefined;

  type Work = RowResult & { time: number | null; resolution: Record<string, string> };
  const work: Work[] = rows.map((row) => {
    const issues: ImportIssue[] = [];
    const add = (issue: ImportIssue) => issues.push(issue);
    const res = row.resolution;

    // --- date
    const rawDate = cell(row, "event_date") ?? null;
    let eventDate = parseDateCell(rawDate, ctx.dateFormat);
    if (!eventDate) {
      add({ type: "DATE_INVALID", value: rawDate === null ? "" : String(rawDate), message: rawDate === null || rawDate === "" ? "No date" : `"${rawDate}" isn't a date we can read`, options: ["skip"], defaultResolution: "skip" });
    } else if (eventDate > ctx.today) {
      add({ type: "DATE_FUTURE", value: eventDate, message: "Date is in the future", options: ["skip"], defaultResolution: "skip" });
    }

    // --- service
    let type: ServiceTypeCtx | undefined;
    const serviceCell = cell(row, "service_type");
    const serviceName = serviceCell === undefined || serviceCell === null || String(serviceCell).trim() === "" ? null : String(serviceCell).trim();
    const mapOptions = ["skip", ...ctx.serviceTypes.map((t) => `map:${t.id}`)];
    if (serviceName) {
      const norm = normaliseHeader(serviceName);
      const mapped = ctx.serviceNameMap[norm];
      if (mapped === SKIP) add({ type: "UNKNOWN_SERVICE", value: serviceName, message: `"${serviceName}" is set to skip`, options: mapOptions, defaultResolution: "skip" });
      else type = (mapped ? typesById.get(mapped) : undefined) ?? typesByName.get(norm);
      if (!type && mapped !== SKIP) {
        const chosen = res.UNKNOWN_SERVICE?.startsWith("map:") ? typesById.get(res.UNKNOWN_SERVICE.slice(4)) : undefined;
        add({ type: "UNKNOWN_SERVICE", value: serviceName, message: `Unknown service "${serviceName}"`, options: mapOptions });
        type = chosen;
      }
    } else if (ctx.defaultServiceTypeId) {
      type = typesById.get(ctx.defaultServiceTypeId);
    } else {
      const chosen = res.NO_SERVICE?.startsWith("map:") ? typesById.get(res.NO_SERVICE.slice(4)) : undefined;
      add({ type: "NO_SERVICE", message: "No service named", options: mapOptions });
      type = chosen;
    }

    // --- weekday
    if (type && eventDate && eventDate <= ctx.today && type.recurrence !== "SPECIAL" && !isScheduledOn(type, eventDate)) {
      const suggested = nearestScheduledDate(type, eventDate);
      add({
        type: "DATE_WEEKDAY_MISMATCH",
        value: eventDate,
        suggestedDate: suggested ?? undefined,
        message: `${type.name} isn't usually held on this day`,
        options: suggested && suggested <= ctx.today ? ["nearest", "skip"] : ["skip"],
      });
      if (res.DATE_WEEKDAY_MISMATCH === "nearest" && suggested) eventDate = suggested;
    }

    // --- counts and money
    const parsed: ImportParsedRow = {
      eventDate,
      serviceTypeId: type?.id ?? null,
      serviceName: type?.name ?? serviceName,
      occurrence: 1,
      men: null,
      women: null,
      children: null,
      firstTimers: null,
      workersOnDuty: null,
      offeringKobo: null,
      titheKobo: null,
      specialSeedKobo: null,
      notes: null,
      preacher: null,
    };
    for (const f of [...COUNT_FIELDS, ...MONEY_FIELDS]) {
      const c = cell(row, f);
      if (c === undefined) continue;
      const isMoney = (MONEY_FIELDS as readonly string[]).includes(f);
      const v = isMoney ? parseMoneyCell(c) : parseCountCell(c);
      const key = PARSED_KEY[f];
      if (v.kind === "num") parsed[key] = v.n;
      else if (v.kind === "blank") {
        if (f === "men" || f === "women" || f === "children" || f === "first_timers") {
          add({ type: "BLANK_COUNT", field: f, message: `${FIELD_LABEL[f]} is blank`, options: ["blank", "zero"], defaultResolution: "blank" });
          if (res[`BLANK_COUNT:${f}`] === "zero") parsed[key] = 0;
        }
      } else {
        add({ type: "NON_NUMERIC", field: f, value: v.text, message: `${FIELD_LABEL[f]} is "${v.text}"`, options: ["zero", "blank", "skip"] });
        if (res[`NON_NUMERIC:${f}`] === "zero") parsed[key] = 0;
      }
    }
    const notes = cell(row, "notes");
    const preacher = cell(row, "preacher");
    parsed.notes = notes === undefined || notes === null || String(notes).trim() === "" ? null : String(notes).trim().slice(0, 2000);
    parsed.preacher = preacher === undefined || preacher === null || String(preacher).trim() === "" ? null : String(preacher).trim().slice(0, 200);

    // --- total check
    const totalCell = cell(row, "total");
    if (totalCell !== undefined) {
      const t = parseCountCell(totalCell);
      if (t.kind === "num" && parsed.men !== null && parsed.women !== null && parsed.children !== null) {
        const sum = parsed.men + parsed.women + parsed.children;
        if (sum !== t.n) add({ type: "TOTAL_MISMATCH", value: String(t.n), message: `Total says ${t.n} but men + women + children = ${sum}`, options: ["keep", "skip"] });
      }
    }

    return { rowNumber: row.rowNumber, parsed, issues, outcome: "READY", time: hasTime ? parseTime(cell(row, "time") ?? null) : null, resolution: res };
  });

  // --- occurrences within the file, then duplicates against the database
  const groups = new Map<string, Work[]>();
  for (const w of work) {
    if (isSkipped(w) || !w.parsed?.eventDate || !w.parsed.serviceTypeId) continue;
    const k = `${w.parsed.serviceTypeId}|${w.parsed.eventDate}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(w);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.rowNumber - b.rowNumber);
    const type = typesById.get(list[0].parsed!.serviceTypeId!)!;
    list.forEach((w, idx) => {
      w.parsed!.occurrence = idx + 1;
      if (idx + 1 > type.maxPerDay) {
        w.issues.push({
          type: "DUPLICATE_IN_FILE",
          message: type.maxPerDay === 1 ? `Another row has ${type.name} on the same date` : `More than ${type.maxPerDay} rows for ${type.name} on this date`,
          options: ["skip"],
        });
      }
    });
  }

  for (const w of work) {
    const p = w.parsed!;
    if (p.eventDate && p.serviceTypeId && ctx.existingKeys.has(`${p.serviceTypeId}|${p.eventDate}|${p.occurrence}`)) {
      w.issues.push({ type: "DUPLICATE_EXISTING", message: "Already in the app", options: [] });
      w.outcome = "DUPLICATE";
      continue;
    }
    if (isSkipped(w)) w.outcome = "SKIPPED";
    else if (w.issues.some((i) => !w.resolution[issueKey(i)] && !i.defaultResolution)) w.outcome = "NEEDS_FIX";
    else w.outcome = "READY";
  }

  return work.map(({ rowNumber, parsed, issues, outcome }) => ({ rowNumber, parsed, issues, outcome }));
}

function isSkipped(w: { issues: ImportIssue[]; resolution: Record<string, string> }) {
  return w.issues.some((i) => (w.resolution[issueKey(i)] ?? i.defaultResolution) === "skip");
}

export function summarise(results: Pick<RowResult, "outcome">[]) {
  const c = { READY: 0, NEEDS_FIX: 0, DUPLICATE: 0, SKIPPED: 0 };
  for (const r of results) c[r.outcome] += 1;
  return c;
}
