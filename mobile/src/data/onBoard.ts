import type { Progress, TripTimeline } from './eta';
import { GeoMath, TripIds, tripNumberOf } from './geo';
import { forTrip } from './liveRepository';
import {
  type Departure,
  type GeoPoint,
  type Itinerary,
  type Leg,
  type StopCall,
  type TransitMode,
  type Vehicle,
  callPoint,
  isTransit,
  scheduledTime,
  vehiclePoint,
} from './models';
import type { Instant } from './time';
import { distinctBy, minBy, sortedBy } from './util';

/** A bus or train you might be on right now. */
export interface BoardCandidate {
  /** Transitous trip id, when known (timetable matches); live-only ones are looked up when picked. */
  tripId: string | null;
  lineRef: string | null;
  lineLabel: string;
  mode: TransitMode;
  headsign: string;
  agencyName: string | null;
  agencyId: string | null;
  routeColor: number | null;
  /** Its live vehicle, when tracked. */
  vehicle: Vehicle | null;
  /** From you to its live vehicle, or else to the stop near you where it's due around now. */
  distanceM: number;
  /** That stop and when it's due there, for rides known from the timetable. */
  stopName?: string | null;
  stopTime?: Instant | null;
}

export const isLiveCandidate = (c: BoardCandidate) => c.vehicle != null;
export const candidateKey = (c: BoardCandidate) =>
  c.tripId ?? `${c.lineRef}|${c.vehicle?.journeyRef ?? null}|${c.vehicle?.originDeparture ?? null}`;

/** Where to pick up a trip you're already on: its next stop. */
export interface OnBoardStart {
  trip: Leg;
  nextIndex: number;
  next: StopCall;
}

/** How far back and ahead of now a ride may be due at a stop near you. */
const BEFORE_SEC = 25 * 60;
const AFTER_SEC = 15 * 60;
/** Stops farther than this aren't "around you". */
const STOP_RADIUS_M = 1000;
/** A timetable ride a minute off counts like being this much farther away, when ordering. */
const M_PER_MIN = 60;
/** Time to step off and get to another ride at the same stop. */
const CHANGE_SEC = 120;
const MAX_ALIGHT = 6;

/**
 * How far from you a vehicle you're on can be reported: its position is up to a couple of
 * minutes old, and a bus covers ~14 m/s.
 */
function reach(v: Vehicle, now: Instant): number {
  const age = Math.max(now - v.recordedAt, 0);
  return 350 + Math.min(1500, age * 14);
}

/** Live vehicles within [reach] of [here], nearest first. */
function nearVehicles(here: GeoPoint, byLine: Map<string, Vehicle[]>, now: Instant): Vehicle[] {
  const all = [...byLine.values()].flat().filter((v) => GeoMath.distance(here, vehiclePoint(v)) <= reach(v, now));
  return sortedBy(all, (v) => GeoMath.distance(here, vehiclePoint(v)));
}

/** [name], unless it's a code rather than a place (trains are signed with their number: "785"). */
const placeName = (name: string) => (/\p{L}/u.test(name) ? name : '');

/** Lower is likelier: live vehicles by distance first, then timetable rides by distance and time. */
function score(c: BoardCandidate, now: Instant): number {
  if (isLiveCandidate(c)) return c.distanceM;
  return 100_000 + c.distanceM + (M_PER_MIN * Math.abs((c.stopTime ?? now) - now)) / 60;
}

/**
 * Candidates from departures at the stops around you ([stopDistance] to each departure's
 * stop), matched against live vehicles: one per trip, at its most likely stop.
 */
function fromDepartures(
  here: GeoPoint,
  departures: [number, Departure][],
  byLine: Map<string, Vehicle[]>,
  now: Instant,
): BoardCandidate[] {
  const out = new Map<string, [number, BoardCandidate]>();
  for (const [stopDistance, d] of departures) {
    if (stopDistance > STOP_RADIUS_M) continue;
    const dt = d.scheduled - now;
    if (dt < -BEFORE_SEC || dt > AFTER_SEC) continue;
    const lineRef = TripIds.lineRef(d.routeId);
    const parsed = TripIds.parse(d.tripId);
    const v = forTrip(lineRef != null ? (byLine.get(lineRef) ?? []) : [], parsed ? tripNumberOf(parsed) : null, parsed?.originDeparture ?? null);
    const vd = v != null ? GeoMath.distance(here, vehiclePoint(v)) : null;
    // Tracked somewhere else: not the one you're on.
    if (v != null && vd! > reach(v, now) + 500) continue;
    const c: BoardCandidate = {
      tripId: d.tripId,
      lineRef,
      lineLabel: d.lineLabel,
      mode: d.mode,
      headsign: placeName(d.headsign),
      agencyName: d.agency,
      agencyId: d.agencyId ?? null,
      routeColor: d.routeColor,
      vehicle: v,
      distanceM: vd ?? stopDistance,
      stopName: d.stop.name,
      stopTime: d.scheduled,
    };
    const s = score(c, now);
    const prev = out.get(d.tripId);
    if (prev === undefined || s < prev[0]) out.set(d.tripId, [s, c]);
  }
  return [...out.values()].map((x) => x[1]);
}

function rank(list: BoardCandidate[], now: Instant): BoardCandidate[] {
  return sortedBy(distinctBy(list, candidateKey), (c) => score(c, now));
}

/**
 * Stops (indexes into [calls]) after [next] to try getting off at: all of them on a short
 * remainder, else an even spread plus the one nearest [dest] and the last.
 */
function alightStops(calls: StopCall[], next: number, dest: GeoPoint): number[] {
  const rest: number[] = [];
  for (let i = next + 1; i <= calls.length - 1; i++) rest.push(i);
  if (rest.length <= MAX_ALIGHT) return rest;
  const step = rest.length / (MAX_ALIGHT - 2);
  const spread = Array.from({ length: MAX_ALIGHT - 2 }, (_, k) => rest[Math.trunc(k * step)]);
  const nearest = minBy(rest, (i) => GeoMath.distance(callPoint(calls[i]), dest))!;
  return [...new Set([...spread, nearest, calls.length - 1])].sort((a, b) => a - b);
}

/** The part of [trip] from stop [from] to stop [to] (indexes into [calls]): staying on it. */
function ride(trip: Leg, calls: StopCall[], timeline: TripTimeline | null, from: number, to: number, tripId: string | null = trip.tripId): Leg {
  const a = calls[from];
  const b = calls[to];
  const path = timeline?.slice(timeline.stopAlong[from], timeline.stopAlong[to]) ?? [];
  return {
    ...trip,
    from: a,
    to: b,
    start: a.scheduledDeparture ?? a.scheduledArrival ?? trip.start,
    end: b.scheduledArrival ?? b.scheduledDeparture ?? trip.end,
    intermediateStops: calls.slice(from + 1, to),
    geometry: path.length ? path : calls.slice(from, to + 1).map(callPoint),
    distanceM: null,
    tripId,
    alternatives: [],
  };
}

/** Staying on for [r], then [rest] from where it gets off, as one trip. */
function compose(r: Leg, rest: Itinerary | null): Itinerary {
  const legs = [r, ...(rest?.legs ?? [])];
  return {
    id: `board:${r.to.stopId ?? r.to.name}:${rest?.id ?? ''}`,
    start: r.start,
    end: legs[legs.length - 1].end,
    transfers: legs.filter((l) => isTransit(l.mode)).length - 1,
    legs,
  };
}

/**
 * Index (into [calls]) of the trip's next stop: from where you are along its route when
 * you're on it, else from its live vehicle, else from the timetable.
 */
function nextStop(calls: StopCall[], timeline: TripTimeline | null, here: GeoPoint | null, progress: Progress | null, now: Instant): number {
  const last = calls.length - 1;
  if (timeline != null && here != null && timeline.line.length >= 2) {
    // Near the vehicle's (or the timetable's) position, so a route looping back on itself doesn't confuse it.
    const due = calls.findIndex((c) => (scheduledTime(c) ?? now) > now);
    const hint = progress?.alongM ?? (due >= 0 ? timeline.stopAlong[due] : null);
    // Only stretches the route really passes twice (within 60 m) are told apart by the hint; a late bus is behind the timetable.
    const p = GeoMath.project(timeline.line, GeoMath.cumulative(timeline.line), here, hint, 0, 60);
    if (p != null && p.offsetM <= 250) {
      const k = timeline.stopAlong.findIndex((a) => a > p.alongM + 25);
      const i = k < 0 ? last : Math.min(Math.max(k, 0), last);
      // The bus is at least as far as its last report, which may be ahead of a fix matched a little short.
      return Math.min(Math.max(i, progress ? progress.lastPassed + 1 : 0), last);
    }
  }
  if (progress != null) return Math.min(Math.max(progress.lastPassed + 1, 0), last);
  const i = calls.findIndex((c) => (scheduledTime(c) ?? Number.MAX_SAFE_INTEGER) > now);
  return i < 0 ? last : i;
}

/**
 * Working out which ride you're on from where you are: rides due around now at the stops
 * around you (from the timetable), and live vehicles close to you. A ride whose live vehicle is
 * far away isn't yours, whatever the timetable says.
 */
export const OnBoard = {
  BEFORE_SEC,
  AFTER_SEC,
  STOP_RADIUS_M,
  CHANGE_SEC,
  reach,
  nearVehicles,
  fromDepartures,
  placeName,
  score,
  rank,
  alightStops,
  ride,
  compose,
  nextStop,
};
