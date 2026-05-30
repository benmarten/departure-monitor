import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StationSearchField } from "../components/StationSearchField";
import { makeId } from "../storage";
import { EfaStop, RouteConfig } from "../types";

interface Props {
  visible: boolean;
  /** Existing route to edit, or null to create a new one. */
  initial: RouteConfig | null;
  onSave: (route: RouteConfig) => void;
  onClose: () => void;
}

export function RouteEditorModal({ visible, initial, onSave, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [start, setStart] = useState<EfaStop | null>(null);
  const [end, setEnd] = useState<EfaStop | null>(null);
  const [linesText, setLinesText] = useState("");
  const [mode, setMode] = useState<"walk" | "bike" | undefined>(undefined);

  useEffect(() => {
    if (visible) {
      setStart(initial?.start ?? null);
      setEnd(initial?.end ?? null);
      setLinesText((initial?.lines ?? []).join(", "));
      setMode(initial?.mode);
    }
  }, [visible, initial]);

  function save() {
    if (!start || !end) return;
    const lines = linesText
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onSave({ id: initial?.id ?? makeId("rt"), start, end, lines, mode });
  }

  const MODE_OPTIONS: { value: "walk" | "bike" | undefined; label: string }[] = [
    { value: undefined, label: "🌐 Global" },
    { value: "walk", label: "🚶 Walk" },
    { value: "bike", label: "🚲 Bike" },
  ];

  const canSave = !!start && !!end;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View className="flex-1 bg-neutral-100 dark:bg-neutral-950" style={{ paddingTop: insets.top }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
          <Pressable onPress={onClose} hitSlop={8} className="w-16">
            <Text className="text-blue-600 dark:text-blue-400 text-base">Cancel</Text>
          </Pressable>
          <Text className="text-neutral-900 dark:text-white text-base font-bold">
            {initial ? "Edit route" : "New route"}
          </Text>
          <Pressable onPress={save} hitSlop={8} disabled={!canSave} className="w-16 items-end">
            <Text className={`text-base font-bold ${canSave ? "text-blue-600 dark:text-blue-400" : "text-neutral-300 dark:text-neutral-600"}`}>
              Save
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text className="text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase tracking-wide mb-2 ml-1">
            Journey
          </Text>

          {/* Start → destination card with a connecting rail */}
          <View className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden">
            <StationSearchField
              label="From"
              value={start}
              accentColor="#22C55E"
              placeholder="Pick a start stop…"
              onChange={setStart}
            />
            <View className="h-px bg-neutral-100 dark:bg-neutral-800 ml-11" />
            <StationSearchField
              label="To"
              value={end}
              accentColor="#3B82F6"
              placeholder="Pick a destination…"
              onChange={setEnd}
            />
          </View>

          {/* Lines */}
          <Text className="text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase tracking-wide mb-2 mt-6 ml-1">
            Lines (optional)
          </Text>
          <View className="rounded-2xl bg-white dark:bg-neutral-900 px-4 py-3">
            <TextInput
              value={linesText}
              onChangeText={setLinesText}
              placeholder="e.g. S2, S9 — empty = all lines"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="characters"
              className="text-[15px] text-neutral-900 dark:text-neutral-50 py-1"
            />
          </View>

          {/* Per-route reachability mode */}
          <Text className="text-neutral-500 dark:text-neutral-400 text-xs font-semibold uppercase tracking-wide mb-2 mt-6 ml-1">
            Reach by
          </Text>
          <View className="rounded-2xl bg-white dark:bg-neutral-900 p-3 flex-row gap-2">
            {MODE_OPTIONS.map((o) => {
              const on = mode === o.value;
              return (
                <Pressable
                  key={o.label}
                  onPress={() => setMode(o.value)}
                  className={`px-3 py-2 rounded-lg ${on ? "bg-blue-600" : "bg-neutral-100 dark:bg-neutral-800"}`}
                >
                  <Text className={`text-xs font-semibold ${on ? "text-white" : "text-neutral-600 dark:text-neutral-300"}`}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-neutral-400 dark:text-neutral-500 text-[11px] mt-1.5 ml-1">
            "Default" uses the global mode; the main-page toggle can override all routes.
          </Text>

          <Text className="text-neutral-400 dark:text-neutral-500 text-xs mt-4 ml-1 leading-5">
            Only direct departures from your start that actually travel to your destination are shown —
            labeled with your destination and arrival time.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}
