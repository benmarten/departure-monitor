import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ReachSettings, RouteDeparture } from "../types";
import { computeReach } from "../reach";
import { t } from "../i18n";
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
  const [expanded, setExpanded] = useState(false);
  const min = Math.round((dep.depWhen.getTime() - now) / 60_000);
  const late = dep.delayMinutes != null && dep.delayMinutes > 0;
  const early = dep.delayMinutes != null && dep.delayMinutes < 0;

  const reach = computeReach(dep, pos, settings, now, routeMode);
  const minColor = reach ? REACH_TEXT[reach.level] : "text-neutral-900 dark:text-neutral-50";
  const leaveInMin = reach
    ? Math.round((dep.depWhen.getTime() - (reach.travelMin + settings.optimalWaitMin) * 60_000 - now) / 60_000)
    : null;
  const primaryLabel = settings.departureDisplay === "leaveBy" && reach && leaveInMin != null
    ? `${REACH_ICON[reach.mode]} ${minutesLabel(leaveInMin)}`
    : minutesLabel(min);

  // Calculate total travel time: walk/bike + wait + train time
  const totalTime = reach && dep.travelMinutes != null
    ? reach.travelMin + reach.slackMin + dep.travelMinutes
    : null;

  return (
    <Pressable
      onPress={() => setExpanded(!expanded)}
      className={`flex-row items-center gap-3 rounded-2xl p-4 bg-white dark:bg-neutral-900 shadow-sm ${
        dep.cancelled ? "opacity-50" : ""
      }`}
    >
      <View className="flex-row items-center gap-3 flex-1">
        <View
          className="min-w-[48px] h-9 rounded-lg items-center justify-center px-2.5 self-start shadow-sm"
          style={{ backgroundColor: lineColor(dep.line) }}
        >
          <Text className="text-white font-black text-base">{dep.line}</Text>
        </View>

        <View className="flex-1 min-w-0">
          <Text className="text-neutral-900 dark:text-neutral-50 text-base font-semibold leading-tight" numberOfLines={expanded ? undefined : 2}>
            {dep.headsign ? routeName(dep.headsign) : dep.product || "—"}
          </Text>
          <Text className="text-neutral-500 dark:text-neutral-400 text-xs mt-0.5" numberOfLines={expanded ? undefined : 1}>
            {routeName(dep.originLabel)} → {routeName(dep.destinationLabel)}
          </Text>
          {!expanded && (
            <View className="gap-1 mt-1.5">
              <Text className="text-neutral-500 dark:text-neutral-400 text-xs" numberOfLines={1}>
                {dep.arrWhen ? `${t("arrives")} ${formatClock(dep.arrWhen)}` : dep.product}
                {dep.travelMinutes != null ? ` · ${dep.travelMinutes}'` : ""}
                {dep.transfers > 0 ? ` · ${dep.transfers}× ${t("change")}` : ""}
              </Text>
              {totalTime != null && (
                <View className="flex-row items-center gap-1.5 bg-neutral-100 dark:bg-neutral-800 self-start px-2 py-0.5 rounded-md">
                  <Text className="text-neutral-700 dark:text-neutral-300 text-xs font-semibold">
                    ⏱ {Math.round(totalTime)} min
                  </Text>
                </View>
              )}
            </View>
          )}
          {expanded && (
            <View className="mt-2 gap-1">
              <Text className="text-neutral-500 dark:text-neutral-400 text-xs">
                <Text className="font-semibold">{t("product")}:</Text> {dep.product}
              </Text>
              <Text className="text-neutral-500 dark:text-neutral-400 text-xs">
                <Text className="font-semibold">{t("departure")}:</Text> {formatClock(dep.depWhen)}
                {late && <Text className={`${REACH_TEXT.red} font-bold`}> (+{dep.delayMinutes} min)</Text>}
                {early && <Text className={`${REACH_TEXT.green} font-bold`}> ({dep.delayMinutes} min)</Text>}
              </Text>
              {dep.depPlanned && dep.delayMinutes !== 0 && (
                <Text className="text-neutral-500 dark:text-neutral-400 text-xs">
                  <Text className="font-semibold">{t("planned")}:</Text> {formatClock(dep.depPlanned)}
                </Text>
              )}
              {dep.arrWhen && (
                <Text className="text-neutral-500 dark:text-neutral-400 text-xs">
                  <Text className="font-semibold">{t("arrival")}:</Text> {formatClock(dep.arrWhen)}
                  {dep.travelMinutes != null && ` (${dep.travelMinutes} min)`}
                </Text>
              )}
              {dep.transfers > 0 && (
                <Text className="text-neutral-500 dark:text-neutral-400 text-xs">
                  <Text className="font-semibold">{t("transfers")}:</Text> {dep.transfers}
                </Text>
              )}
              {reach && (
                <>
                  {totalTime != null && (
                    <Text className="text-neutral-700 dark:text-neutral-300 text-xs">
                      <Text className="font-bold">{t("totalTime")}:</Text> {Math.round(totalTime)} min
                    </Text>
                  )}
                  <Text className="text-neutral-500 dark:text-neutral-400 text-xs">
                    <Text className="font-semibold">{t("travelTime")}:</Text> {REACH_ICON[reach.mode]} {reach.travelMin} min
                  </Text>
                  {reach.slackMin > 0 && (
                    <Text className="text-neutral-500 dark:text-neutral-400 text-xs">
                      <Text className="font-semibold">{t("waitTime")}:</Text>{" "}
                      <Text className={waitColor(reach.slackMin, settings)}>
                        {Math.round(reach.slackMin)} min
                      </Text>
                    </Text>
                  )}
                  {leaveInMin != null && (
                    <Text className="text-neutral-500 dark:text-neutral-400 text-xs">
                      <Text className="font-semibold">{t("leaveIn")}:</Text> {minutesLabel(leaveInMin)}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}
        </View>

        <View className="items-end min-w-[62px] self-start">
          {dep.cancelled ? (
            <Text className="text-red-500 font-bold text-sm">{t("cancelled")}</Text>
          ) : (
            <View className="items-end">
              <Text className={`text-2xl font-black ${minColor} leading-tight`}>{primaryLabel}</Text>
              {!expanded && (
                <>
                  <Text className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
                    {formatClock(dep.depWhen)}
                    {late ? (
                      <Text className={`${REACH_TEXT.red} font-bold`}> +{dep.delayMinutes}</Text>
                    ) : null}
                    {early ? (
                      <Text className={`${REACH_TEXT.green} font-bold`}> {dep.delayMinutes}</Text>
                    ) : null}
                  </Text>
                  {reach ? (
                    <View className="flex-row items-center flex-wrap gap-1 mt-1 justify-end">
                      <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {REACH_ICON[reach.mode]} {reach.travelMin}'
                      </Text>
                      {reach.slackMin > 0 ? (
                        <Text className={`text-[11px] ${waitColor(reach.slackMin, settings)}`}>
                          ⏳ {Math.round(reach.slackMin)}'
                        </Text>
                      ) : null}
                      {dep.travelMinutes != null ? (
                        <Text className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          🚆 {dep.travelMinutes}'
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
                </>
              )}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}
