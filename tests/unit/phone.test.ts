import { describe, expect, it } from "vitest";
import { normalisePhone } from "@/lib/phone";

describe("normalisePhone", () => {
  it("normalises Nigerian numbers to E.164", () => {
    expect(normalisePhone("0803 123 4567")).toBe("+2348031234567");
    expect(normalisePhone("+234 803 123 4567")).toBe("+2348031234567");
    expect(normalisePhone("2348031234567")).toBe("+2348031234567");
    expect(normalisePhone("8031234567")).toBe("+2348031234567");
  });
  it("rejects invalid input", () => {
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("")).toBeNull();
  });
});
