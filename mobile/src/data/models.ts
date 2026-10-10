import { fixed, sumOf } from './util';
import type { Instant, LocalDate } from './time';
import { TripIds } from './geo';
import { S } from '../i18n';
import type { VehicleKind } from '../i18n/en';

export interface GeoPoint {
  lat: number;
  lon: number;
}

export const samePoint = (a: GeoPoint, b: GeoPoint) => a.lat === b.lat && a.lon === b.lon;

export const TRANSIT_MODES = ['WALK', 'BUS', 'TRAIN', 'LIGHT_RAIL', 'METRO', 'CABLE_CAR', 'FERRY', 'OTHER', 'CAR'] as const;
/** CAR is a lift in someone's car (see RideOffer); like a walk, it's not a ride to catch. */
export type TransitMode = (typeof TRANSIT_MODES)[number];

export const isTransit = (m: TransitMode) => m !== 'WALK' && m !== 'CAR';

/** The kind of vehicle riders call this mode by: a metro is a "train"; a light rail too, except in Russian ("трамвай"). */
export function vehicleKind(m: TransitMode): VehicleKind {
  switch (m) {
    case 'BUS':
    case 'CABLE_CAR':
    case 'FERRY':
    case 'CAR':
    case 'LIGHT_RAIL':
      return m;
    case 'TRAIN':
    case 'METRO':
      return 'TRAIN';
    default:
      return 'RIDE';
  }
}

/** For a mix of rides: their mode's kind when they share one, else RIDE. */
export function kindOf(rides: readonly Leg[]): VehicleKind {
  const modes = new Set(rides.map((r) => r.mode));
  return modes.size === 1 ? vehicleKind([...modes][0]) : 'RIDE';
}

/** One vehicle of this mode, as riders say it: "train is close". */
export const vehicle = (m: TransitMode) => S.vehicle[vehicleKind(m)];
/** Several vehicles of this mode: "Next trains". */
export const vehicles = (m: TransitMode) => S.vehicles[vehicleKind(m)];
/** [vehicles] for a mix of rides: their mode's word when they share one, else "rides". */
export const vehiclesOf = (rides: readonly Leg[]) => S.vehicles[kindOf(rides)];

/** Maps a MOTIS mode string to the modes that exist in Israel. */
export function modeFromMotis(mode: string | null | undefined): TransitMode {
  switch (mode) {
    case 'WALK':
      return 'WALK';
    case 'BUS':
    case 'COACH':
      return 'BUS';
    case 'RAIL':
    case 'HIGHSPEED_RAIL':
    case 'LONG_DISTANCE':
    case 'NIGHT_RAIL':
    case 'REGIONAL_FAST_RAIL':
    case 'REGIONAL_RAIL':
    case 'SUBURBAN':
      return 'TRAIN';
    case 'TRAM':
      return 'LIGHT_RAIL';
    case 'SUBWAY':
    case 'METRO':
    case 'FUNICULAR':
      return 'METRO';
    case 'AERIAL_LIFT':
    case 'AREAL_LIFT':
    case 'CABLE_CAR':
      return 'CABLE_CAR';
    case 'FERRY':
      return 'FERRY';
    case 'CAR':
    case 'CAR_DROPOFF':
    case 'CAR_PARKING':
      return 'CAR';
    default:
      return 'OTHER';
  }
}

/** Maps a GTFS route_type to a mode. */
export function modeFromGtfsRouteType(type: string | null | undefined): TransitMode {
  const n = type != null && /^[+-]?\d+$/.test(type) ? Number(type) : null;
  switch (n) {
    case 0:
      return 'LIGHT_RAIL';
    case 1:
      return 'METRO';
    case 2:
      return 'TRAIN';
    case 3:
      return 'BUS';
    case 4:
      return 'FERRY';
    case 5:
    case 6:
      return 'CABLE_CAR';
    case 7:
      return 'METRO';
    default:
      return 'OTHER';
  }
}

export const PLACE_KINDS = ['CURRENT_LOCATION', 'ADDRESS', 'POI', 'STOP', 'HOME', 'WORK', 'PIN', 'ON_BOARD'] as const;
/** ON_BOARD: aboard a bus or train already ([Place.tripId]); trips start from its next stop. */
export type PlaceKind = (typeof PLACE_KINDS)[number];

export interface Place {
  name: string;
  lat: number;
  lon: number;
  subtitle?: string;
  kind: PlaceKind;
  stopId?: string;
  /** The trip ridden, for ON_BOARD. */
  tripId?: string;
}

export const placePoint = (p: Place): GeoPoint => ({ lat: p.lat, lon: p.lon });

/** Identity used to dedupe suggestions and recents. */
/** Identity used to dedupe suggestions and recents; "where I am" is the same place in any language. */
export const placeKey = (p: Place) => (p.kind === 'CURRENT_LOCATION' ? 'current-location' : `${p.name.trim()}|${fixed(p.lat, 4)}|${fixed(p.lon, 4)}`);

export interface StopCall {
  stopId: string | null;
  name: string;
  code: string | null;
  lat: number;
  lon: number;
  scheduledArrival: Instant | null;
  scheduledDeparture: Instant | null;
  track?: string | null;
  /** Floor within a multi-level station (e.g. Tel Aviv Central), when given. */
  floor?: string | null;
}

export const callPoint = (s: StopCall): GeoPoint => ({ lat: s.lat, lon: s.lon });

/** "Platform 13", "Platform 5, floor 6" — where to stand at a big station. */
export function platformLabel(s: StopCall): string | null {
  const parts: string[] = [];
  if (s.track != null) parts.push(S.stop.platform(s.track));
  if (s.floor != null) parts.push(s.track != null ? S.stop.floorAfterPlatform(s.floor) : S.stop.floor(s.floor));
  return parts.length ? parts.join(', ') : null;
}

export const scheduledTime = (s: StopCall): Instant | null => s.scheduledDeparture ?? s.scheduledArrival;

export interface WalkStep {
  instruction: string;
  distanceM: number;
}

export interface Leg {
  mode: TransitMode;
  from: StopCall;
  to: StopCall;
  start: Instant;
  end: Instant;
  distanceM: number | null;
  headsign: string | null;
  routeShortName: string | null;
  routeLongName: string | null;
  /** ARGB colour from the feed. */
  routeColor: number | null;
  routeTextColor: number | null;
  agencyName: string | null;
  tripId: string | null;
  routeId: string | null;
  intermediateStops: StopCall[];
  geometry: GeoPoint[];
  steps: WalkStep[];
  alerts: string[];
  /** GTFS agency_id (== Stride operator_ref); with [agencyName] picks the operator colour. */
  agencyId: string | null;
  /** Other lines riding between the same two stops, for a combined option (see Combine). */
  alternatives: Leg[];
  /** The user's own Shuttle this ride is on, if it is one. */
  shuttleId: string | null;
  /** Leaves at its own time (a driver heading somewhere), rather than to suit the ride after it. */
  fixed: boolean;
}

type LegRequired = Pick<Leg, 'mode' | 'from' | 'to' | 'start' | 'end'>;

/** A leg with Kotlin's defaults for everything not given. */
export function makeLeg(l: LegRequired & Partial<Leg>): Leg {
  return {
    distanceM: null,
    headsign: null,
    routeShortName: null,
    routeLongName: null,
    routeColor: null,
    routeTextColor: null,
    agencyName: null,
    tripId: null,
    routeId: null,
    intermediateStops: [],
    geometry: [],
    steps: [],
    alerts: [],
    agencyId: null,
    alternatives: [],
    shuttleId: null,
    fixed: false,
    ...l,
  };
}

export const legDurationSec = (l: Leg) => l.end - l.start;
export const isCombined = (l: Leg) => l.alternatives.length > 0;

/** This ride and its alternatives, soonest departure first. */
export function legOptions(l: Leg): Leg[] {
  if (l.alternatives.length === 0) return [l];
  return [...l.alternatives, l].sort((a, b) => a.start - b.start);
}

export function lineLabel(l: Leg): string {
  const s = l.routeShortName;
  if (s != null && s.trim() !== '' && s !== 'NaN') return s;
  return l.mode === 'TRAIN' ? S.stop.trainLine : l.mode === 'CABLE_CAR' ? S.stop.cableLine : '—';
}

/** Stable identity of one ride, for live-state maps. */
export const rideKey = (l: Leg) => l.tripId ?? `${lineLabel(l)}@${l.start}`;

/** GTFS route_id == SIRI LineRef. */
export const legLineRef = (l: Leg) => TripIds.lineRef(l.routeId);

export interface Itinerary {
  id: string;
  start: Instant;
  end: Instant;
  transfers: number;
  legs: Leg[];
}

export const itinDurationSec = (i: Itinerary) => i.end - i.start;
export const transitLegs = (i: Itinerary) => i.legs.filter((l) => isTransit(l.mode));
export const firstTransit = (i: Itinerary): Leg | null => i.legs.find((l) => isTransit(l.mode)) ?? null;
export const walkSec = (i: Itinerary) => sumOf(i.legs.filter((l) => l.mode === 'WALK'), legDurationSec);
export const walkMeters = (i: Itinerary) => sumOf(i.legs.filter((l) => l.mode === 'WALK'), (l) => l.distanceM ?? 0);

export interface PlanResult {
  itineraries: Itinerary[];
  walkOnly: Itinerary | null;
  nextCursor: string | null;
  previousCursor: string | null;
  /** Driving all the way, when the request asked for direct car routes. */
  carOnly?: Itinerary | null;
}

/** A departure from a stop, as shown on a stop board. */
export interface Departure {
  tripId: string;
  routeId: string | null;
  mode: TransitMode;
  lineLabel: string;
  headsign: string;
  agency: string | null;
  routeColor: number | null;
  scheduled: Instant;
  stop: StopCall;
  agencyId?: string | null;
}

/** One gtfs route (a direction/alternative of a line) from Stride. */
export interface LineRoute {
  gtfsRouteId: number;
  lineRef: number;
  operatorRef: number;
  shortName: string;
  longName: string;
  mkt: string;
  direction: string;
  alternative: string;
  agency: string;
  mode: TransitMode;
  date: LocalDate;
}

export const routeOrigin = (r: LineRoute) => LongName.parse(r.longName)[0];
export const routeDestination = (r: LineRoute) => LongName.parse(r.longName)[1];
export function routeLabel(r: LineRoute): string {
  if (r.shortName.trim() !== '' && r.shortName !== 'NaN') return r.shortName;
  return r.mode === 'TRAIN' ? S.stop.trainLine : '—';
}

/** A line groups all its directions/alternatives (same operator + mkt); the first is the main one. */
export interface Line {
  routes: LineRoute[];
}

export interface LineStop {
  gtfsStopId: number;
  code: string;
  name: string;
  city: string | null;
  lat: number;
  lon: number;
  sequence: number;
  /** Scheduled offset from the trip's first departure. */
  offsetSec: number;
}

/** A scheduled trip of a line. [tripId] is its Transitous trip id, when already known. */
export interface Ride {
  journeyRef: string;
  departure: Instant;
  tripId?: string | null;
}

export const rideTripNumber = (r: Ride) => r.journeyRef.split('_')[0];

export interface Vehicle {
  lineRef: string;
  journeyRef: string | null;
  originDeparture: Instant;
  lat: number;
  lon: number;
  bearing: number | null;
  velocityKmh: number | null;
  recordedAt: Instant;
  distanceFromStart: number | null;
  nextStopCode: string | null;
  vehicleRef: string | null;
}

export const vehiclePoint = (v: Vehicle): GeoPoint => ({ lat: v.lat, lon: v.lon });

/** Parses Stride's long names: "Origin-City<->Destination-City-1#". */
export const LongName = {
  parse(longName: string): [string, string] {
    const parts = longName.split('<->');
    if (parts.length < 2) return [longName, ''];
    const origin = parts[0].trim();
    // Destination ends with "-<direction><alternative>" e.g. "-1#" or "-20"; strip it.
    const dest = parts[1].trim().replace(/-[0-9]*[#0-9A-Za-z]?$/, '').trim();
    return [prettify(origin), prettify(dest)];
  },
};

/** "Stop-City" -> "Stop, City" (city is after the last dash). */
function prettify(s: string): string {
  const i = s.lastIndexOf('-');
  if (i <= 0 || i === s.length - 1) return s;
  const stop = s.substring(0, i).trim();
  const city = s.substring(i + 1).trim();
  return stop.includes(city) ? stop : `${stop}, ${city}`;
}
