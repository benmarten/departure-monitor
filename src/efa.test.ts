import { afterEach, describe, test, expect } from "bun:test";
import { cleanStopName, fetchRouteDepartures, normalizeLine, parseEfaDate } from "./efa";
import { RouteConfig } from "./types";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const route: RouteConfig = {
  id: "route",
  start: { id: "start", name: "Start" },
  end: { id: "end", name: "End" },
};

function mockJourneys(journeys: unknown[]): void {
  globalThis.fetch = (async () => new Response(JSON.stringify({ journeys }), { status: 200 })) as unknown as typeof fetch;
}

describe("normalizeLine", () => {
  test("strips spaces and uppercases", () => {
    expect(normalizeLine("S 2")).toBe("S2");
    expect(normalizeLine("  s6 ")).toBe("S6");
    expect(normalizeLine("Linie 3")).toBe("LINIE3");
  });
});

describe("cleanStopName", () => {
  test("returns 'locality, stop' when both differ", () => {
    const loc = { disassembledName: "Mühlburger Tor", parent: { name: "Karlsruhe" } };
    expect(cleanStopName(loc)).toBe("Karlsruhe, Mühlburger Tor");
  });

  test("collapses doubling when stop == locality", () => {
    const loc = { disassembledName: "Karlsruhe Hbf", parent: { name: "Karlsruhe Hbf" } };
    expect(cleanStopName(loc)).toBe("Karlsruhe Hbf");
  });

  test("falls back to name when no disassembledName", () => {
    const loc = { name: "Karlsruhe, Marktplatz" };
    expect(cleanStopName(loc)).toBe("Karlsruhe, Marktplatz");
  });
});

describe("parseEfaDate", () => {
  test("parses timezone-less summer timestamps as Europe/Berlin time", () => {
    expect(parseEfaDate("20260530143600").toISOString()).toBe("2026-05-30T12:36:00.000Z");
    expect(parseEfaDate("2026-05-30T14:36:00").toISOString()).toBe("2026-05-30T12:36:00.000Z");
  });

  test("parses timezone-less winter timestamps as Europe/Berlin time", () => {
    expect(parseEfaDate("20260130143600").toISOString()).toBe("2026-01-30T13:36:00.000Z");
  });

  test("preserves explicit ISO timezone offsets", () => {
    expect(parseEfaDate("2026-05-30T14:36:00+02:00").toISOString()).toBe("2026-05-30T12:36:00.000Z");
  });
});

describe("fetchRouteDepartures", () => {
  test("uses estimated times and calculates the departure delay", async () => {
    mockJourneys([
      {
        legs: [
          {
            origin: {
              departureTimePlanned: "2026-05-30T14:00:00",
              departureTimeEstimated: "2026-05-30T14:07:00",
            },
            destination: {
              arrivalTimePlanned: "2026-05-30T14:20:00",
              arrivalTimeEstimated: "2026-05-30T14:30:00",
            },
            transportation: {
              number: "S2",
              product: { class: 1, name: "S-Bahn" },
            },
          },
        ],
      },
    ]);

    const departures = await fetchRouteDepartures(route, {
      results: 3,
      now: parseEfaDate("2026-05-30T13:00:00").getTime(),
    });

    expect(departures).toHaveLength(1);
    expect(departures[0].depWhen.toISOString()).toBe("2026-05-30T12:07:00.000Z");
    expect(departures[0].arrWhen?.toISOString()).toBe("2026-05-30T12:30:00.000Z");
    expect(departures[0].delayMinutes).toBe(7);
    expect(departures[0].travelMinutes).toBe(23);
  });

  test("maps realtime cancellation status to the departure", async () => {
    mockJourneys([
      {
        realtimeStatus: ["CANCELLED"],
        legs: [
          {
            origin: { departureTimePlanned: "2026-05-30T14:00:00" },
            destination: { arrivalTimePlanned: "2026-05-30T14:20:00" },
            transportation: {
              number: "S2",
              product: { class: 1, name: "S-Bahn" },
            },
          },
        ],
      },
    ]);

    const departures = await fetchRouteDepartures(route, {
      results: 3,
      now: parseEfaDate("2026-05-30T13:00:00").getTime(),
    });

    expect(departures).toHaveLength(1);
    expect(departures[0].cancelled).toBe(true);
  });
});
