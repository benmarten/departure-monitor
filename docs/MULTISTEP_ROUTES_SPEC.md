# Multistep Routes Spec

## Goal

Support configurable routes made from multiple ordered legs, including transit legs and manual transfer legs such as biking or walking.

Example:

```text
Elmendinger Str. Durlach -> Weinweg Karlsruhe      transit
Weinweg Karlsruhe -> Hagsfeld Bahnhof              bike
Hagsfeld Bahnhof -> Friedrichstal (Baden)          transit
```

The board should show only complete itineraries where each transfer can be made in time.

Before writing Expo or React Native code, read the exact Expo v56 docs:

```text
https://docs.expo.dev/versions/v56.0.0/
```

## Current Limitation

The current route model is a single public-transport query:

```ts
RouteConfig = {
  start: EfaStop;
  end: EfaStop;
  lines?: string[];
  mode?: "walk" | "bike";
}
```

That can represent:

```text
start stop -> destination stop
```

It cannot represent:

```text
transit -> bike -> transit
```

because the intermediate bike leg affects whether the later train can be reached.

## Bike Distance Calculation

Bike distance should remain based on the existing reachability approximation unless we later add a routing API.

Current behavior:

1. Calculate straight-line distance between two coordinates with Haversine.
2. Multiply by `DETOUR_FACTOR = 1.3`.
3. Convert distance to minutes using `settings.bikeKmh`.

Formula:

```text
bikeMinutes = distanceMeters(from, to) * 1.3 / 1000 / bikeKmh * 60
```

This is the same approximation currently used for "can I reach the stop by bike?" It is not turn-by-turn cycling distance. It is acceptable for this feature as a first implementation because it is deterministic, offline, and already matches the app's existing reachability semantics.

Allow a per-leg `minutesOverride` for bike/walk transfer legs so the user can correct the estimate when the straight-line approximation is poor.

## Data Model

Update `src/types.ts`.

Add route legs:

```ts
export type RouteLeg =
  | {
      id: string;
      type: "transit";
      from: EfaStop;
      to: EfaStop;
      lines?: string[];
    }
  | {
      id: string;
      type: "walk" | "bike";
      from: EfaStop;
      to: EfaStop;
      minutesOverride?: number;
    };
```

Update `RouteConfig`:

```ts
export interface RouteConfig {
  id: string;
  name?: string;
  legs: RouteLeg[];

  // Legacy compatibility during migration/read only.
  start?: EfaStop;
  end?: EfaStop;
  lines?: string[];
  mode?: "walk" | "bike";
}
```

Normalize old routes into one transit leg:

```ts
{
  id,
  legs: [{ id: makeId("leg"), type: "transit", from: start, to: end, lines }]
}
```

Add itinerary leg output:

```ts
export interface RouteDepartureLeg {
  id: string;
  type: "transit" | "walk" | "bike";
  fromLabel: string;
  toLabel: string;
  line?: string;
  product?: string;
  headsign?: string;
  depWhen: Date | null;
  arrWhen: Date | null;
  travelMinutes: number | null;
  platform?: string | null;
  delayMinutes?: number | null;
  cancelled?: boolean;
}
```

Extend `RouteDeparture`:

```ts
export interface RouteDeparture {
  key: string;
  routeId: string;
  line: string;
  product: string;
  originLabel: string;
  originLat?: number;
  originLng?: number;
  destinationLabel: string;
  headsign: string;
  depWhen: Date;
  depPlanned: Date | null;
  platform: string | null;
  arrWhen: Date | null;
  delayMinutes: number | null;
  minutesUntil: number;
  travelMinutes: number | null;
  transfers: number;
  cancelled: boolean;
  itineraryLegs: RouteDepartureLeg[];
}
```

## EFA Fetching

Update `src/efa.ts`.

Keep `fetchRouteDepartures(route, opts)` as the public API, but internally support multiple legs.

Refactor the current single transit parser into reusable helpers:

```ts
fetchTransitLegDepartures(from, to, lines, opts)
```

Resolution algorithm:

1. Normalize route to `legs`.
2. Fetch candidate departures for the first transit leg.
3. For each candidate, maintain a cursor time.
4. After a transit leg, cursor becomes that leg's arrival time.
5. After a bike/walk leg, cursor is advanced by estimated or overridden transfer minutes.
6. For each later transit leg, fetch departures for that leg and choose the first departure with `depWhen >= cursor`.
7. If no onward transit departure is reachable, discard that candidate.
8. Build one `RouteDeparture` with all `itineraryLegs`.
9. Sort and return `opts.results`.

Line filters apply per transit leg.

Cancellation should propagate: if any transit leg is cancelled, the full itinerary is cancelled.

## Departures Hook

Update `src/useDepartures.ts`.

The hook needs transfer settings so EFA itinerary building can estimate bike/walk legs:

```ts
useDepartures(group, settings)
```

Update call sites accordingly.

Update `fetchKey` to include:

- route id
- every leg id
- leg type
- from stop id
- to stop id
- line filters
- manual transfer override

Cache revival must revive dates inside `itineraryLegs`, not only top-level dates.

## Reachability

Update `src/reach.ts`.

Keep GPS-to-first-stop reachability as-is. That still answers:

```text
Can I get from my current location to the first boarding stop?
```

Add a helper for internal transfer legs:

```ts
export function estimateTransferMinutes(
  from: EfaStop,
  to: EfaStop,
  mode: "walk" | "bike",
  settings: Pick<ReachSettings, "walkKmh" | "bikeKmh">
): number | null
```

Use the same distance formula:

```text
straight-line meters * 1.3 / speed
```

Return `null` if coordinates or speed are missing.

## Route Editor

Update `src/screens/RouteEditorModal.tsx`.

Replace the two-stop editor with an ordered leg editor.

Required fields per leg:

- type: transit, bike, or walk
- from stop
- to stop
- lines input for transit legs
- optional minutes override for bike/walk legs

Required actions:

- add transit leg
- add bike leg
- add walk leg
- delete leg
- move leg up/down if practical

Validation:

- at least one transit leg
- every leg has from/to stops
- adjacent legs should connect: previous `to.id === next.from.id`

Convenience:

- when adding a new leg, default `from` to the previous leg's `to`
- when editing a legacy route, open it as one transit leg

## Routes Screen

Update `src/screens/RoutesScreen.tsx`.

Render route summaries from legs, for example:

```text
Elmendinger Str. -> Weinweg -> bike Hagsfeld Bahnhof -> Friedrichstal
```

Update reverse copy:

1. Reverse leg order.
2. Swap each leg's `from` and `to`.
3. Preserve leg type.
4. Preserve line filters.
5. Generate new ids.

The existing route-level mode button should either be removed for multistep routes or treated only as GPS-to-first-stop reachability. Middle bike/walk behavior belongs on the leg itself.

## Location Matching

Update `src/location.ts`.

`groupCenter` should use each route's first leg `from` coordinates.

For legacy routes, fall back to `route.start`.

## Storage

Update `src/storage.ts`.

Recommended:

```ts
const STORAGE_KEY = "kvv-board:presets:v2";
const LEGACY_STORAGE_KEY = "kvv-board:presets:v1";
```

Load flow:

1. Try v2.
2. If absent, load v1.
3. Normalize old route objects to `legs`.
4. Save normalized data to v2.
5. Return normalized presets.

Defaults should use `legs`.

## Departure Row

Update `src/components/DepartureRow.tsx`.

Compact row should show:

- first transit line as the badge
- final destination/headsign as title
- route chain as subtitle
- final arrival
- full itinerary duration
- transfer indicators

Expanded row should render every `itineraryLeg`:

- transit: line, from, departure, platform, to, arrival
- bike/walk: mode, from, to, estimated minutes

## Tests

Update `src/efa.test.ts`:

- legacy single transit route still works
- multistep route with bike transfer selects only reachable onward trains
- unreachable onward trains are skipped
- line filters apply per transit leg
- cancellation on any transit leg marks the itinerary cancelled
- final `arrWhen` comes from the last transit leg
- `travelMinutes` covers the full itinerary

Update `src/reach.test.ts`:

- transfer estimate uses bike speed
- transfer estimate uses walk speed
- manual minutes override wins
- missing coordinates return null
- zero speed returns null

Run:

```bash
bun test src/
```

## Acceptance Criteria

The user can configure:

```text
Elmendinger Str. Durlach
-> Weinweg Karlsruhe by transit
-> Hagsfeld Bahnhof by bike
-> Friedrichstal (Baden) by transit
```

The board shows complete itineraries only when the bike transfer can be made. Existing saved single-leg routes continue to work after migration.
