import { describe, expect, it } from "vitest";
import { backoffMs } from "@/lib/offline/backoff";

describe("backoff", () => {
  it("grows exponentially from 1s and caps at 60s, with jitter", () => {
    expect(backoffMs(1, () => 1)).toBe(1000);
    expect(backoffMs(1, () => 0)).toBe(500);
    expect(backoffMs(3, () => 1)).toBe(4000);
    expect(backoffMs(20, () => 1)).toBe(60_000);
    expect(backoffMs(20, () => 0)).toBe(30_000);
  });
});
