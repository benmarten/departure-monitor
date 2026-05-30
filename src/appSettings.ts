import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReachSettings } from "./types";

const KEY = "kvv-board:settings:v1";

export const DEFAULT_SETTINGS: ReachSettings = {
  enabled: true,
  mode: "walk",
  override: null,
  walkKmh: 5,
  bikeKmh: 15,
  bufferMin: 10,
  optimalWaitMin: 5,
  hideUnreachable: true,
  departureDisplay: "countdown",
  waitGreenMaxMin: 15,
  waitYellowMaxMin: 30,
};

async function load(): Promise<ReachSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ReachSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export interface SettingsState {
  settings: ReachSettings;
  update: (patch: Partial<ReachSettings>) => void;
}

/** Loads reachability settings from storage and persists every change. */
export function useAppSettings(): SettingsState {
  const [settings, setSettings] = useState<ReachSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let alive = true;
    load().then((s) => alive && setSettings(s));
    return () => {
      alive = false;
    };
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useCallback((patch: Partial<ReachSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // Debounce the write so the toggle feels instant.
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void AsyncStorage.setItem(KEY, JSON.stringify(next)), 400);
      return next;
    });
  }, []);

  return { settings, update };
}
