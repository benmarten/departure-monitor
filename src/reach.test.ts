import { describe, test, expect } from "bun:test";
import { computeReach } from "./reach";
import { RouteDeparture, ReachSettings } from "./types";

function dep(overrides: Partial<RouteDeparture> = {}): RouteDeparture {
  return {
    key: "r:1",
    routeId: "r",
    line: "S2",
    product: "S-Bahn",
    originLabel: "Stop A",
    destinationLabel: "Stop B",
    headsign: "Stop B",
    depWhen: new Date(Date.now() + 20 * 60_000),   // 20 min from now
    depPlanned: null,
    arrWhen: null,
    delayMinutes: null,
    minutesUntil: 20,
    travelMinutes: null,
    transfers: 0,
    cancelled: false,
    ...overrides,
  };
}

const baseSettings: ReachSettings = {
  enabled: true,
  mode: "walk",
  override: null,
  walkKmh: 5,
  bikeKmh: 18,
  bufferMin: 3,
  optimalWaitMin: 5,
  hideUnreachable: false,
  departureDisplay: "countdown",
  waitGreenMaxMin: 10,
  waitYellowMaxMin: 20,
};

describe("computeReach", () => {
  test("returns null when disabled", () => {
    const r = computeReach(dep(), { lat: 49, lng: 8.4 }, { ...baseSettings, enabled: false }, Date.now());
    expect(r).toBeNull();
  });

  test("returns null without GPS position", () => {
    const r = computeReach(dep(), null, baseSettings, Date.now());
    expect(r).toBeNull();
  });

  test("returns null without stop coordinates", () => {
    const r = computeReach(dep(), { lat: 49, lng: 8.4 }, baseSettings, Date.now());
    expect(r).toBeNull();
  });

  test("green when plenty of time", () => {
    // 1000 m straight-line → 1300 m with detour → 0.13 km / 5 km/h = 0.026 h ≈ 1.56 min
    const d = dep({ originLat: 49.0, originLng: 8.4 });
    const pos = { lat: 49.009, lng: 8.4 };   // ~1000 m away
    const r = computeReach(d, pos, baseSettings, Date.now());
    expect(r).not.toBeNull();
    expect(r!.level).toBe("green");
    expect(r!.mode).toBe("walk");
  });

  test("yellow when tight but makeable", () => {
    // Departure in 5 min, walk needs ~4 min → slack = 1 (< bufferMin 3)
    const depTime = Date.now() + 5 * 60_000;
    const d = dep({ depWhen: new Date(depTime), minutesUntil: 5, originLat: 49.0, originLng: 8.4 });
    const pos = { lat: 49.0045, lng: 8.4 }; // ~500 m → ~1.3*0.5/5*60 ≈ 7.8 min... actually let me just force it
    // 500 m * 1.3 = 650 m = 0.65 km; 0.65/5*60 = 7.8 min travel; 5-7.8 = -2.8 → red actually
    // Let me pick a closer point so it's yellow not red
    // 300 m → 390 m → 0.39/5*60 = 4.68 min; 5-4.68 = 0.32 → red (slack < 0)
    // 200 m → 260 m → 0.26/5*60 = 3.12 min; 5-3.12 = 1.88 → yellow (< bufferMin 3)
    const pos2 = { lat: 49.0018, lng: 8.4 };
    const r = computeReach(d, pos2, baseSettings, Date.now());
    expect(r!.level).toBe("yellow");
  });

  test("red when can't make it", () => {
    const depTime = Date.now() + 3 * 60_000;
    const d = dep({ depWhen: new Date(depTime), minutesUntil: 3, originLat: 49.0, originLng: 8.4 });
    const pos = { lat: 49.009, lng: 8.4 }; // ~1000 m → ~1.56 min travel; 3-1.56 = 1.44 → still green actually
    // Need to make travel time exceed minutesUntil
    // 2000 m → 2600 m → 0.26/5*60 = 31.2 min; 3-31.2 → red
    const posBad = { lat: 49.018, lng: 8.4 };
    const r = computeReach(d, posBad, baseSettings, Date.now());
    expect(r!.level).toBe("red");
  });

  test("bike mode when overridden", () => {
    const d = dep({ originLat: 49.0, originLng: 8.4 });
    const pos = { lat: 49.009, lng: 8.4 };
    const settings = { ...baseSettings, override: "bike" as const };
    const r = computeReach(d, pos, settings, Date.now());
    expect(r!.mode).toBe("bike");
  });

  test("route-level mode preferred over default", () => {
    const d = dep({ originLat: 49.0, originLng: 8.4, mode: "bike" as const });
    const pos = { lat: 49.009, lng: 8.4 };
    const r = computeReach(d, pos, baseSettings, Date.now());
    expect(r!.mode).toBe("bike");
  });

  test("global override wins over route mode", () => {
    const d = dep({ originLat: 49.0, originLng: 8.4, mode: "walk" as const });
    const pos = { lat: 49.009, lng: 8.4 };
    const settings = { ...baseSettings, override: "bike" as const };
    const r = computeReach(d, pos, settings, Date.now());
    expect(r!.mode).toBe("bike");
  });

  test("zero speed returns null", () => {
    const d = dep({ originLat: 49.0, originLng: 8.4 });
    const pos = { lat: 49.009, lng: 8.4 };
    const settings = { ...baseSettings, walkKmh: 0 };
    const r = computeReach(d, pos, settings, Date.now());
    expect(r).toBeNull();
  });
});
