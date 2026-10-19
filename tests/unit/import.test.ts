import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { autoMap, matchHeader, SKIP } from "@/lib/import/fields";
import { extractTable, readWorkbook } from "@/lib/import/parse";
import { parseDateCell, summarise, validateRows, type RowInput, type ServiceTypeCtx, type ValidateContext } from "@/lib/import/validate";

const types: ServiceTypeCtx[] = [
  { id: "t-sun1", name: "Sunday 1st Service", recurrence: "WEEKLY", dayOfWeek: 0, maxPerDay: 1 },
  { id: "t-sun2", name: "Sunday 2nd Service", recurrence: "WEEKLY", dayOfWeek: 0, maxPerDay: 2 },
  { id: "t-acc", name: "Accelerate", recurrence: "WEEKLY", dayOfWeek: 2, maxPerDay: 1 },
  { id: "t-special", name: "Special Programme", recurrence: "SPECIAL", dayOfWeek: null, maxPerDay: 1 },
];

function load(file: string, sheet = 0) {
  const sheets = readWorkbook(readFileSync(`tests/fixtures/imports/${file}`), file);
  return { sheets, table: extractTable(sheets[sheet].rows) };
}

function toRows(table: ReturnType<typeof extractTable>, resolution: Record<number, Record<string, string>> = {}): RowInput[] {
  return table.dataRows.map((r) => ({
    rowNumber: r.rowNumber,
    raw: Object.fromEntries(r.cells.map((c, i) => [String(i), c])),
    resolution: resolution[r.rowNumber] ?? {},
  }));
}

function ctxFor(table: ReturnType<typeof extractTable>, extra: Partial<ValidateContext> = {}): ValidateContext {
  const map = autoMap(table.headers);
  return {
    columnMap: Object.fromEntries(Object.entries(map).map(([i, m]) => [i, m.field])),
    dateFormat: "DD/MM/YYYY",
    serviceTypes: types,
    defaultServiceTypeId: null,
    serviceNameMap: {},
    existingKeys: new Set(),
    today: "2026-10-20",
    ...extra,
  };
}

describe("header matching", () => {
  it("maps spec synonyms", () => {
    expect(matchHeader("Male").field).toBe("men");
    expect(matchHeader("W").field).toBe("women");
    expect(matchHeader("Kids").field).toBe("children");
    expect(matchHeader("New comers").field).toBe("first_timers");
    expect(matchHeader("FT").field).toBe("first_timers");
    expect(matchHeader("Off").field).toBe("offering");
    expect(matchHeader("Tithes").field).toBe("tithe");
    expect(matchHeader("Thanksgiving").field).toBe("special_seed");
    expect(matchHeader("Remarks").field).toBe("notes");
    expect(matchHeader("Service type").field).toBe("service_type");
  });
  it("flags fuzzy matches as low confidence", () => {
    expect(matchHeader("Offering (₦)")).toEqual({ field: "offering", confidence: "high" });
    expect(matchHeader("Sunday offering")).toMatchObject({ field: "offering", confidence: "low" });
    expect(matchHeader("S/N")).toEqual({ field: SKIP, confidence: "none" });
  });
});

describe("parsing the messy register", () => {
  it("skips merged title rows and finds the header row", () => {
    const { sheets, table } = load("messy-register.xlsx");
    expect(sheets.map((s) => s.name)).toEqual(["2026", "Notes"]);
    expect(table.headerRowIndex).toBe(3);
    expect(table.headers.slice(0, 4)).toEqual(["S/N", "DATE", "Service", "Male"]);
    expect(table.dataRows[0].rowNumber).toBe(5);
  });

  it("reads Excel serial dates and text dates", () => {
    expect(parseDateCell(46082, "DD/MM/YYYY")).toBe("2026-03-01");
    expect(parseDateCell("15/03/2026", "DD/MM/YYYY")).toBe("2026-03-15");
    expect(parseDateCell("03/15/2026", "MM/DD/YYYY")).toBe("2026-03-15");
    expect(parseDateCell("2026-03-15", "DD/MM/YYYY")).toBe("2026-03-15");
    expect(parseDateCell("Sun 15th March, 2026", "DD/MM/YYYY")).toBe("2026-03-15");
    expect(parseDateCell("31/02/2026", "DD/MM/YYYY")).toBeNull();
  });

  it("detects every issue type", () => {
    const { table } = load("messy-register.xlsx");
    const results = validateRows(toRows(table), ctxFor(table));
    const byRow = Object.fromEntries(results.map((r) => [r.rowNumber, r]));
    const types = (n: number) => byRow[n].issues.map((i) => i.type);

    expect(byRow[5].outcome).toBe("READY");
    expect(byRow[5].parsed).toMatchObject({ eventDate: "2026-03-01", serviceTypeId: "t-sun1", men: 150, titheKobo: 45_000_000, specialSeedKobo: null });
    expect(types(6)).toContain("NON_NUMERIC"); // "N/A" children
    expect(byRow[6].parsed?.serviceTypeId).toBe("t-sun2"); // case-insensitive service name
    expect(byRow[6].parsed?.offeringKobo).toBe(31_050_050);
    expect(types(7)).toContain("NON_NUMERIC"); // "-" men
    expect(types(8)).toContain("DUPLICATE_IN_FILE"); // same date + service twice
    expect(types(9)).toContain("UNKNOWN_SERVICE");
    expect(types(10)).toContain("DATE_WEEKDAY_MISMATCH");
    expect(byRow[10].issues.find((i) => i.type === "DATE_WEEKDAY_MISMATCH")?.suggestedDate).toBe("2026-03-10");
    expect(types(11)).toContain("TOTAL_MISMATCH");
    expect(byRow[12].outcome).toBe("SKIPPED"); // future date
    expect(types(13)).toEqual(expect.arrayContaining(["BLANK_COUNT", "NON_NUMERIC"]));
    expect(byRow[14].parsed?.occurrence).toBe(1);
    expect(byRow[15].parsed?.occurrence).toBe(2); // two 2nd Services allowed that day
    expect(byRow[16].outcome).toBe("SKIPPED"); // the TOTAL row has no date
  });

  it("stores blank counts as unknown (null), never zero, by default", () => {
    const { table } = load("messy-register.xlsx");
    const r = validateRows(toRows(table), ctxFor(table)).find((x) => x.rowNumber === 13)!;
    expect(r.parsed?.women).toBeNull();
  });

  it("applies resolutions: zero/blank/skip, nearest date, service mapping", () => {
    const { table } = load("messy-register.xlsx");
    const res = validateRows(
      toRows(table, {
        6: { "NON_NUMERIC:children": "zero" },
        7: { "NON_NUMERIC:men": "blank" },
        8: { DUPLICATE_IN_FILE: "skip" },
        9: { UNKNOWN_SERVICE: "map:t-special" },
        10: { DATE_WEEKDAY_MISMATCH: "nearest" },
        11: { TOTAL_MISMATCH: "keep" },
        13: { "NON_NUMERIC:first_timers": "skip" },
      }),
      ctxFor(table),
    );
    const byRow = Object.fromEntries(res.map((r) => [r.rowNumber, r]));
    expect(byRow[6]).toMatchObject({ outcome: "READY", parsed: { children: 0 } });
    expect(byRow[7]).toMatchObject({ outcome: "READY", parsed: { men: null } });
    expect(byRow[8].outcome).toBe("SKIPPED");
    expect(byRow[9]).toMatchObject({ outcome: "READY", parsed: { serviceTypeId: "t-special" } });
    expect(byRow[10]).toMatchObject({ outcome: "READY", parsed: { eventDate: "2026-03-10" } });
    expect(byRow[11].outcome).toBe("READY");
    expect(byRow[13].outcome).toBe("SKIPPED");
    expect(summarise(res)).toEqual({ READY: 8, NEEDS_FIX: 0, DUPLICATE: 0, SKIPPED: 4 });
  });

  it("always skips rows already in the app", () => {
    const { table } = load("messy-register.xlsx");
    const res = validateRows(toRows(table), ctxFor(table, { existingKeys: new Set(["t-sun1|2026-03-01|1"]) }));
    expect(res.find((r) => r.rowNumber === 5)?.outcome).toBe("DUPLICATE");
  });

  it("uses a default service when the sheet has no service column", () => {
    const { table } = load("template-style.csv");
    const ctx = ctxFor(table);
    for (const k of Object.keys(ctx.columnMap)) if (ctx.columnMap[k] === "service_type") ctx.columnMap[k] = SKIP;
    const res = validateRows(toRows(table), { ...ctx, defaultServiceTypeId: "t-sun1" });
    expect(res[1].issues.map((i) => i.type)).toContain("DATE_WEEKDAY_MISMATCH"); // a Tuesday as Sunday service
  });
});

describe("CSV template", () => {
  it("parses text dates as DD/MM/YYYY and quoted amounts", () => {
    const { table } = load("template-style.csv");
    const res = validateRows(toRows(table), ctxFor(table));
    expect(res.map((r) => r.parsed?.eventDate)).toEqual(["2026-04-05", "2026-04-07", "2026-04-12"]);
    expect(res[0].parsed?.offeringKobo).toBe(26_000_000);
    expect(res[0].parsed?.workersOnDuty).toBe(30);
    expect(res.every((r) => r.outcome === "READY")).toBe(true);
  });
});
