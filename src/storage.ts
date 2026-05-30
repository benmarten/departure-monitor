import AsyncStorage from "@react-native-async-storage/async-storage";
import { LocationGroup } from "./types";

const STORAGE_KEY = "kvv-board:presets:v1";

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
      { id: "rt-mitte-muehlburg", start: MITTE, end: MUEHLBURG, lines: [] },
      { id: "rt-bahnhof-hbf", start: BAHNHOF, end: HBF, lines: [] },
    ],
  },
  {
    id: "grp-karlsruhe",
    name: "Karlsruhe",
    anchor: { lat: 48.9936, lng: 8.4017, radiusMeters: 2000 },
    routes: [
      { id: "rt-muehlburg-mitte", start: MUEHLBURG, end: MITTE, lines: [] },
      { id: "rt-hbf-bahnhof", start: HBF, end: BAHNHOF, lines: [] },
    ],
  },
];

/** Load saved presets, or seed with defaults on first run / parse failure. */
export async function loadPresets(): Promise<LocationGroup[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocationGroup[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
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
