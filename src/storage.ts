import AsyncStorage from "@react-native-async-storage/async-storage";
import { LocationGroup, RouteConfig, RouteLeg } from "./types";

const STORAGE_KEY = "kvv-board:presets:v2";
const LEGACY_STORAGE_KEY = "kvv-board:presets:v1";

/**
 * Default presets, mirroring the example structure:
 *   Friedrichstal → (Mitte → Mühlburger Tor), (Bahnhof → Karlsruhe Hbf)
 *   Karlsruhe     → the return routes
 * EFA stop ids are resolved/verified against the live stopfinder. Anchors are
 * WGS84 (what GPS returns); edit them in the app's config screen.
 */
const MITTE = { id: "de:08215:32743", name: "Friedrichstal (Baden), Mitte", lat: 49.10436, lng: 8.47526 };
const BAHNHOF = { id: "de:08215:33000", name: "Friedrichstal (Baden), Bahnhof", lat: 49.10063, lng: 8.4741 };
const MUEHLBURG = { id: "de:08212:39", name: "Karlsruhe, Mühlburger Tor", lat: 49.0107, lng: 8.38425 };
const HBF = { id: "de:08212:90", name: "Karlsruhe, Hauptbahnhof", lat: 48.99335, lng: 8.40104 };

export const DEFAULT_PRESETS: LocationGroup[] = [
  {
    id: "grp-friedrichstal",
    name: "Friedrichstal",
    anchor: { lat: 49.1072, lng: 8.4764, radiusMeters: 1500 },
    routes: [
      { id: "rt-mitte-muehlburg", legs: [{ id: "leg-mitte-muehlburg", type: "transit", from: MITTE, to: MUEHLBURG, lines: [] }] },
      { id: "rt-bahnhof-hbf", legs: [{ id: "leg-bahnhof-hbf", type: "transit", from: BAHNHOF, to: HBF, lines: [] }] },
    ],
  },
  {
    id: "grp-karlsruhe",
    name: "Karlsruhe",
    anchor: { lat: 48.9936, lng: 8.4017, radiusMeters: 2000 },
    routes: [
      { id: "rt-muehlburg-mitte", legs: [{ id: "leg-muehlburg-mitte", type: "transit", from: MUEHLBURG, to: MITTE, lines: [] }] },
      { id: "rt-hbf-bahnhof", legs: [{ id: "leg-hbf-bahnhof", type: "transit", from: HBF, to: BAHNHOF, lines: [] }] },
    ],
  },
];

/** Load saved presets, or seed with defaults on first run / parse failure. */
export function normalizeRoute(route: any): RouteConfig | null {
  if (!route || typeof route.id !== "string") return null;
  let legs: RouteLeg[] = Array.isArray(route.legs) ? route.legs : [];
  if (legs.length === 0 && route.start && route.end) {
    legs = [{ id: makeId("leg"), type: "transit", from: route.start, to: route.end, lines: route.lines }];
  }
  if (legs.length === 0) return null;
  return { id: route.id, name: route.name, legs, mode: route.mode };
}

function normalizePresets(value: unknown): LocationGroup[] {
  if (!Array.isArray(value)) return [];
  return value.map((group: any) => ({
    ...group,
    routes: Array.isArray(group.routes)
      ? group.routes.map(normalizeRoute).filter((route: RouteConfig | null): route is RouteConfig => route != null)
      : [],
  }));
}

export async function loadPresets(): Promise<LocationGroup[]> {
  try {
    const current = await AsyncStorage.getItem(STORAGE_KEY);
    const raw = current ?? await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const normalized = normalizePresets(JSON.parse(raw));
    if (current == null) await savePresets(normalized);
    return normalized;
  } catch {
    return DEFAULT_PRESETS;
  }
}

/** Persist presets. */
export async function savePresets(presets: LocationGroup[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

/** Reset to the built-in defaults. */
export async function resetPresets(): Promise<LocationGroup[]> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  return [];
}

/**
 * Generate a stable unique id for new groups/routes. Uses time + randomness so
 * ids never collide across app reloads (a counter alone resets to 0 on reload,
 * which previously let two routes share an id — and deleting one removed both).
 */
export function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
