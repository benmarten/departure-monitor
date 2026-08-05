import { afterEach, describe, test, expect } from "bun:test";
import { cleanStopName, fetchRouteDepartures, normalizeLine, parseEfaDate } from "./efa";
import { RouteConfig } from "./types";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const route: RouteConfig = {
  id: "route",
  legs: [{ id: "leg", type: "transit", from: { id: "start", name: "Start" }, to: { id: "end", name: "End" } }],
};

function mockJourneys(journeys: unknown[]): void {
  globalThis.fetch = (async () => new Response(JSON.stringify({ journeys }), { status: 200 })) as unknown as typeof fetch;
}

function transitJourney(line: string, dep: string, arr: string, cancelled = false) {
  return { cancelled, legs: [{
    origin: { departureTimePlanned: dep }, destination: { arrivalTimePlanned: arr },
    transportation: { number: line, destination: { name: "Headsign" }, product: { class: 1, name: "S-Bahn" } },
  }] };
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
  test("selects a reachable onward train after a manual transfer", async () => {
    const responses = [
      [transitJourney("S2", "2026-05-30T14:00:00", "2026-05-30T14:10:00")],
      [
        transitJourney("RE1", "2026-05-30T14:15:00", "2026-05-30T14:35:00"),
        transitJourney("RE1", "2026-05-30T14:22:00", "2026-05-30T14:42:00", true),
      ],
    ];
    globalThis.fetch = (async () => new Response(JSON.stringify({ journeys: responses.shift() }), { status: 200 })) as unknown as typeof fetch;
    const multistep: RouteConfig = { id: "multi", legs: [
      { id: "one", type: "transit", from: { id: "a", name: "A" }, to: { id: "b", name: "B" }, lines: ["S2"] },
      { id: "bike", type: "bike", from: { id: "b", name: "B" }, to: { id: "c", name: "C" }, minutesOverride: 10 },
      { id: "two", type: "transit", from: { id: "c", name: "C" }, to: { id: "d", name: "D" }, lines: ["RE1"] },
    ] };
    const departures = await fetchRouteDepartures(multistep, { results: 3, now: parseEfaDate("2026-05-30T13:00:00").getTime() });
    expect(departures).toHaveLength(1);
    expect(departures[0].itineraryLegs.map((leg) => leg.type)).toEqual(["transit", "bike", "transit"]);
    expect(departures[0].itineraryLegs[2].depWhen?.toISOString()).toBe("2026-05-30T12:22:00.000Z");
    expect(departures[0].arrWhen?.toISOString()).toBe("2026-05-30T12:42:00.000Z");
    expect(departures[0].travelMinutes).toBe(42);
    expect(departures[0].cancelled).toBe(true);
  });

  test("fetches an onward transit leg from the computed transfer cursor", async () => {
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      requestedUrls.push(url);
      const journeys = requestedUrls.length === 1
        ? [transitJourney("S2", "2026-05-30T14:00:00", "2026-05-30T15:00:00")]
        : [transitJourney("RE1", "2026-05-30T15:45:00", "2026-05-30T16:05:00")];
      return new Response(JSON.stringify({ journeys }), { status: 200 });
    }) as unknown as typeof fetch;
    const multistep: RouteConfig = { id: "long-transfer", legs: [
      { id: "one", type: "transit", from: { id: "a", name: "A" }, to: { id: "b", name: "B" } },
      { id: "bike", type: "bike", from: { id: "b", name: "B" }, to: { id: "c", name: "C" }, minutesOverride: 40 },
      { id: "two", type: "transit", from: { id: "c", name: "C" }, to: { id: "d", name: "D" } },
    ] };

    const departures = await fetchRouteDepartures(multistep, { results: 3, now: parseEfaDate("2026-05-30T13:00:00").getTime() });

    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[1]).toContain("itdDate=20260530");
    expect(requestedUrls[1]).toContain("itdTime=1540");
    expect(departures).toHaveLength(1);
    expect(departures[0].itineraryLegs[2].depWhen?.toISOString()).toBe("2026-05-30T13:45:00.000Z");
  });

  test("places leading and trailing manual legs around transit", async () => {
    mockJourneys([transitJourney("S2", "2026-05-30T14:20:00", "2026-05-30T14:30:00")]);
    const multistep: RouteConfig = { id: "manual-ends", legs: [
      { id: "walk", type: "walk", from: { id: "a", name: "A" }, to: { id: "b", name: "B" }, minutesOverride: 5 },
      { id: "train", type: "transit", from: { id: "b", name: "B" }, to: { id: "c", name: "C" } },
      { id: "bike", type: "bike", from: { id: "c", name: "C" }, to: { id: "d", name: "D" }, minutesOverride: 10 },
    ] };

    const departures = await fetchRouteDepartures(multistep, { results: 3, now: parseEfaDate("2026-05-30T14:00:00").getTime() });

    expect(departures).toHaveLength(1);
    expect(departures[0].itineraryLegs[0].depWhen?.toISOString()).toBe("2026-05-30T12:15:00.000Z");
    expect(departures[0].itineraryLegs[0].arrWhen?.toISOString()).toBe("2026-05-30T12:20:00.000Z");
    expect(departures[0].arrWhen?.toISOString()).toBe("2026-05-30T12:40:00.000Z");
    expect(departures[0].travelMinutes).toBe(20);
  });

  test("prefers direct journeys within a configured transit leg", async () => {
    const indirect = transitJourney("S2", "2026-05-30T14:00:00", "2026-05-30T14:10:00");
    indirect.legs.push(transitJourney("RE1", "2026-05-30T14:12:00", "2026-05-30T14:30:00").legs[0]);
    mockJourneys([
      indirect,
      transitJourney("S2", "2026-05-30T14:05:00", "2026-05-30T14:35:00"),
    ]);

    const departures = await fetchRouteDepartures(route, { results: 3, now: parseEfaDate("2026-05-30T13:00:00").getTime() });

    expect(departures).toHaveLength(1);
    expect(departures[0].depWhen.toISOString()).toBe("2026-05-30T12:05:00.000Z");
  });

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
