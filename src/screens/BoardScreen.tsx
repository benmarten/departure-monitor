import { useMemo } from "react";
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DepartureRow } from "../components/DepartureRow";
import { t } from "../i18n";
import { computeReach } from "../reach";
import { formatClock } from "../theme";
import { DeparturesState } from "../useDepartures";
import { ActiveLocationState, LocationStatus } from "../useActiveLocation";
import { LocationGroup, ReachSettings } from "../types";

/** Shown as the page title (matches the web document title). */
const APP_TITLE = "Abfahrtsmonitor";

function statusLabel(status: LocationStatus): string {
  switch (status) {
    case "locating": return t("locating");
    case "auto": return t("autoByLocation");
    case "manual": return t("manual");
    case "denied": return t("locationOff");
    case "error": return t("locationUnavailable");
  }
}

interface Props {
  presets: LocationGroup[];
  active: ActiveLocationState;
  departures: DeparturesState;
  settings: ReachSettings;
  updateSettings: (patch: Partial<ReachSettings>) => void;
  onOpenRoutes: () => void;
  onOpenSettings: () => void;
}

function nextOverride(value: "walk" | "bike" | null): "walk" | "bike" | null {
  return value === null ? "walk" : value === "walk" ? "bike" : null;
}

function overrideLabel(value: "walk" | "bike" | null): string {
  if (value === "walk") return `🚶 ${t("walk")}`;
  if (value === "bike") return `🚲 ${t("bike")}`;
  return `🌐 ${t("global")}`;
}

export function BoardScreen({ presets, active, departures, settings, updateSettings, onOpenRoutes, onOpenSettings }: Props) {
  const insets = useSafeAreaInsets();
  const { group, status, distanceMeters, inRange } = active;
  const { byRoute, loading, refreshing, loadingMore, error, isDemo, lastUpdated, refresh, loadMore } = departures;

  // Pull-to-refresh only works on touch devices; hide its hint on desktop web.
  const canPull =
    Platform.OS !== "web" ||
    (typeof navigator !== "undefined" && (navigator as any).maxTouchPoints > 0);

  const now = lastUpdated?.getTime() ?? Date.now();

  // Live route-mode lookup so toggling a route's mode recolors instantly
  // without refetching departures from the network.
  const modeByRoute = useMemo(() => {
    const m = new Map<string, "walk" | "bike" | undefined>();
    group?.routes.forEach((r) => m.set(r.id, r.mode));
    return m;
  }, [group]);

  const subtitle = useMemo(() => {
    const parts = [statusLabel(status)];
    if (status === "auto" && distanceMeters != null) {
      parts.push(inRange ? `${Math.round(distanceMeters)} m ${t("away")}` : `${t("nearest")} · ${(distanceMeters / 1000).toFixed(1)} km`);
    }
    return parts.join(" · ");
  }, [status, distanceMeters, inRange]);

  // Unified, time-sorted list across all routes, evaluated at the last fetch time.
  // Pull-to-refresh or browser refresh updates the countdown/reach calculations.
  // Also hides unreachable (red) departures when the setting is on.
  const merged = useMemo(
    () =>
      byRoute
        .flatMap((g) => g.departures)
        .filter((d) => d.depWhen.getTime() > now - 30_000)
        .filter((d) => {
          if (!settings.hideUnreachable || !settings.enabled) return true;
          const r = computeReach(d, active.lastPosition, settings, now, modeByRoute.get(d.routeId));
          return r === null || r.level !== "red";
        })
        .sort((a, b) => a.depWhen.getTime() - b.depWhen.getTime()),
    [byRoute, now, settings.enabled, settings.hideUnreachable, active.lastPosition, modeByRoute]
  );

  return (
    <View className="flex-1 bg-neutral-100 dark:bg-neutral-950">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#9CA3AF" />}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between mb-1">
          <Text className="text-neutral-900 dark:text-white text-3xl font-extrabold" numberOfLines={1}>
            {t("appTitle")}
          </Text>
          <View className="flex-row gap-2">
            {/* Only show "use my location" when re-locating would change something
                (manual pick, denied, error, or still locating). Hidden once
                auto-location is active, since it'd just re-pick the same tab. */}
            {status !== "auto" && (
              <Pressable
                onPress={active.relocate}
                hitSlop={8}
                className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-800 items-center justify-center"
              >
                <Text className="text-neutral-600 dark:text-neutral-300 text-lg">{status === "locating" ? "…" : "◎"}</Text>
              </Pressable>
            )}
            <Pressable onPress={onOpenRoutes} hitSlop={8} className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-800 items-center justify-center">
              <Text className="text-neutral-600 dark:text-neutral-300 text-lg">🚆</Text>
            </Pressable>
            <Pressable onPress={onOpenSettings} hitSlop={8} className="w-10 h-10 rounded-full bg-neutral-200 dark:bg-neutral-800 items-center justify-center">
              <Text className="text-neutral-600 dark:text-neutral-300 text-lg">⚙︎</Text>
            </Pressable>
          </View>
        </View>
        <Text className="text-neutral-500 dark:text-neutral-400 text-xs mb-3">{subtitle}</Text>

        {/* Group chips (the highlighted one is the active location) */}
        <View className="flex-row flex-wrap gap-2 mb-4">
          {presets.map((p) => {
            const activeChip = p.id === group?.id;
            return (
              <Pressable
                key={p.id}
                onPress={() => active.selectGroup(p.id)}
                className={`px-3.5 py-1.5 rounded-full ${activeChip ? "bg-blue-600" : "bg-neutral-200 dark:bg-neutral-800"}`}
              >
                <Text className={`text-sm font-semibold ${activeChip ? "text-white" : "text-neutral-600 dark:text-neutral-300"}`}>
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {settings.enabled && (
          <View className="flex-row items-center gap-1.5 mb-4 flex-wrap">
            <Pressable
              onPress={() => updateSettings({ override: nextOverride(settings.override) })}
              className="px-2.5 py-1 rounded-full bg-blue-600"
            >
              <Text className="text-xs font-semibold text-white">{overrideLabel(settings.override)}</Text>
            </Pressable>

            <Pressable
              onPress={() => updateSettings({ hideUnreachable: !settings.hideUnreachable })}
              className={`px-2.5 py-1 rounded-full ${settings.hideUnreachable ? "bg-blue-600" : "bg-neutral-200 dark:bg-neutral-800"}`}
            >
              <Text className={`text-xs font-semibold ${settings.hideUnreachable ? "text-white" : "text-neutral-600 dark:text-neutral-300"}`}>
                {settings.hideUnreachable ? `🙈 ${t("hidden")}` : `👁️ ${t("all")}`}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => updateSettings({ departureDisplay: settings.departureDisplay === "countdown" ? "leaveBy" : "countdown" })}
              className="px-2.5 py-1 rounded-full bg-neutral-200 dark:bg-neutral-800"
            >
              <Text className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                {settings.departureDisplay === "countdown" ? `⏱ ${t("depart")}` : `🚶 ${t("leaveBy")}`}
              </Text>
            </Pressable>
          </View>
        )}

        {isDemo && (
          <View className="rounded-xl bg-amber-100 dark:bg-amber-900/40 p-2.5 mb-3">
            <Text className="text-amber-800 dark:text-amber-300 text-xs">
              {t("demo")}
            </Text>
          </View>
        )}

        {loading ? (
          <View className="items-center py-16 gap-2">
            <ActivityIndicator />
            <Text className="text-neutral-500 dark:text-neutral-400">{t("loadingDepartures")}</Text>
          </View>
        ) : !group || group.routes.length === 0 ? (
          <View className="items-center py-16 gap-2">
            <Text className="text-neutral-500 dark:text-neutral-400">{t("noRoutes")}</Text>
            <Pressable onPress={onOpenSettings} className="px-4 py-2 rounded-full bg-blue-600">
              <Text className="text-white font-semibold">{t("addRoute")}</Text>
            </Pressable>
          </View>
        ) : merged.length === 0 ? (
          <View className="items-center py-16">
            <Text className="text-neutral-500 dark:text-neutral-400">{t("noUpcoming")}</Text>
          </View>
        ) : (
          <>
            <View className="gap-2">
              {merged.map((d) => (
                <DepartureRow
                  key={d.key}
                  dep={d}
                  now={now}
                  pos={active.lastPosition}
                  settings={settings}
                  routeMode={modeByRoute.get(d.routeId)}
                />
              ))}
            </View>

            {!loading && !isDemo && (
              <Pressable
                onPress={loadMore}
                disabled={loadingMore}
                className="mt-4 py-3 rounded-xl bg-neutral-200 dark:bg-neutral-800 items-center"
              >
                <Text className="text-neutral-700 dark:text-neutral-300 font-semibold">
                  {loadingMore ? t("loadingDepartures") : t("loadLater")}
                </Text>
              </Pressable>
            )}
          </>
        )}

        <View className="items-center py-5 mt-2">
          <Text className="text-neutral-400 dark:text-neutral-600 text-xs">
            {error
              ? error
              : lastUpdated
              ? `${t("updated")} ${formatClock(lastUpdated)}${canPull ? ` · ${t("pullToRefresh")}` : ""}`
              : canPull
              ? t("pullToRefresh")
              : ""}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
