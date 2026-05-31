import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "../i18n";
import { ReachSettings } from "../types";

interface Props {
  settings: ReachSettings;
  updateSettings: (patch: Partial<ReachSettings>) => void;
  onClose: () => void;
}

export function SettingsScreen({
  settings,
  updateSettings,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-neutral-100 dark:bg-neutral-950" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-4 py-3">
        <Pressable onPress={onClose} hitSlop={8}>
          <Text className="text-blue-600 dark:text-blue-400 text-base">{t("done")}</Text>
        </Pressable>
        <Text className="text-neutral-900 dark:text-white text-base font-bold">{t("settings")}</Text>
        <View className="w-16" />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        {/* Reachability: color departures by whether you can walk/bike there in time */}
        <View className="rounded-2xl bg-white dark:bg-neutral-900 p-4 mb-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-neutral-900 dark:text-white text-base font-bold">{t("canIMakeIt")}</Text>
              <Text className="text-neutral-500 dark:text-neutral-400 text-xs mt-0.5">
                {t("canIMakeItHelp")}
              </Text>
            </View>
            <Switch
              value={settings.enabled}
              onValueChange={(v) => updateSettings({ enabled: v })}
            />
          </View>

          {settings.enabled && (
            <View className="mt-4 gap-3">
              {/* Mode */}
              <View className="flex-row items-center justify-between">
                <Text className="text-neutral-600 dark:text-neutral-300 text-sm">{t("globalMode")} 🌐</Text>
                <View className="flex-row gap-2">
                  {(["walk", "bike"] as const).map((m) => {
                    const on = settings.mode === m;
                    return (
                      <Pressable
                        key={m}
                        onPress={() => updateSettings({ mode: m })}
                        className={`px-3 py-1.5 rounded-full ${on ? "bg-blue-600" : "bg-neutral-100 dark:bg-neutral-800"}`}
                      >
                        <Text className={`text-xs font-semibold ${on ? "text-white" : "text-neutral-600 dark:text-neutral-300"}`}>
                          {m === "walk" ? `🚶 ${t("walk")}` : `🚲 ${t("bike")}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Speed for the active mode */}
              <View className="flex-row items-center justify-between">
                <Text className="text-neutral-600 dark:text-neutral-300 text-sm">
                  {settings.mode === "bike" ? t("bikeSpeed") : t("walkSpeed")}
                </Text>
                <View className="flex-row items-center gap-1">
                  <TextInput
                    value={String(settings.mode === "bike" ? settings.bikeKmh : settings.walkKmh)}
                    onChangeText={(t) => {
                      const v = Math.max(1, Number(t.replace(/[^\d.]/g, "")) || 0);
                      updateSettings(settings.mode === "bike" ? { bikeKmh: v } : { walkKmh: v });
                    }}
                    keyboardType="decimal-pad"
                    className="w-16 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 text-xs text-center"
                  />
                  <Text className="text-neutral-500 dark:text-neutral-400 text-xs">km/h</Text>
                </View>
              </View>

              <Text className="text-neutral-400 dark:text-neutral-500 text-[11px] font-semibold uppercase tracking-wide mt-1">
                {t("timing")}
              </Text>

              <View className="flex-row items-center justify-between">
                <Text className="text-neutral-600 dark:text-neutral-300 text-sm">{t("tightBelow")}</Text>
                <View className="flex-row items-center gap-1">
                  <TextInput
                    value={String(settings.bufferMin)}
                    onChangeText={(t) => updateSettings({ bufferMin: Math.max(0, Number(t.replace(/\D/g, "")) || 0) })}
                    keyboardType="number-pad"
                    className="w-16 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 text-xs text-center"
                  />
                  <Text className="text-neutral-500 dark:text-neutral-400 text-xs">min</Text>
                </View>
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="text-neutral-600 dark:text-neutral-300 text-sm">{t("optimalWait")}</Text>
                <View className="flex-row items-center gap-1">
                  <TextInput
                    value={String(settings.optimalWaitMin)}
                    onChangeText={(t) => updateSettings({ optimalWaitMin: Math.max(0, Number(t.replace(/\D/g, "")) || 0) })}
                    keyboardType="number-pad"
                    className="w-16 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 text-xs text-center"
                  />
                  <Text className="text-neutral-500 dark:text-neutral-400 text-xs">min</Text>
                </View>
              </View>

              <Text className="text-neutral-400 dark:text-neutral-500 text-[11px] font-semibold uppercase tracking-wide mt-1">
                {t("waitColors")}
              </Text>

              <View className="flex-row items-center justify-between">
                <Text className="text-neutral-600 dark:text-neutral-300 text-sm">{t("waitGreenBelow")}</Text>
                <View className="flex-row items-center gap-1">
                  <TextInput
                    value={String(settings.waitGreenMaxMin)}
                    onChangeText={(t) => updateSettings({ waitGreenMaxMin: Math.max(0, Number(t.replace(/\D/g, "")) || 0) })}
                    keyboardType="number-pad"
                    className="w-16 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 text-xs text-center"
                  />
                  <Text className="text-neutral-500 dark:text-neutral-400 text-xs">min</Text>
                </View>
              </View>

              <View className="flex-row items-center justify-between">
                <Text className="text-neutral-600 dark:text-neutral-300 text-sm">{t("waitYellowBelow")}</Text>
                <View className="flex-row items-center gap-1">
                  <TextInput
                    value={String(settings.waitYellowMaxMin)}
                    onChangeText={(t) => updateSettings({ waitYellowMaxMin: Math.max(settings.waitGreenMaxMin, Number(t.replace(/\D/g, "")) || 0) })}
                    keyboardType="number-pad"
                    className="w-16 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-50 text-xs text-center"
                  />
                  <Text className="text-neutral-500 dark:text-neutral-400 text-xs">min</Text>
                </View>
              </View>

              <Text className="text-neutral-400 dark:text-neutral-500 text-[11px] leading-4">
                {t("reachHelpPrefix")} {t("departureColor")}: {t("redMiss")}, {t("yellowTight")}, {t("greenSpare", { n: settings.bufferMin })}. {t("waitColor")}: {t("greenBelow", { n: settings.waitGreenMaxMin })}, {t("yellowBelow", { n: settings.waitYellowMaxMin })}, {t("redAbove")}.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
