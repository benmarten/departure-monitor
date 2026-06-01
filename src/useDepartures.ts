import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { demoRouteDepartures, fetchRouteDepartures } from "./efa";
import { LocationGroup, RouteConfig, RouteDeparture } from "./types";

/** How many departures to show per route initially. */
export const SHOW_PER_ROUTE = 3;
/** How many more to load when "Load Later" is pressed. */
export const LOAD_MORE_PER_ROUTE = 3;
/** Refresh live estimates and delays in the background. */
export const AUTO_REFRESH_MS = 60_000;
/** Show illustrative data if EFA is unreachable, instead of an empty board. */
export const USE_DEMO_FALLBACK = true;
/** Do not serve cached realtime values after they are too old to be useful. */
export const CACHE_MAX_AGE_MS = 5 * 60_000;

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

interface CachedRouteGroups {
  savedAt: number;
  groups: RouteGroup[];
}

async function loadCache(groupId: string): Promise<CachedRouteGroups | null> {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(groupId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; groups?: any[] };
    if (
      typeof parsed.savedAt !== "number" ||
      !Array.isArray(parsed.groups) ||
      Date.now() - parsed.savedAt > CACHE_MAX_AGE_MS ||
      parsed.savedAt > Date.now() + 60_000
    ) {
      return null;
    }
    // Revive Date objects
    const groups = parsed.groups.map((g) => ({
      route: g.route,
      departures: g.departures.map((d: any) => ({
        ...d,
        depWhen: new Date(d.depWhen),
        depPlanned: d.depPlanned ? new Date(d.depPlanned) : null,
        arrWhen: d.arrWhen ? new Date(d.arrWhen) : null,
      })),
    }));
    return { savedAt: parsed.savedAt, groups };
  } catch {
    return null;
  }
}

async function saveCache(groupId: string, groups: RouteGroup[], savedAt = Date.now()): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(groupId), JSON.stringify({ savedAt, groups }));
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
  const fallbackRef = useRef<{ groupId: string; savedAt: number; groups: RouteGroup[] } | null>(null);
  const networkLoadedGroupRef = useRef<string | null>(null);
  const maxResultsRef = useRef(SHOW_PER_ROUTE);

  // Keep the latest group accessible without making `load` depend on its
  // object identity (which changes on every edit, e.g. toggling a route's mode).
  const groupRef = useRef(group);
  groupRef.current = group;

  const load = useCallback(async (isFirst: boolean, resultsPerRoute?: number, silent = false) => {
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
      fallbackRef.current = null;
      networkLoadedGroupRef.current = null;
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const numResults = resultsPerRoute ?? maxResultsRef.current;

    if (isFirst) setLoading(true);
    else if (resultsPerRoute != null) setLoadingMore(true);
    else if (!silent) setRefreshing(true);

    const now = Date.now();
    const results = await Promise.allSettled(
      g.routes.map((route) =>
        fetchRouteDepartures(route, { results: numResults, now, signal: controller.signal })
      )
    );
    if (controller.signal.aborted) return;

    const failures = results.filter((r) => r.status === "rejected").length;
    let usedDemo = false;
    const groups: RouteGroup[] = g.routes.map((route, i) => {
      const r = results[i];
      if (r.status === "fulfilled") return { route, departures: r.value };
      const cached = fallbackRef.current?.groupId === g.id
        ? fallbackRef.current.groups.find((group) => group.route.id === route.id)
        : null;
      const cacheIsFresh =
        fallbackRef.current != null &&
        now - fallbackRef.current.savedAt <= CACHE_MAX_AGE_MS;
      if (cacheIsFresh && cached && cached.departures.some((d) => d.depWhen.getTime() > now - 30_000)) {
        return { route, departures: cached.departures };
      }
      usedDemo = USE_DEMO_FALLBACK;
      return { route, departures: USE_DEMO_FALLBACK ? demoRouteDepartures(route, now) : [] };
    });

    const hasLiveResult = failures < results.length || results.length === 0;
    networkLoadedGroupRef.current = hasLiveResult ? g.id : null;
    setByRoute(groups);
    setIsDemo(usedDemo);
    setError(
      failures === 0
        ? null
        : failures === results.length
        ? "Couldn't reach the live timetable."
        : "Some live timetable data couldn't be refreshed."
    );
    if (hasLiveResult) setLastUpdated(new Date());
    setLoading(false);
    setRefreshing(false);
    setLoadingMore(false);

    // Cache successful results (skip demo-filled ones)
    const allSuccess = failures === 0;
    if (allSuccess) {
      const savedAt = Date.now();
      fallbackRef.current = { groupId: g.id, savedAt, groups };
      await saveCache(g.id, groups, savedAt);
    }
  }, []);

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
    fallbackRef.current = null;
    networkLoadedGroupRef.current = null;
    setLoading(true);
    loadCache(g.id).then((cached) => {
      if (
        !cancelled &&
        groupRef.current?.id === g.id &&
        networkLoadedGroupRef.current !== g.id &&
        cached &&
        cached.groups.length > 0
      ) {
        fallbackRef.current = { groupId: g.id, savedAt: cached.savedAt, groups: cached.groups };
        setByRoute(cached.groups);
        setIsDemo(false);
        setLastUpdated(new Date(cached.savedAt));
        setLoading(false);
      }
    });
    load(true);
    const interval = setInterval(() => void load(false, undefined, true), AUTO_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchKey, load]);

  const loadMore = useCallback(() => {
    const newMax = maxResultsRef.current + LOAD_MORE_PER_ROUTE;
    maxResultsRef.current = newMax;
    setMaxResultsPerRoute(newMax);
    load(false, newMax);
  }, [load]);

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
      maxResultsRef.current = SHOW_PER_ROUTE;
      setMaxResultsPerRoute(SHOW_PER_ROUTE);
      load(false, SHOW_PER_ROUTE);
    },
    loadMore,
  };
}
