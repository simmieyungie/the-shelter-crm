import { describe, expect, it } from "vitest";
import { addDays, diffDays, formatDay, isFirstFridayOfMonth, lagosDateTime, ordinal, todayIso, weekday } from "@/lib/dates";

describe("dates", () => {
  it("formats days like 'Sun 18 Oct 2026'", () => {
    expect(formatDay("2026-10-18")).toBe("Sun 18 Oct 2026");
  });
  it("computes today in Lagos, not UTC", () => {
    // 23:30 UTC on the 18th is 00:30 on the 19th in Lagos.
    expect(todayIso(new Date("2026-10-18T23:30:00Z"))).toBe("2026-10-19");
  });
  it("does date arithmetic on ISO dates", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(diffDays("2026-11-02", "2026-10-30")).toBe(3);
    expect(weekday("2026-10-18")).toBe(0);
  });
  it("knows the first Friday of the month", () => {
    expect(isFirstFridayOfMonth("2026-10-02")).toBe(true);
    expect(isFirstFridayOfMonth("2026-10-09")).toBe(false);
  });
  it("builds Lagos-local instants", () => {
    expect(lagosDateTime("2026-10-18", "08:00").toISOString()).toBe("2026-10-18T07:00:00.000Z");
  });
  it("writes ordinals", () => {
    expect([1, 2, 3, 4, 11, 22].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "22nd"]);
  });
});
