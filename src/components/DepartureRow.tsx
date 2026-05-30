import { Text, View } from "react-native";
import { ReachSettings, RouteDeparture } from "../types";
import { computeReach } from "../reach";
import { formatClock, lineColor, minutesLabel, routeName, stopShort } from "../theme";

const REACH_TEXT: Record<string, string> = {
  green: "text-green-600 dark:text-green-400",
  yellow: "text-amber-500 dark:text-amber-400",
  red: "text-red-500 dark:text-red-400",
};
const REACH_ICON: Record<string, string> = { walk: "🚶", bike: "🚲" };

function waitColor(slackMin: number, settings: ReachSettings): string {
  if (slackMin < settings.waitGreenMaxMin) return REACH_TEXT.green;
  if (slackMin < settings.waitYellowMaxMin) return REACH_TEXT.yellow;
  return REACH_TEXT.red;
}

interface Props {
  dep: RouteDeparture;
  now: number;
  pos: { lat: number; lng: number } | null;
  settings: ReachSettings;
  routeMode?: "walk" | "bike";
}

export function DepartureRow({ dep, now, pos, settings, routeMode }: Props) {
  const min = Math.round((dep.depWhen.getTime() - now) / 60_000);
  const late = dep.delayMinutes != null && dep.delayMinutes > 0;
  const early = dep.delayMinutes != null && dep.delayMinutes < 0;

  const reach = computeReach(dep, pos, settings, now, routeMode);
  const minColor = reach ? REACH_TEXT[reach.level] : "text-neutral-900 dark:text-neutral-50";

  return (
    <View
      className={`flex-row items-center gap-3 rounded-2xl p-3 bg-white dark:bg-neutral-900 ${
        dep.cancelled ? "opacity-50" : ""
      }`}
    >
      <View
        className="min-w-[44px] h-8 rounded-lg items-center justify-center px-2 self-start mt-0.5"
        style={{ backgroundColor: lineColor(dep.line) }}
      >
        <Text className="text-white font-extrabold text-sm">{dep.line}</Text>
      </View>

      <View className="flex-1 min-w-0">
        <Text className="text-neutral-400 dark:text-neutral-500 text-[11px]" numberOfLines={1}>
          {routeName(dep.originLabel)} → {routeName(dep.destinationLabel)}
        </Text>
          <Text className="text-neutral-900 dark:text-neutral-50 text-[15px] font-normal" numberOfLines={2}>
          {dep.headsign ? stopShort(dep.headsign) : dep.product || "—"}
        </Text>
        <Text className="text-neutral-500 dark:text-neutral-400 text-xs mt-0.5" numberOfLines={1}>
          {dep.arrWhen ? `arrives ${formatClock(dep.arrWhen)}` : dep.product}
          {dep.travelMinutes != null ? ` · ${dep.travelMinutes}'` : ""}
          {dep.transfers > 0 ? ` · ${dep.transfers}× change` : ""}
        </Text>
      </View>

      <View className="items-end min-w-[58px] self-start mt-0.5">
        {dep.cancelled ? (
          <Text className="text-red-500 font-bold text-sm">cancelled</Text>
        ) : (
          <View>
            <Text className={`text-xl font-extrabold ${minColor}`}>{minutesLabel(min)}</Text>
            <Text className="text-neutral-500 dark:text-neutral-400 text-xs mt-0.5">
              {formatClock(dep.depWhen)}
             {late ? (
               <Text className={`${REACH_TEXT.red} font-bold`}> +{dep.delayMinutes}</Text>
             ) : null}
             {early ? (
               <Text className={`${REACH_TEXT.green} font-bold`}> {dep.delayMinutes}</Text>
             ) : null}
            </Text>
            {reach ? (
              <View className="flex-row items-center gap-1 mt-0.5">
                <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  {REACH_ICON[reach.mode]} {reach.travelMin}'
                </Text>
                {reach.slackMin > 0 ? (
                  <Text className={`text-[11px] ${waitColor(reach.slackMin, settings)}`}>
                    ⏳ {Math.round(reach.slackMin)}'
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        )}
      </View>
    </View>
  );
}
