import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as Location from "expo-location";
import { matchGroup } from "./location";
import { LocationGroup } from "./types";

export type LocationStatus = "locating" | "auto" | "manual" | "denied" | "error";

export interface ActiveLocationState {
  group: LocationGroup | null;
  status: LocationStatus;
  distanceMeters: number | null;
  inRange: boolean;
  /** Manually pin a group (disables auto until relocate()). */
  selectGroup: (id: string) => void;
  /** Re-run GPS detection. */
  relocate: () => void;
  /** Last known GPS position, for "use current location" in the editor. */
  lastPosition: { lat: number; lng: number } | null;
}

/**
 * Detects location and selects the nearest group from `presets`. Re-matches
 * when presets change (e.g. after editing). Manual selection sticks until the
 * user relocates.
 */
export function useActiveLocation(presets: LocationGroup[]): ActiveLocationState {
  const [group, setGroup] = useState<LocationGroup | null>(null);
  const [status, setStatus] = useState<LocationStatus>("locating");
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [inRange, setInRange] = useState(false);
  const [manualId, setManualId] = useState<string | null>(null);
  const [lastPosition, setLastPosition] = useState<{ lat: number; lng: number } | null>(null);

  const detect = useCallback(async () => {
    setManualId(null);
    setStatus("locating");

    // On web, requestForegroundPermissionsAsync does NOT show a prompt — only
    // getCurrentPositionAsync does — so skip the gate there and let the call
    // below trigger the browser prompt. (Note: browser geolocation is blocked
    // entirely on non-localhost HTTP origins, e.g. http://192.168.x — use
    // http://localhost or the native app.)
    if (Platform.OS !== "web") {
      let perm: string;
      try {
        perm = (await Location.requestForegroundPermissionsAsync()).status;
      } catch {
        setStatus("error");
        return;
      }
      if (perm !== "granted") {
        setStatus("denied");
        return;
      }
    }

    // A cached fix returns instantly. Guard it separately: on web it can throw
    // "not implemented", which must not abort the fresh-fix attempt below.
    let gotFix = false;
    try {
      const known = await Location.getLastKnownPositionAsync();
      if (known) {
        setLastPosition({ lat: known.coords.latitude, lng: known.coords.longitude });
        gotFix = true;
      }
    } catch {
      /* ignore — fall through to a fresh fix */
    }

    // Fresh fix, but never hang forever waiting for one.
    try {
      const fresh = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
      ]);
      if (fresh) {
        setLastPosition({ lat: fresh.coords.latitude, lng: fresh.coords.longitude });
        gotFix = true;
      }
    } catch {
      /* ignore */
    }

    if (!gotFix) setStatus("error");
  }, []);

  useEffect(() => {
    detect();
  }, [detect]);

  // Recompute the active group whenever position, presets, or manual pin change.
  useEffect(() => {
    if (presets.length === 0) {
      setGroup(null);
      return;
    }
    if (manualId) {
      const g = presets.find((p) => p.id === manualId) ?? presets[0];
      setGroup(g);
      setDistanceMeters(null);
      setInRange(false);
      setStatus("manual");
      return;
    }
    if (!lastPosition) {
      // No fix yet: fall back to the first group so the board isn't empty.
      setGroup((prev) => prev ?? presets[0]);
      return;
    }
    const match = matchGroup(presets, lastPosition.lat, lastPosition.lng);
    if (match) {
      setGroup(match.group);
      setDistanceMeters(match.distanceMeters);
      setInRange(match.inRange);
      setStatus("auto");
    }
  }, [presets, lastPosition, manualId]);

  const selectGroup = useCallback((id: string) => setManualId(id), []);

  return { group, status, distanceMeters, inRange, selectGroup, relocate: detect, lastPosition };
}
