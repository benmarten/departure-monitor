export function parseMinutesOverride(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : undefined;
}
