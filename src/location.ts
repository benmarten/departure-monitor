import { LocationGroup } from "./types";

/** Haversine distance between two lat/lng points, in meters. */
export function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6_371_000; // Earth radius (m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * The group's effective anchor: the centroid of its routes' start stops (where
 * the user actually boards). Falls back to the stored anchor lat/lng if no
 * start stop has coordinates yet.
 */
export function groupCenter(group: LocationGroup): { lat: number; lng: number } {
  const pts: { lat: number; lng: number }[] = [];
  for (const r of group.routes) {
    if (r.start.lat != null && r.start.lng != null) {
      pts.push({ lat: r.start.lat, lng: r.start.lng });
    }
  }
  if (pts.length === 0) return { lat: group.anchor.lat, lng: group.anchor.lng };
  const lat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const lng = pts.reduce((a, p) => a + p.lng, 0) / pts.length;
  return { lat, lng };
}

export interface GroupMatch {
  group: LocationGroup;
  distanceMeters: number;
  /** True if within the group's activation radius. */
  inRange: boolean;
}

/**
 * Pick the location group whose anchor is closest to the given position. Always
 * returns the nearest (so there's something to show), with `inRange` telling
 * whether it's actually within the activation radius.
 */
export function matchGroup(
  groups: LocationGroup[],
  lat: number,
  lng: number
): GroupMatch | null {
  let best: GroupMatch | null = null;
  for (const group of groups) {
    const c = groupCenter(group);
    const d = distanceMeters(lat, lng, c.lat, c.lng);
    if (!best || d < best.distanceMeters) {
      best = { group, distanceMeters: d, inRange: d <= group.anchor.radiusMeters };
    }
  }
  return best;
}
