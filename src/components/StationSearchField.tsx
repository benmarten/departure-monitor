import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { searchStops } from "../efa";
import { t } from "../i18n";
import { EfaStop } from "../types";

interface Props {
  label: string;
  value: EfaStop | null;
  placeholder?: string;
  /** Color of the leading dot (e.g. green for start, blue for destination). */
  accentColor?: string;
  onChange: (stop: EfaStop) => void;
}

/** Debounced station autocomplete backed by the EFA stopfinder. */
export function StationSearchField({ label, value, placeholder, accentColor = "#22C55E", onChange }: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [results, setResults] = useState<EfaStop[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!editing) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const r = await searchStops(q, controller.signal);
        if (!controller.signal.aborted) setResults(r);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(handle);
      abortRef.current?.abort();
    };
  }, [query, editing]);

  function pick(stop: EfaStop) {
    abortRef.current?.abort();
    onChange(stop);
    setEditing(false);
    setQuery("");
    setResults([]);
  }

  // Same row layout whether displaying or editing — only the value line swaps to
  // a text input, so tapping doesn't make the field visually jump.
  return (
    <View className="px-4 py-3">
      <View className="flex-row items-center gap-3">
        <View className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
        <View className="flex-1 min-w-0">
          <Text className="text-neutral-400 dark:text-neutral-500 text-[11px] font-semibold uppercase tracking-wide">
            {label}
          </Text>
          {editing ? (
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={t("typeStopName")}
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
              className="text-[15px] mt-0.5 p-0 text-neutral-900 dark:text-neutral-50"
            />
          ) : (
            <Pressable
              onPress={() => {
                setEditing(true);
                setQuery(value?.name ?? "");
              }}
            >
              <Text
                className={`text-[15px] mt-0.5 ${value ? "text-neutral-900 dark:text-neutral-50 font-medium" : "text-neutral-400"}`}
                numberOfLines={1}
              >
                {value?.name ?? placeholder ?? t("tapSearchStop")}
              </Text>
            </Pressable>
          )}
        </View>
        {editing && loading ? <ActivityIndicator size="small" /> : null}
        {!editing ? <Text className="text-neutral-300 dark:text-neutral-600 text-xl">›</Text> : null}
      </View>

      {editing && results.length > 0 && (
        <View className="mt-2 ml-[22px] rounded-xl overflow-hidden bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700">
          {results.map((s, i) => (
            <Pressable
              key={s.id}
              onPress={() => pick(s)}
              className={`px-3 py-3 active:bg-blue-50 dark:active:bg-neutral-700 ${
                i > 0 ? "border-t border-neutral-200 dark:border-neutral-700" : ""
              }`}
            >
              <Text className="text-neutral-900 dark:text-neutral-50 text-[15px]" numberOfLines={1}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
