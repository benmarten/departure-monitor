// Domain model for the KVV departure board.
//
// Structure (matches the user's mental model):
//   LocationGroup  (GPS-anchored, e.g. "Friedrichstal")
//     └─ RouteConfig[]  (each a start → end journey, e.g. Mitte → Mühlburger Tor)
//
// When the phone is near a group's anchor, that group is auto-selected and its
// routes are shown. Each route's rows display the *configured destination*
// (route.end), not the train's headsign.

/** A stop resolved from the EFA stopfinder. */
export interface EfaStop {
  /** Global EFA id, e.g. "de:08212:39". */
  id: string;
  /** Display name, e.g. "Karlsruhe, Mühlburger Tor". */
  name: string;
  /** WGS84 latitude, if known (used to auto-center the location anchor). */
  lat?: number;
  /** WGS84 longitude, if known. */
  lng?: number;
}

/** One configured journey: from `start`, heading to `end`. */
export interface RouteConfig {
  id: string;
  start: EfaStop;
  end: EfaStop;
  /**
   * Optional line filter (matched against the line number/label, e.g. "S2",
   * "2"). Empty/undefined shows every line that runs start → end.
   */
  lines?: string[];
  /** Reachability mode for this route. Undefined = use the global default. */
  mode?: "walk" | "bike";
}

/** Settings for the reachability hint (can you make this departure on foot/bike?). */
export interface ReachSettings {
  /** Master on/off. When off, departure times use the default color. */
  enabled: boolean;
  /** Default mode for routes that don't set their own. */
  mode: "walk" | "bike";
  /** Global override from the main page; null = respect each route's mode. */
  override: "walk" | "bike" | null;
  /** Travel speeds in km/h. */
  walkKmh: number;
  bikeKmh: number;
  /** Spare minutes needed to count as "comfortable" (green vs yellow). */
  bufferMin: number;
  /** Target wait time at the stop for the "leave in" calculation. */
  optimalWaitMin: number;
  /** Hide departures the user can't reach in time. */
  hideUnreachable: boolean;
  /** Main row display mode. */
  departureDisplay: "countdown" | "leaveBy";
  /** Wait/slack time below this is green. */
  waitGreenMaxMin: number;
  /** Wait/slack time below this is yellow; higher is red. */
  waitYellowMaxMin: number;
  /** Sort order for departure list. */
  sortBy: "totalTime" | "departure" | "arrival";
}

/** A named, GPS-anchored group of routes. */
export interface LocationGroup {
  id: string;
  name: string;
  anchor: {
    lat: number;
    lng: number;
    /** Activation radius around the anchor, in meters. */
    radiusMeters: number;
  };
  routes: RouteConfig[];
}

/** A normalized, display-ready departure for one route. */
export interface RouteDeparture {
  key: string;
  routeId: string;
  /** Line label to show, e.g. "S2", "2". */
  line: string;
  /** Product class, e.g. "S-Bahn", "Straßenbahn", "Bus". */
  product: string;
  /** The route's start name (where the user boards). */
  originLabel: string;
  /** Start stop coordinates, for reachability (walk/bike time) calc. */
  originLat?: number;
  originLng?: number;
  /** This route's reachability mode (undefined = use global default). */
  mode?: "walk" | "bike";
  /** What the user wants to see as the destination (the route's end name). */
  destinationLabel: string;
  /** The train's actual final destination / headsign. */
  headsign: string;
  /** Realtime departure instant from the start stop. */
  depWhen: Date;
  /** Planned departure instant, if known. */
  depPlanned: Date | null;
  /** Platform/track (Gleis) for departure, if known. */
  platform: string | null;
  /** Realtime arrival instant at the destination, if known. */
  arrWhen: Date | null;
  /** Delay in whole minutes at departure (positive = late), or null. */
  delayMinutes: number | null;
  /** Whole minutes from "now" until departure. */
  minutesUntil: number;
  /** Total travel time to the destination in minutes, if known. */
  travelMinutes: number | null;
  /** Number of transfers (0 = direct). */
  transfers: number;
  cancelled: boolean;
}
