import "./global.css";
import { useState } from "react";
import { useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { BoardScreen } from "./src/screens/BoardScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { useActiveLocation } from "./src/useActiveLocation";
import { useAppSettings } from "./src/appSettings";
import { useDepartures } from "./src/useDepartures";
import { usePresets } from "./src/usePresets";

export default function App() {
  const scheme = useColorScheme();
  const presetsState = usePresets();
  const active = useActiveLocation(presetsState.presets);
  const departures = useDepartures(active.group);
  const { settings, update: updateSettings } = useAppSettings();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <View className="flex-1 bg-neutral-100 dark:bg-neutral-950">
          <StatusBar style={scheme === "dark" ? "light" : "dark"} />
          {showSettings ? (
            <SettingsScreen
              presets={presetsState.presets}
              setPresets={presetsState.setPresets}
              resetToDefaults={presetsState.resetToDefaults}
              lastPosition={active.lastPosition}
              settings={settings}
              updateSettings={updateSettings}
              onClose={() => setShowSettings(false)}
            />
          ) : (
            <BoardScreen
              presets={presetsState.presets}
              active={active}
              departures={departures}
              settings={settings}
              updateSettings={updateSettings}
              onOpenSettings={() => setShowSettings(true)}
            />
          )}
        </View>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
