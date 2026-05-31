import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { demoRouteDepartures, fetchRouteDepartures } from "./efa";
import { LocationGroup, RouteConfig, RouteDeparture } from "./types";

/** How many departures to show per route initially. */
export const SHOW_PER_ROUTE = 3;
/** How many more to load when "Load Later" is pressed. */
export const LOAD_MORE_PER_ROUTE = 3;
/** Show illustrative data if EFA is unreachable, instead of an empty board. */
export const USE_DEMO_FALLBACK = true;

export interface RouteGroup {
  route: RouteConfig;
  departures: RouteDeparture[];
}

export interface DeparturesState {
  byRoute: RouteGroup[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  error: string | null;
  isDemo: boolean;
  lastUpdated: Date | null;
  maxResultsPerRoute: number;
  refresh: () => void;
  loadMore: () => void;
}

const CACHE_KEY_PREFIX = "kvv-board:cache:";

function cacheKey(groupId: string): string {
  return `${CACHE_KEY_PREFIX}${groupId}`;
}

async function loadCache(groupId: string): Promise<RouteGroup[] | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(groupId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any[];
    // Revive Date objects
    return parsed.map((g) => ({
      route: g.route,
      departures: g.departures.map((d: any) => ({
        ...d,
        depWhen: new Date(d.depWhen),
        depPlanned: d.depPlanned ? new Date(d.depPlanned) : null,
        arrWhen: d.arrWhen ? new Date(d.arrWhen) : null,
      })),
    }));
  } catch {
    return null;
  }
}

async function saveCache(groupId: string, groups: RouteGroup[]): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(groupId), JSON.stringify(groups));
  } catch {
    // Cache write failure is non-critical
  }
}

/**
 * Fetches the next departures for every route in the active group (one EFA trip
 * request per route, in parallel), and auto-refreshes. Re-fetches when the
 * group changes. Serves cached data immediately on mount; falls back to cache
 * when the network is unavailable.
 */
export function useDepartures(group: LocationGroup | null): DeparturesState {
  const [byRoute, setByRoute] = useState<RouteGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [maxResultsPerRoute, setMaxResultsPerRoute] = useState(SHOW_PER_ROUTE);

  const abortRef = useRef<AbortController | null>(null);

  // Keep the latest group accessible without making `load` depend on its
  // object identity (which changes on every edit, e.g. toggling a route's mode).
  const groupRef = useRef(group);
  groupRef.current = group;

  const load = useCallback(async (isFirst: boolean, resultsPerRoute?: number) => {
    const g = groupRef.current;
    if (!g) {
      abortRef.current?.abort();
      setByRoute([]);
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
      setError(null);
      setIsDemo(false);
      setLastUpdated(null);
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const numResults = resultsPerRoute ?? maxResultsPerRoute;

    if (isFirst) setLoading(true);
    else if (resultsPerRoute != null) setLoadingMore(true);
    else setRefreshing(true);

    const now = Date.now();
    const results = await Promise.allSettled(
      g.routes.map((route) =>
        fetchRouteDepartures(route, { results: numResults, now, signal: controller.signal })
      )
    );
    if (controller.signal.aborted) return;

    const failures = results.filter((r) => r.status === "rejected").length;
    const groups: RouteGroup[] = g.routes.map((route, i) => {
      const r = results[i];
      if (r.status === "fulfilled") return { route, departures: r.value };
      return { route, departures: USE_DEMO_FALLBACK ? demoRouteDepartures(route, now) : [] };
    });

    setByRoute(groups);
    setIsDemo(failures > 0 && USE_DEMO_FALLBACK);
    setError(failures === results.length && results.length > 0 ? "Couldn't reach the live timetable." : null);
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);

    // Cache successful results (skip demo-filled ones)
    const allSuccess = failures === 0;
    if (allSuccess) {
      await saveCache(g.id, groups);
    }
  }, [maxResultsPerRoute]);

  // Only re-fetch when something that affects the timetable query changes
  // (active group, its routes' stops/lines) — NOT on cosmetic edits like a
  // route's reach mode or a group rename.
  const fetchKey = group
    ? group.id +
      "|" +
      group.routes.map((r) => `${r.id}:${r.start.id}>${r.end.id}:${(r.lines ?? []).join(",")}`).join("|")
    : "";

  useEffect(() => {
    const g = groupRef.current;
    if (!g) {
      abortRef.current?.abort();
      setByRoute([]);
      setLoading(false);
      setRefreshing(false);
      setError(null);
      setIsDemo(false);
      setLastUpdated(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    loadCache(g.id).then((cached) => {
      if (!cancelled && groupRef.current?.id === g.id && cached && cached.length > 0) {
        setByRoute(cached);
        setLoading(false);
      }
    });
    load(true);
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [fetchKey, load]);

  const loadMore = useCallback(() => {
    const newMax = maxResultsPerRoute + LOAD_MORE_PER_ROUTE;
    setMaxResultsPerRoute(newMax);
    load(false, newMax);
  }, [maxResultsPerRoute, load]);

  return {
    byRoute,
    loading,
    refreshing,
    loadingMore,
    error,
    isDemo,
    lastUpdated,
    maxResultsPerRoute,
    refresh: () => {
      setMaxResultsPerRoute(SHOW_PER_ROUTE);
      load(false, SHOW_PER_ROUTE);
    },
    loadMore,
  };
}
