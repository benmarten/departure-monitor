import { useCallback, useEffect, useRef, useState } from "react";
import { lookupStopCoord } from "./efa";
import { loadPresets, resetPresets, savePresets } from "./storage";
import { LocationGroup } from "./types";

export interface PresetsState {
  presets: LocationGroup[];
  loaded: boolean;
  /** Replace the whole list (persisted). */
  setPresets: (next: LocationGroup[]) => void;
  /** Insert or update a single group (persisted). */
  upsertGroup: (group: LocationGroup) => void;
  removeGroup: (id: string) => void;
  resetToDefaults: () => void;
}

/** Loads presets from device storage and persists every change. */
export function usePresets(): PresetsState {
  const [presets, setPresetsState] = useState<LocationGroup[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    loadPresets().then((p) => {
      if (alive) {
        setPresetsState(p);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Debounce storage writes so a tap only does a state update; the write
  // (which can be janky on web) happens shortly after, off the click path.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleSave = useCallback((next: LocationGroup[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void savePresets(next), 400);
  }, []);

  const persist = useCallback(
    (next: LocationGroup[]) => {
      setPresetsState(next);
      scheduleSave(next);
    },
    [scheduleSave]
  );

  // Backfill missing stop coordinates (legacy data saved before coords existed)
  // so the blended/auto anchor works without a manual reset. Best-effort.
  useEffect(() => {
    if (!loaded) return;
    const ids = new Set<string>();
    for (const g of presets) {
      for (const r of g.routes) {
        if (r.start.lat == null || r.start.lng == null) ids.add(r.start.id);
        if (r.end.lat == null || r.end.lng == null) ids.add(r.end.id);
      }
    }
    if (ids.size === 0) return;

    let cancelled = false;
    (async () => {
      const coords = new Map<string, { lat: number; lng: number }>();
      for (const id of ids) {
        const c = await lookupStopCoord(id).catch(() => null);
        if (c) coords.set(id, c);
      }
      if (cancelled || coords.size === 0) return;
      setPresetsState((prev) => {
        const patch = (s: LocationGroup["routes"][number]["start"]) => {
          const c = (s.lat == null || s.lng == null) && coords.get(s.id);
          return c ? { ...s, lat: c.lat, lng: c.lng } : s;
        };
        const next = prev.map((g) => ({
          ...g,
          routes: g.routes.map((r) => ({ ...r, start: patch(r.start), end: patch(r.end) })),
        }));
        void savePresets(next);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
    // Run once after initial load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const upsertGroup = useCallback(
    (group: LocationGroup) => {
      setPresetsState((prev) => {
        const idx = prev.findIndex((g) => g.id === group.id);
        const next = idx >= 0 ? prev.map((g) => (g.id === group.id ? group : g)) : [...prev, group];
        void savePresets(next);
        return next;
      });
    },
    []
  );

  const removeGroup = useCallback((id: string) => {
    setPresetsState((prev) => {
      const next = prev.filter((g) => g.id !== id);
      void savePresets(next);
      return next;
    });
  }, []);

  const resetToDefaults = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    resetPresets().then(setPresetsState);
  }, []);

  return { presets, loaded, setPresets: persist, upsertGroup, removeGroup, resetToDefaults };
}
