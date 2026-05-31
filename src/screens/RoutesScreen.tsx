import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { confirmAction, infoAlert } from "../confirm";
import { t } from "../i18n";
import { groupCenter } from "../location";
import { makeId } from "../storage";
import { routeName } from "../theme";
import { LocationGroup, RouteConfig } from "../types";
import { RouteEditorModal } from "./RouteEditorModal";

interface Props {
  presets: LocationGroup[];
  setPresets: (next: LocationGroup[]) => void;
  resetToDefaults: () => void;
  lastPosition: { lat: number; lng: number } | null;
  onClose: () => void;
}

export function RoutesScreen({
  presets,
  setPresets,
  resetToDefaults,
  lastPosition,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState<{ groupId: string; route: RouteConfig | null } | null>(null);

  function updateGroup(id: string, patch: Partial<LocationGroup>) {
    setPresets(presets.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }
  function updateAnchor(id: string, patch: Partial<LocationGroup["anchor"]>) {
    setPresets(presets.map((g) => (g.id === id ? { ...g, anchor: { ...g.anchor, ...patch } } : g)));
  }
  function addGroup() {
    setPresets([
      ...presets,
      {
        id: makeId("grp"),
        name: t("newLocation"),
        anchor: { lat: lastPosition?.lat ?? 49.0, lng: lastPosition?.lng ?? 8.4, radiusMeters: 1500 },
        routes: [],
      },
    ]);
  }
  function deleteGroup(id: string) {
    const g = presets.find((x) => x.id === id);
    confirmAction(t("deleteLocationTitle"), t("deleteLocationMessage", { name: g?.name ?? "" }), () =>
      setPresets(presets.filter((x) => x.id !== id))
    );
  }
  function saveRoute(groupId: string, route: RouteConfig) {
    setPresets(
      presets.map((g) => {
        if (g.id !== groupId) return g;
        const idx = g.routes.findIndex((r) => r.id === route.id);
        const routes = idx >= 0 ? g.routes.map((r) => (r.id === route.id ? route : r)) : [...g.routes, route];
        return { ...g, routes };
      })
    );
    setEditing(null);
  }
  function deleteRoute(groupId: string, routeId: string) {
    setPresets(
      presets.map((g) => (g.id === groupId ? { ...g, routes: g.routes.filter((r) => r.id !== routeId) } : g))
    );
  }

  /** Cycle a single route's reach mode: default(global) → walk → bike → default. */
  function cycleRouteMode(groupId: string, route: RouteConfig) {
    const next = route.mode === undefined ? "walk" : route.mode === "walk" ? "bike" : undefined;
    setPresets(
      presets.map((g) =>
        g.id === groupId
          ? { ...g, routes: g.routes.map((r) => (r.id === route.id ? { ...r, mode: next } : r)) }
          : g
      )
    );
  }

  /**
   * Create a new group that is the reverse copy of this one: every A→B route
   * becomes B→A. The new group auto-anchors on the reversed start stops (the
   * original destinations), so it activates when you're at the other end.
   */
  function createReverseGroup(groupId: string) {
    const g = presets.find((x) => x.id === groupId);
    if (!g || g.routes.length === 0) return;
    const reversed: RouteConfig[] = g.routes.map((r) => ({
      id: makeId("rt"),
      start: r.end,
      end: r.start,
      lines: r.lines,
      mode: r.mode,
    }));
    const newGroup: LocationGroup = {
      id: makeId("grp"),
      name: `${g.name} (return)`,
      anchor: { ...g.anchor }, // radius kept; center auto-derived from the reversed starts
      routes: reversed,
    };
    setPresets([...presets, newGroup]);
    infoAlert(t("reverseGroupCreated"), t("reverseGroupCreatedMessage", { name: newGroup.name, n: reversed.length, s: reversed.length > 1 ? "s" : "" }));
  }

  return (
    <View className="flex-1 bg-neutral-100 dark:bg-neutral-950" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Text className="text-blue-600 dark:text-blue-400 text-base">{t("done")}</Text>
        </Pressable>
        <Text className="text-neutral-900 dark:text-white text-base font-bold">{t("routes")}</Text>
        <Pressable
          onPress={() =>
            confirmAction(t("resetTitle"), t("resetMessage"), resetToDefaults, t("reset"))
          }
          hitSlop={8}
        >
          <Text className="text-neutral-500 dark:text-neutral-400 text-sm">{t("reset")}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        {presets.map((g) => (
          <View key={g.id} className="rounded-2xl bg-white dark:bg-neutral-900 p-4 mb-4">
            {/* Group name */}
            <TextInput
              value={g.name}
              onChangeText={(t) => updateGroup(g.id, { name: t })}
              placeholder={t("locationName")}
              placeholderTextColor="#9CA3AF"
              className="text-neutral-900 dark:text-white text-xl font-bold mb-3"
            />

            {/* Anchor is auto-derived from the routes' start stops. */}
            {(() => {
              const n = g.routes.filter((r) => r.start.lat != null && r.start.lng != null).length;
              const c = groupCenter(g);
              return (
                <View className="flex-row items-center justify-between mb-3">
                  <Text className="text-neutral-400 dark:text-neutral-500 text-[11px] flex-1 mr-2" numberOfLines={1}>
                    {n > 0
                      ? `◎ ${t("autoCentered", { n, s: n > 1 ? "s" : "" })} · ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`
                      : `◎ ${t("addRouteEnableLocation")}`}
                  </Text>
                  <View className="flex-row items-center gap-1">
                    <Text className="text-neutral-500 dark:text-neutral-400 text-xs">{t("within")}</Text>
                    <TextInput
                      value={String(g.anchor.radiusMeters)}
                      onChangeText={(t) => updateAnchor(g.id, { radiusMeters: Math.max(100, Number(t.replace(/\D/g, "")) || 0) })}
                      keyboardType="number-pad"
                      className="w-16 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 text-xs"
                    />
                    <Text className="text-neutral-500 dark:text-neutral-400 text-xs">m</Text>
                  </View>
                </View>
              );
            })()}

            {/* Routes */}
            {g.routes.map((r) => (
              <View key={r.id} className="flex-row items-center gap-2 py-2 border-t border-neutral-100 dark:border-neutral-800">
                <Pressable className="flex-1" onPress={() => setEditing({ groupId: g.id, route: r })}>
                  <Text className="text-neutral-900 dark:text-neutral-50 text-sm font-semibold" numberOfLines={3}>
                    {routeName(r.start.name)} → {routeName(r.end.name)}
                  </Text>
                  {r.lines && r.lines.length > 0 ? (
                    <Text className="text-neutral-500 dark:text-neutral-400 text-xs">{r.lines.join(", ")}</Text>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => cycleRouteMode(g.id, r)}
                  hitSlop={6}
                  className="px-2.5 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 min-w-[44px] items-center"
                >
                  <Text className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">
                    {r.mode === "walk" ? "🚶" : r.mode === "bike" ? "🚲" : "🌐"}
                  </Text>
                </Pressable>
                <Pressable onPress={() => deleteRoute(g.id, r.id)} hitSlop={8} className="px-2">
                  <Text className="text-red-500 text-lg">✕</Text>
                </Pressable>
              </View>
            ))}

            <View className="flex-row justify-between items-center mt-3">
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setEditing({ groupId: g.id, route: null })}
                  className="px-3 py-2 rounded-lg bg-blue-600"
                >
                  <Text className="text-white text-xs font-semibold">+ {t("addRoute")}</Text>
                </Pressable>
                {g.routes.length > 0 && (
                  <Pressable
                    onPress={() => createReverseGroup(g.id)}
                    className="px-3 py-2 rounded-lg bg-neutral-100 dark:bg-neutral-800"
                  >
                    <Text className="text-blue-600 dark:text-blue-400 text-xs font-semibold">⇄ {t("reverseCopy")}</Text>
                  </Pressable>
                )}
              </View>
              <Pressable onPress={() => deleteGroup(g.id)} hitSlop={8}>
                <Text className="text-red-500 text-xs">{t("deleteLocation")}</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <Pressable onPress={addGroup} className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-4 items-center">
          <Text className="text-blue-600 dark:text-blue-400 font-semibold">+ {t("addLocation")}</Text>
        </Pressable>
      </ScrollView>

      <RouteEditorModal
        visible={editing !== null}
        initial={editing?.route ?? null}
        onClose={() => setEditing(null)}
        onSave={(route) => editing && saveRoute(editing.groupId, route)}
      />
    </View>
  );
}
