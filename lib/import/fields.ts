// Canonical import fields and the header synonyms that map to them (spec §7.4).

export const IMPORT_FIELDS = [
  { key: "event_date", label: "Date", required: true },
  { key: "service_type", label: "Service" },
  { key: "time", label: "Start time" },
  { key: "men", label: "Men" },
  { key: "women", label: "Women" },
  { key: "children", label: "Children" },
  { key: "total", label: "Total (check only)" },
  { key: "first_timers", label: "First-timers" },
  { key: "workers_on_duty", label: "Workers on duty" },
  { key: "offering", label: "Offering (₦)" },
  { key: "tithe", label: "Tithe (₦)" },
  { key: "special_seed", label: "Special seed / thanksgiving (₦)" },
  { key: "preacher", label: "Preacher" },
  { key: "notes", label: "Notes" },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
export const SKIP = "skip";
export type MapTarget = ImportField | typeof SKIP;

export const COUNT_FIELDS = ["men", "women", "children", "first_timers", "workers_on_duty"] as const;
export const MONEY_FIELDS = ["offering", "tithe", "special_seed"] as const;
export type CountField = (typeof COUNT_FIELDS)[number];
export type MoneyField = (typeof MONEY_FIELDS)[number];

/** Normalised header text -> field. Exact matches are high confidence. */
export const SYNONYMS: Record<ImportField, string[]> = {
  event_date: ["date", "service date", "day", "date of service", "sunday date"],
  service_type: ["service", "service type", "service name", "programme", "program", "meeting"],
  time: ["time", "start time", "service time"],
  men: ["male", "males", "men", "m", "adult male", "adult males", "brothers"],
  women: ["female", "females", "women", "w", "f", "adult female", "adult females", "sisters"],
  children: ["kids", "children", "child", "c", "teens and children", "children church"],
  total: ["total", "total attendance", "grand total", "attendance", "sum"],
  first_timers: ["new comers", "newcomers", "first timers", "first timer", "firsttimers", "ft", "visitors", "new members"],
  workers_on_duty: ["workers", "workers on duty", "workers present", "ushers"],
  offering: ["offering", "off", "offerings", "general offering"],
  tithe: ["tithe", "tithes"],
  special_seed: ["seed", "thanksgiving", "special", "special seed", "thanksgiving offering", "special offering"],
  preacher: ["preacher", "minister", "speaker", "minister in charge"],
  notes: ["remarks", "notes", "note", "comment", "comments", "remark"],
};

export function normaliseHeader(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[₦#()\[\]:.'"]/g, " ")
    .replace(/[_\-/&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type AutoMatch = { field: MapTarget; confidence: "high" | "low" | "none" };

/** Maps one header to a field. Exact synonym = high; a synonym word inside the header = low. */
export function matchHeader(header: unknown): AutoMatch {
  const h = normaliseHeader(header);
  if (!h) return { field: SKIP, confidence: "none" };
  for (const [field, words] of Object.entries(SYNONYMS) as [ImportField, string[]][]) {
    if (words.includes(h)) return { field, confidence: "high" };
  }
  const tokens = h.split(" ");
  for (const [field, words] of Object.entries(SYNONYMS) as [ImportField, string[]][]) {
    // Single letters ("m", "w") only count as exact matches.
    if (words.some((w) => w.length > 2 && (tokens.includes(w) || (w.includes(" ") && h.includes(w))))) return { field, confidence: "low" };
  }
  return { field: SKIP, confidence: "none" };
}

/** Maps all headers, never giving the same field to two columns (first one wins, later ones become low/skip). */
export function autoMap(headers: unknown[]): Record<number, AutoMatch> {
  const out: Record<number, AutoMatch> = {};
  const taken = new Set<string>();
  // High-confidence matches claim fields first.
  const matches = headers.map((h, i) => ({ i, m: matchHeader(h) }));
  for (const pass of ["high", "low"] as const) {
    for (const { i, m } of matches) {
      if (m.confidence !== pass) continue;
      if (m.field !== SKIP && !taken.has(m.field)) {
        taken.add(m.field);
        out[i] = m;
      } else out[i] = { field: SKIP, confidence: "none" };
    }
  }
  for (const { i } of matches) out[i] ??= { field: SKIP, confidence: "none" };
  return out;
}

export const TEMPLATE_HEADERS = ["Date", "Service", "Men", "Women", "Children", "Total", "First timers", "Workers on duty", "Offering", "Tithe", "Special seed", "Preacher", "Notes"];
