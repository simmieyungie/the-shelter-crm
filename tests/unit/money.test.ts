import { describe, expect, it } from "vitest";
import { formatKobo, koboToInput, parseNairaToKobo, sumKobo } from "@/lib/money";

describe("money", () => {
  it("parses naira strings to integer kobo", () => {
    expect(parseNairaToKobo("145,000")).toBe(14_500_000);
    expect(parseNairaToKobo("145000.50")).toBe(14_500_050);
    expect(parseNairaToKobo("145000.5")).toBe(14_500_050);
    expect(parseNairaToKobo("₦1,240,500")).toBe(124_050_000);
    expect(parseNairaToKobo(" 0 ")).toBe(0);
  });
  it("treats blank as unknown and rejects junk", () => {
    expect(parseNairaToKobo("")).toBeNull();
    expect(parseNairaToKobo(null)).toBeNull();
    expect(parseNairaToKobo("N/A")).toBeNaN();
    expect(parseNairaToKobo("12.345")).toBeNaN();
    expect(parseNairaToKobo("-5")).toBeNaN();
  });
  it("accepts numbers from spreadsheets without float drift", () => {
    expect(parseNairaToKobo(145000.1)).toBe(14_500_010);
    expect(parseNairaToKobo(0.29)).toBe(29);
  });
  it("formats kobo as naira", () => {
    expect(formatKobo(124_050_000)).toBe("₦1,240,500");
    expect(formatKobo(14_500_050)).toBe("₦145,000.50");
    expect(formatKobo(null)).toBe("—");
  });
  it("round-trips input values", () => {
    expect(koboToInput(14_500_050)).toBe("145000.50");
    expect(koboToInput(14_500_000)).toBe("145000");
  });
  it("sums with null meaning unknown only when every part is unknown", () => {
    expect(sumKobo(null, null)).toBeNull();
    expect(sumKobo(100, null, 50)).toBe(150);
  });
});
