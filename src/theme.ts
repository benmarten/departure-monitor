// Line badge colors. NativeWind handles light/dark for the rest of the UI via
// `dark:` variants; line colors are data-driven so they live here as hex.

const LINE_COLORS: Record<string, string> = {
  S1: "#00A76F", S11: "#00A76F",
  S2: "#A3257F",
  S3: "#00396B", S31: "#0090D0", S32: "#0090D0", S33: "#0090D0",
  S4: "#A2123A", S41: "#A2123A", S42: "#A2123A",
  S5: "#0A7E3F", S51: "#7A6FB0", S52: "#7A6FB0",
  S6: "#6E4C9E",
  S7: "#FFCC00", S8: "#A88B5A", S9: "#E2001A",
  // Karlsruhe trams
  "1": "#E2001A", "2": "#0090D0", "3": "#9A6BA8", "4": "#B5A41E",
  "5": "#00A99D", "6": "#7C5BA8", "8": "#E5007D",
};

/** Background color for a line badge; neutral gray if unknown. */
export function lineColor(line: string): string {
  return LINE_COLORS[line.replace(/\s+/g, "").toUpperCase()] ?? LINE_COLORS[line.trim()] ?? "#52525B";
}

/** The stop part of an EFA "Locality, Stop" name (e.g. "Mühlburger Tor"). */
export function stopShort(name: string): string {
  const idx = name.indexOf(",");
  return idx >= 0 ? name.slice(idx + 1).trim() : name.trim();
}

/**
 * A compact full name: "Locality, Stop" → "Locality Stop". Collapses EFA's
 * "X, X" main-station doubling to a single "X" (handles legacy saved names).
 */
export function routeName(name: string): string {
  const idx = name.indexOf(",");
  if (idx < 0) return name.trim();
  const locality = name.slice(0, idx).trim();
  const stop = name.slice(idx + 1).trim();
  return stop === locality ? locality : `${locality} ${stop}`;
}

import { t } from "./i18n";

export { formatClock } from "./i18n";

export function minutesLabel(min: number): string {
  if (min <= 0) return t("now");
  return `${min}′`;
}
