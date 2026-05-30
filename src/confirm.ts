import { Alert, Platform } from "react-native";
import { t } from "./i18n";

/**
 * Cross-platform confirmation. React Native's `Alert.alert` is a no-op on
 * Expo web, which silently breaks destructive actions there — so on web we fall
 * back to the browser's native confirm dialog.
 */
export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  confirmLabel = t("delete")
): void {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: t("cancel"), style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

/** Cross-platform informational alert (web-safe). */
export function infoAlert(title: string, message: string): void {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}
