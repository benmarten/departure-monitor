import { distanceMeters } from "./location";
import { ReachSettings, RouteDeparture } from "./types";

/** Straight-line routes underestimate real paths; scale up to approximate. */
const DETOUR_FACTOR = 1.3;

export type ReachLevel = "green" | "yellow" | "red";

export interface Reach {
  level: ReachLevel;
  /** Estimated minutes to reach the start stop on foot/bike. */
  travelMin: number;
  /** Spare minutes after arriving (negative = you'd miss it). */
  slackMin: number;
  /** The effective mode actually used (override → route → default). */
  mode: "walk" | "bike";
}

/**
 * Estimate whether the user can reach a departure's start stop in time.
 *   green  — make it with at least `bufferMin` to spare
 *   yellow — make it, but tight
 *   red    — can't make it
 * Returns null when it can't be computed (feature off, no GPS, no stop coords).
 */
export function computeReach(
  dep: RouteDeparture,
  pos: { lat: number; lng: number } | null,
  settings: ReachSettings,
  now: number,
  /** The route's current mode (live), overriding the value baked at fetch time. */
  routeMode?: "walk" | "bike"
): Reach | null {
  if (!settings.enabled || !pos || dep.originLat == null || dep.originLng == null) return null;

  // Effective mode: global override wins, else the route's own mode, else default.
  const mode = settings.override ?? routeMode ?? dep.mode ?? settings.mode;
  const kmh = mode === "bike" ? settings.bikeKmh : settings.walkKmh;
  if (kmh <= 0) return null;

  const meters = distanceMeters(pos.lat, pos.lng, dep.originLat, dep.originLng) * DETOUR_FACTOR;
  const travelMin = meters / 1000 / kmh * 60;
  const minutesUntil = (dep.depWhen.getTime() - now) / 60_000;
  const slackMin = minutesUntil - travelMin;

  const level: ReachLevel = slackMin < 0 ? "red" : slackMin < settings.bufferMin ? "yellow" : "green";
  return { level, travelMin: Math.round(travelMin), slackMin, mode };
}
