import { describe, expect, test } from "bun:test";
import { parseMinutesOverride } from "./routeEditor";

describe("parseMinutesOverride", () => {
  test("accepts blank or finite non-negative durations", () => {
    expect(parseMinutesOverride("")).toBeUndefined();
    expect(parseMinutesOverride("0")).toBe(0);
    expect(parseMinutesOverride("12.5")).toBe(12.5);
  });

  test("rejects values that would create invalid itinerary dates", () => {
    expect(parseMinutesOverride(".")).toBeUndefined();
    expect(parseMinutesOverride("1.2.3")).toBeUndefined();
    expect(parseMinutesOverride("Infinity")).toBeUndefined();
    expect(parseMinutesOverride("-1")).toBeUndefined();
  });
});
