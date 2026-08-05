import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StationSearchField } from "../components/StationSearchField";
import { t } from "../i18n";
import { makeId } from "../storage";
import { EfaStop, RouteConfig, RouteLeg } from "../types";
import { parseMinutesOverride } from "./routeEditor";

interface Props { visible: boolean; initial: RouteConfig | null; onSave: (route: RouteConfig) => void; onClose: () => void; }
type DraftLeg = { id: string; type: "transit" | "walk" | "bike"; from: EfaStop | null; to: EfaStop | null; linesText: string; minutesText: string };

function draft(type: DraftLeg["type"], from: EfaStop | null = null): DraftLeg {
  return { id: makeId("leg"), type, from, to: null, linesText: "", minutesText: "" };
}

export function RouteEditorModal({ visible, initial, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [legs, setLegs] = useState<DraftLeg[]>([]);
  const [mode, setMode] = useState<"walk" | "bike" | undefined>();
  useEffect(() => {
    if (!visible) return;
    const source = initial?.legs?.length ? initial.legs : initial?.start && initial.end
      ? [{ id: makeId("leg"), type: "transit" as const, from: initial.start, to: initial.end, lines: initial.lines }]
      : [];
    setLegs(source.map((leg) => ({ id: leg.id, type: leg.type, from: leg.from, to: leg.to,
      linesText: leg.type === "transit" ? (leg.lines ?? []).join(", ") : "",
      minutesText: leg.type !== "transit" && leg.minutesOverride != null ? String(leg.minutesOverride) : "" })));
    setMode(initial?.mode);
  }, [visible, initial]);

  const patchLeg = (id: string, patch: Partial<DraftLeg>) => setLegs((all) => all.map((leg) => leg.id === id ? { ...leg, ...patch } : leg));
  const add = (type: DraftLeg["type"]) => setLegs((all) => [...all, draft(type, all.at(-1)?.to ?? null)]);
  const move = (index: number, delta: number) => setLegs((all) => {
    const next = [...all]; const target = index + delta;
    if (target < 0 || target >= next.length) return all;
    [next[index], next[target]] = [next[target], next[index]]; return next;
  });
  const connected = legs.every((leg, i) => i === 0 || legs[i - 1].to?.id === leg.from?.id);
  const validOverrides = legs.every((leg) =>
    leg.type === "transit" || leg.minutesText.trim() === "" || parseMinutesOverride(leg.minutesText) != null
  );
  const canSave = legs.some((leg) => leg.type === "transit") && legs.every((leg) => leg.from && leg.to) && connected && validOverrides;
  function save() {
    if (!canSave) return;
    const normalized = legs.map((leg): RouteLeg => leg.type === "transit"
      ? { id: leg.id, type: "transit", from: leg.from!, to: leg.to!, lines: leg.linesText.split(/[,\s]+/).filter(Boolean) }
      : { id: leg.id, type: leg.type, from: leg.from!, to: leg.to!, minutesOverride: parseMinutesOverride(leg.minutesText) });
    onSave({ id: initial?.id ?? makeId("rt"), name: initial?.name, legs: normalized, mode });
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View className="flex-1 bg-neutral-100 dark:bg-neutral-950" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
        <Pressable onPress={onClose} className="w-16"><Text className="text-blue-600 dark:text-blue-400">{t("cancel")}</Text></Pressable>
        <Text className="text-neutral-900 dark:text-white font-bold">{initial ? t("editRoute") : t("newRoute")}</Text>
        <Pressable onPress={save} disabled={!canSave} className="w-16 items-end"><Text className={canSave ? "text-blue-600 font-bold" : "text-neutral-400"}>{t("save")}</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        {legs.map((leg, index) => <View key={leg.id} className="rounded-2xl bg-white dark:bg-neutral-900 mb-4 overflow-hidden">
          <View className="flex-row items-center px-4 py-2 bg-neutral-50 dark:bg-neutral-800">
            <Text className="flex-1 text-neutral-800 dark:text-neutral-100 font-semibold">{index + 1}. {leg.type === "transit" ? `🚆 ${t("transit")}` : leg.type === "bike" ? `🚲 ${t("bike")}` : `🚶 ${t("walk")}`}</Text>
            <Pressable onPress={() => move(index, -1)} className="px-2"><Text className="text-blue-600">↑</Text></Pressable>
            <Pressable onPress={() => move(index, 1)} className="px-2"><Text className="text-blue-600">↓</Text></Pressable>
            <Pressable onPress={() => setLegs((all) => all.filter((x) => x.id !== leg.id))} className="pl-2"><Text className="text-red-500">✕</Text></Pressable>
          </View>
          <StationSearchField label={t("from")} value={leg.from} accentColor="#22C55E" placeholder={t("pickStartStop")} onChange={(from) => patchLeg(leg.id, { from })} />
          <View className="h-px bg-neutral-100 dark:bg-neutral-800 ml-11" />
          <StationSearchField label={t("to")} value={leg.to} accentColor="#3B82F6" placeholder={t("pickDestination")} onChange={(to) => patchLeg(leg.id, { to })} />
          <View className="h-px bg-neutral-100 dark:bg-neutral-800" />
          <TextInput value={leg.type === "transit" ? leg.linesText : leg.minutesText}
            onChangeText={(value) => patchLeg(leg.id, leg.type === "transit" ? { linesText: value } : { minutesText: value.replace(/[^\d.]/g, "") })}
            keyboardType={leg.type === "transit" ? "default" : "decimal-pad"}
            placeholder={leg.type === "transit" ? t("routeLinesPlaceholder") : t("minutesOverrideOptional")}
            placeholderTextColor="#9CA3AF" className="px-4 py-3 text-neutral-900 dark:text-white" />
        </View>)}
        {!connected && <Text className="text-red-500 text-xs mb-3">{t("adjacentLegsConnect")}</Text>}
        <View className="flex-row flex-wrap gap-2">
          <Pressable onPress={() => add("transit")} className="px-3 py-2 bg-blue-600 rounded-lg"><Text className="text-white font-semibold">+ {t("transit")}</Text></Pressable>
          <Pressable onPress={() => add("bike")} className="px-3 py-2 bg-neutral-200 dark:bg-neutral-800 rounded-lg"><Text className="text-neutral-800 dark:text-white">+ {t("bike")}</Text></Pressable>
          <Pressable onPress={() => add("walk")} className="px-3 py-2 bg-neutral-200 dark:bg-neutral-800 rounded-lg"><Text className="text-neutral-800 dark:text-white">+ {t("walk")}</Text></Pressable>
        </View>
        <Text className="text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase tracking-wide mb-2 mt-6 ml-1">{t("reachBy")}</Text>
        <View className="rounded-2xl bg-white dark:bg-neutral-900 p-3 flex-row gap-2">
          {([
            { value: undefined, label: `🌐 ${t("global")}` },
            { value: "walk" as const, label: `🚶 ${t("walk")}` },
            { value: "bike" as const, label: `🚲 ${t("bike")}` },
          ]).map((option) => <Pressable key={option.label} onPress={() => setMode(option.value)}
            className={`px-3 py-2 rounded-lg ${mode === option.value ? "bg-blue-600" : "bg-neutral-100 dark:bg-neutral-800"}`}>
            <Text className={mode === option.value ? "text-white font-semibold" : "text-neutral-800 dark:text-white"}>{option.label}</Text>
          </Pressable>)}
        </View>
        <Text className="text-neutral-500 dark:text-neutral-400 text-xs mt-2 ml-1">{t("defaultRouteModeHelp")}</Text>
      </ScrollView>
    </View>
  </Modal>;
}
