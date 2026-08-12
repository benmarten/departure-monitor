import { estimateTransferMinutes } from "./reach";
import { EfaStop, ReachSettings, RouteConfig, RouteDeparture, RouteDepartureLeg, RouteLeg } from "./types";

/**
 * Data source: EFA-BW (the Elektronische Fahrplanauskunft instance that powers
 * KVV / bwegt). No API key. Covers trams, Stadtbahn, S-Bahn and regional rail,
 * and provides realtime data, stop autocomplete and origin→destination trips.
 *
 *   STOPFINDER → autocomplete for the config screen
 *   TRIP       → next departures for a configured start→end route (+ arrival)
 */
const EFA_BASE = "https://www.efa-bw.de/nvbw";

/**
 * fetch with a hard timeout, combined with the caller's abort signal. Without
 * this, a hung EFA response freezes the board on a loading spinner forever.
 */
async function fetchJson(url: string, signal?: AbortSignal, timeoutMs = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener("abort", onAbort);
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

export function normalizeLine(label: string): string {
  return label.replace(/\s+/g, "").toUpperCase();
}

/**
 * Build a clean display name from EFA's fields. EFA's `name` is "Locality, Stop"
 * and doubles to "X, X" for a main station (stop == locality). Prefer the
 * stable `disassembledName` (stop) + `parent.name` (locality), collapsing the
 * doubling.
 */
export function cleanStopName(loc: any): string {
  const stop = String(loc?.disassembledName ?? "").trim();
  const locality = String(loc?.parent?.name ?? "").trim();
  if (stop && locality) return stop === locality ? locality : `${locality}, ${stop}`;
  return String(loc?.name ?? "").trim();
}

/** Autocomplete stops by name. Returns the best stop matches. */
export async function searchStops(
  query: string,
  signal?: AbortSignal
): Promise<EfaStop[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url =
    `${EFA_BASE}/XML_STOPFINDER_REQUEST?language=de&outputFormat=rapidJSON` +
    `&coordOutputFormat=WGS84&type_sf=any&name_sf=${encodeURIComponent(q)}`;
  const res = await fetchJson(url, signal);
  if (!res.ok) throw new Error(`Stop search: HTTP ${res.status}`);
  const data = (await res.json()) as { locations?: any[] };
  return (data.locations ?? [])
    .filter((l) => l?.type === "stop" && l?.id && l?.name)
    .sort((a, b) => (b.matchQuality ?? 0) - (a.matchQuality ?? 0))
    .slice(0, 8)
    .map((l) => {
      // EFA WGS84 coords arrive as microdegrees: [lat*1e6, lng*1e6].
      const c = Array.isArray(l.coord) ? l.coord : null;
      const lat = c && c[0] ? c[0] / 1e6 : undefined;
      const lng = c && c[1] ? c[1] / 1e6 : undefined;
      return { id: String(l.id), name: cleanStopName(l), lat, lng };
    });
}

/** Resolve a stop's WGS84 coordinates by its EFA id (for backfilling). */
export async function lookupStopCoord(
  id: string,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number } | null> {
  const url =
    `${EFA_BASE}/XML_STOPFINDER_REQUEST?language=de&outputFormat=rapidJSON` +
    `&coordOutputFormat=WGS84&type_sf=any&name_sf=${encodeURIComponent(id)}`;
  const res = await fetchJson(url, signal, 8_000);
  if (!res.ok) return null;
  const data = (await res.json()) as { locations?: any[] };
  const loc = (data.locations ?? []).find((l) => String(l?.id) === id) ?? (data.locations ?? [])[0];
  const c = loc && Array.isArray(loc.coord) ? loc.coord : null;
  if (!c || !c[0] || !c[1]) return null;
  return { lat: c[0] / 1e6, lng: c[1] / 1e6 };
}

// ---- Trip parsing -----------------------------------------------------------

type EfaRealtimeStatus = string | string[];

interface EfaStopEvent {
  name?: string;
  departureTimePlanned?: string;
  departureTimeEstimated?: string;
  arrivalTimePlanned?: string;
  arrivalTimeEstimated?: string;
  properties?: {
    platformName?: string;
    platform?: string;
    plannedPlatformName?: string;
    [key: string]: any;
  };
  cancelled?: boolean;
  isCancelled?: boolean;
  departureCancelled?: boolean;
  arrivalCancelled?: boolean;
  realtimeStatus?: EfaRealtimeStatus;
}

interface EfaLeg {
  origin?: EfaStopEvent;
  destination?: EfaStopEvent;
  cancelled?: boolean;
  isCancelled?: boolean;
  realtimeStatus?: EfaRealtimeStatus;
  transportation?: {
    number?: string;
    name?: string;
    destination?: { name?: string };
    product?: { class?: number; name?: string };
    cancelled?: boolean;
    isCancelled?: boolean;
    realtimeStatus?: EfaRealtimeStatus;
  };
}

interface EfaJourney {
  legs?: EfaLeg[];
  cancelled?: boolean;
  isCancelled?: boolean;
  realtimeStatus?: EfaRealtimeStatus;
}

/** A leg is "transit" if it rides a vehicle (not a footpath: class 99/100). */
function isTransitLeg(leg: EfaLeg): boolean {
  const t = leg.transportation;
  const cls = t?.product?.class;
  return !!t?.number && cls !== 99 && cls !== 100;
}

function minutesBetween(from: number, to: number): number {
  return Math.round((to - from) / 60_000);
}

function hasCancelledStatus(value?: EfaRealtimeStatus): boolean {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.some((status) => /CANCELLED|CANCELED|AUSFALL/i.test(status));
}

/** EFA variants expose cancellation flags at different nesting levels. */
function isCancelled(journey: EfaJourney, legs: EfaLeg[]): boolean {
  if (journey.cancelled || journey.isCancelled || hasCancelledStatus(journey.realtimeStatus)) return true;
  return legs.some((leg) =>
    leg.cancelled ||
    leg.isCancelled ||
    hasCancelledStatus(leg.realtimeStatus) ||
    leg.transportation?.cancelled ||
    leg.transportation?.isCancelled ||
    hasCancelledStatus(leg.transportation?.realtimeStatus) ||
    leg.origin?.cancelled ||
    leg.origin?.isCancelled ||
    leg.origin?.departureCancelled ||
    hasCancelledStatus(leg.origin?.realtimeStatus) ||
    leg.destination?.cancelled ||
    leg.destination?.isCancelled ||
    leg.destination?.arrivalCancelled ||
    hasCancelledStatus(leg.destination?.realtimeStatus)
  );
}

const BERLIN_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function efaRequestTime(instantMs: number): { date: string; time: string } {
  const parts = Object.fromEntries(
    BERLIN_TIME_FORMAT.formatToParts(new Date(instantMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}${parts.month}${parts.day}`,
    time: `${parts.hour}${parts.minute}`,
  };
}

function berlinOffsetMs(instantMs: number): number {
  const parts = Object.fromEntries(
    BERLIN_TIME_FORMAT.formatToParts(new Date(instantMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instantMs;
}

/** Convert an EFA Europe/Berlin wall-clock value to an absolute instant. */
function berlinDate(y: number, monthIndex: number, d: number, h: number, min: number, sec: number): Date {
  const wallClockUtc = Date.UTC(y, monthIndex, d, h, min, sec);
  let instant = wallClockUtc - berlinOffsetMs(wallClockUtc);
  // Recalculate at the resulting instant because the first pass can cross a
  // daylight-saving transition.
  instant = wallClockUtc - berlinOffsetMs(instant);
  return new Date(instant);
}

/**
 * EFA returns timestamps either as:
 *  - ITCS format: "20260530143600" (YYYYMMDDHHMMSS, local German time)
 *  - Full ISO with Z: "2026-05-30T12:47:48Z" (UTC)
 *  - Bare ISO no tz: "2026-05-30T14:36:00" (local German time)
 *
 * Timezone-less values are Europe/Berlin wall-clock values. Parse them
 * independently of the device timezone so a traveller's device configuration
 * does not shift departures.
 */
export function parseEfaDate(raw: string): Date {
  const s = raw.trim();

  // ITCS format: YYYYMMDDHHMMSS (14 digits) or YYYYMMDDHHMM (12 digits)
  if (/^\d{12,14}$/.test(s)) {
    const y = +s.slice(0, 4);
    const m = +s.slice(4, 6) - 1;
    const d = +s.slice(6, 8);
    const h = +s.slice(8, 10);
    const min = +s.slice(10, 12);
    const sec = s.length >= 14 ? +s.slice(12, 14) : 0;
    return berlinDate(y, m, d, h, min, sec);
  }

  // Full ISO with an explicit timezone — let the JS engine handle it.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s)) return new Date(s);

  // Bare "2026-05-30T14:36:00" — construct a Berlin wall-clock Date explicitly.
  const [datePart, timePart] = s.split("T");
  const [y, mo, d] = datePart.split(/[-/]/).map(Number);
  const [h = 0, mi = 0, se = 0] = (timePart ?? "").split(":").map(Number);
  return berlinDate(y, (mo ?? 1) - 1, d ?? 1, h, mi, se);
}

/**
 * Fetch the next departures for a route (start → end), each guaranteed to head
 * to the configured destination. Applies the optional line filter and returns
 * results sorted by departure time.
 */
type FetchOptions = {
  results: number;
  now: number;
  signal?: AbortSignal;
  settings?: Pick<ReachSettings, "walkKmh" | "bikeKmh">;
};

function routeLegs(route: RouteConfig): RouteLeg[] {
  if (route.legs?.length) return route.legs;
  if (route.start && route.end) {
    return [{ id: `${route.id}:legacy`, type: "transit", from: route.start, to: route.end, lines: route.lines }];
  }
  return [];
}

function finalTransitKey(dep: RouteDeparture): string | null {
  const transit = dep.itineraryLegs.filter((leg) => leg.type === "transit");
  if (transit.length < 2) return null;
  const final = transit[transit.length - 1];
  if (!final.depWhen || !final.arrWhen) return null;
  return [
    final.line ?? "",
    final.fromLabel,
    final.toLabel,
    final.depWhen.toISOString(),
    final.arrWhen.toISOString(),
  ].join("|");
}

function dedupeByFinalTransit(departures: RouteDeparture[]): RouteDeparture[] {
  const byFinalTransit = new Map<string, RouteDeparture>();
  const out: RouteDeparture[] = [];

  for (const dep of departures) {
    const key = finalTransitKey(dep);
    if (!key) {
      out.push(dep);
      continue;
    }

    const existing = byFinalTransit.get(key);
    if (!existing) {
      byFinalTransit.set(key, dep);
      continue;
    }

    const depTime = dep.depWhen.getTime();
    const existingTime = existing.depWhen.getTime();
    const depTravel = dep.travelMinutes ?? Infinity;
    const existingTravel = existing.travelMinutes ?? Infinity;
    if (depTime > existingTime || (depTime === existingTime && depTravel < existingTravel)) {
      byFinalTransit.set(key, dep);
    }
  }

  out.push(...byFinalTransit.values());
  return out;
}

export async function fetchTransitLegDepartures(
  from: EfaStop,
  to: EfaStop,
  lines: string[] | undefined,
  opts: FetchOptions
): Promise<RouteDepartureLeg[]> {
  const requestTime = efaRequestTime(opts.now);
  const url =
    `${EFA_BASE}/XML_TRIP_REQUEST2?language=de&outputFormat=rapidJSON` +
    `&type_origin=stop&name_origin=${encodeURIComponent(from.id)}` +
    `&type_destination=stop&name_destination=${encodeURIComponent(to.id)}` +
    `&useRealtime=1&calcNumberOfTrips=${Math.max(opts.results + 4, 6)}` +
    `&itdDateTimeDepArr=dep&itdDate=${requestTime.date}&itdTime=${requestTime.time}`;

  const res = await fetchJson(url, opts.signal);
  if (!res.ok) throw new Error(`Route ${from.name} → ${to.name}: HTTP ${res.status}`);
  const data = (await res.json()) as { journeys?: EfaJourney[], systemMessages?: { type: string; text: string }[] };

  const wanted = (lines ?? []).map(normalizeLine);
  const out: { departure: RouteDepartureLeg; direct: boolean }[] = [];

  for (const journey of data.journeys ?? []) {
    const transit = (journey.legs ?? []).filter(isTransitLeg);
    if (transit.length === 0) continue;

    const first = transit[0];
    const last = transit[transit.length - 1];
    const line = first.transportation?.number ?? first.transportation?.name ?? "?";
    if (wanted.length > 0 && !wanted.includes(normalizeLine(line))) continue;

    const depPlannedIso = first.origin?.departureTimePlanned;
    const depEstIso = first.origin?.departureTimeEstimated ?? depPlannedIso;
    if (!depEstIso) continue;
    const depWhen = parseEfaDate(depEstIso);
    if (depWhen.getTime() < opts.now - 30_000) continue; // already departed
    const depPlanned = depPlannedIso ? parseEfaDate(depPlannedIso) : null;

    const arrIso = last.destination?.arrivalTimeEstimated ?? last.destination?.arrivalTimePlanned;
    const arrWhen = arrIso ? parseEfaDate(arrIso) : null;

    const delayMinutes =
      depPlanned != null ? minutesBetween(depPlanned.getTime(), depWhen.getTime()) : null;

    // Extract platform information from origin.properties and clean it
    const rawPlatform = first.origin?.properties?.platformName ||
                        first.origin?.properties?.platform ||
                        null;
    // Remove "Gleis " prefix if present (e.g., "Gleis 3" → "3")
    const platform = rawPlatform ? rawPlatform.replace(/^Gleis\s+/i, '').trim() : null;

    out.push({ departure: {
      id: `${from.id}>${to.id}`,
      type: "transit",
      line,
      product: first.transportation?.product?.name ?? "",
      fromLabel: from.name,
      toLabel: to.name,
      headsign: first.transportation?.destination?.name ?? "",
      depWhen,
      platform,
      arrWhen,
      delayMinutes,
      travelMinutes:
        arrWhen != null ? minutesBetween(depWhen.getTime(), arrWhen.getTime()) : null,
      cancelled: isCancelled(journey, transit),
    }, direct: transit.length === 1 });
  }

  out.sort((a, b) => (a.departure.depWhen?.getTime() ?? 0) - (b.departure.depWhen?.getTime() ?? 0));
  const direct = out.filter((item) => item.direct);
  return (direct.length > 0 ? direct : out).map((item) => item.departure);
}

export async function fetchRouteDepartures(route: RouteConfig, opts: FetchOptions): Promise<RouteDeparture[]> {
  const legs = routeLegs(route);
  const transitLegs = legs.filter((leg): leg is Extract<RouteLeg, { type: "transit" }> => leg.type === "transit");
  if (transitLegs.length === 0) return [];

  const firstTransitIndex = legs.findIndex((leg) => leg.type === "transit");
  let earliestFirst = opts.now;
  for (const leg of legs.slice(0, firstTransitIndex)) {
    if (leg.type === "transit") continue;
    const minutes = leg.minutesOverride ?? (opts.settings && estimateTransferMinutes(leg.from, leg.to, leg.type, opts.settings));
    if (minutes == null) return [];
    earliestFirst += minutes * 60_000;
  }
  const firstTransit = transitLegs[0];
  const candidates = (await fetchTransitLegDepartures(firstTransit.from, firstTransit.to, firstTransit.lines, {
    ...opts,
    now: earliestFirst,
  })).map((departure) => ({ ...departure, id: firstTransit.id }));
  const out: RouteDeparture[] = [];
  for (const candidate of candidates) {
    if (!candidate.depWhen || candidate.depWhen.getTime() < earliestFirst) continue;
    const itineraryLegs: RouteDepartureLeg[] = [];
    // Leading manual legs must finish when the first train departs. Starting
    // the cursor at that departure would make them overlap the train itself.
    let cursor = candidate.depWhen.getTime() - (earliestFirst - opts.now);
    let valid = true;
    let firstUsed = false;
    for (const leg of legs) {
      if (leg.type === "transit") {
        const choice = firstUsed
          ? (await fetchTransitLegDepartures(leg.from, leg.to, leg.lines, { ...opts, now: cursor }))[0]
          : candidate;
        firstUsed = true;
        if (!choice || !choice.depWhen || !choice.arrWhen) { valid = false; break; }
        itineraryLegs.push({ ...choice, id: leg.id });
        cursor = choice.arrWhen.getTime();
      } else {
        const minutes = leg.minutesOverride ?? (opts.settings && estimateTransferMinutes(leg.from, leg.to, leg.type, opts.settings));
        if (minutes == null) { valid = false; break; }
        const depWhen = new Date(cursor);
        cursor += minutes * 60_000;
        itineraryLegs.push({ id: leg.id, type: leg.type, fromLabel: leg.from.name, toLabel: leg.to.name,
          depWhen, arrWhen: new Date(cursor), travelMinutes: minutes });
      }
    }
    if (!valid) continue;
    const transit = itineraryLegs.filter((leg) => leg.type === "transit");
    const first = transit[0];
    const last = transit[transit.length - 1];
    const firstLeg = itineraryLegs[0];
    const finalLeg = itineraryLegs[itineraryLegs.length - 1];
    if (!first.depWhen || !firstLeg.depWhen) continue;
    out.push({
      key: `${route.id}:${first.line ?? "?"}:${first.depWhen.toISOString()}`,
      routeId: route.id,
      line: first.line ?? "?",
      product: first.product ?? "",
      originLabel: legs[0].from.name,
      originLat: legs[0].from.lat,
      originLng: legs[0].from.lng,
      mode: route.mode,
      destinationLabel: legs[legs.length - 1].to.name,
      headsign: last.headsign ?? legs[legs.length - 1].to.name,
      depWhen: firstLeg.depWhen,
      depPlanned: first.delayMinutes != null ? new Date(firstLeg.depWhen.getTime() - first.delayMinutes * 60_000) : null,
      platform: first.platform ?? null,
      arrWhen: finalLeg.arrWhen,
      delayMinutes: first.delayMinutes ?? null,
      minutesUntil: minutesBetween(opts.now, firstLeg.depWhen.getTime()),
      travelMinutes: finalLeg.arrWhen ? minutesBetween(firstLeg.depWhen.getTime(), finalLeg.arrWhen.getTime()) : null,
      transfers: Math.max(0, transit.length - 1),
      cancelled: transit.some((leg) => leg.cancelled),
      itineraryLegs,
    });
  }
  return dedupeByFinalTransit(out)
    .sort((a, b) => a.depWhen.getTime() - b.depWhen.getTime())
    .slice(0, opts.results);
}

/** Illustrative data so the board stays useful if EFA is unreachable. */
export function demoRouteDepartures(route: RouteConfig, now: number): RouteDeparture[] {
  const legs = routeLegs(route);
  const first = legs.find((leg) => leg.type === "transit");
  if (!first || first.type !== "transit") return [];
  const last = legs[legs.length - 1];
  const line = first.lines?.[0] ?? "S2";
  return [0, 1, 2].map((n) => {
    const offset = 3 + n * 9;
    const depWhen = new Date(now + offset * 60_000);
    const arrWhen = new Date(depWhen.getTime() + 14 * 60_000);
    const delay = n === 1 ? 2 : 0;
    return {
      key: `demo:${route.id}:${n}`,
      routeId: route.id,
      line,
      product: line.startsWith("S") ? "S-Bahn" : "Straßenbahn",
      originLabel: legs[0].from.name,
      originLat: legs[0].from.lat,
      originLng: legs[0].from.lng,
      mode: route.mode,
      destinationLabel: last.to.name,
      headsign: last.to.name,
      depWhen,
      depPlanned: new Date(depWhen.getTime() - delay * 60_000),
      platform: n === 0 ? "2" : null, // Demo: first departure has platform
      arrWhen,
      delayMinutes: delay,
      minutesUntil: offset,
      travelMinutes: 14,
      transfers: 0,
      cancelled: false,
      itineraryLegs: [{ id: first.id, type: "transit", fromLabel: first.from.name, toLabel: first.to.name,
        line, product: line.startsWith("S") ? "S-Bahn" : "Straßenbahn", headsign: first.to.name,
        depWhen, arrWhen, travelMinutes: 14, platform: n === 0 ? "2" : null, delayMinutes: delay, cancelled: false }],
    };
  });
}
