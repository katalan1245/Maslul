import { GeoMath } from './geo';
import { type GeoPoint, type Leg, type LineStop, type Vehicle, callPoint, scheduledTime, vehiclePoint } from './models';
import { Freshness } from './freshness';
import type { Instant } from './time';
import { clamp } from './util';

export interface Progress {
  vehicle: Vehicle;
  alongM: number;
  delaySec: number;
  /** Index of the last stop the vehicle has passed, -1 before the first. */
  lastPassed: number;
  /** Predicted time at each stop; null for stops already passed. */
  predicted: (Instant | null)[];
  stale: boolean;
}

export const stopsAway = (p: Progress, index: number) => index - p.lastPassed;

/**
 * The scheduled shape of a trip pattern: stop positions along the route geometry and each
 * stop's scheduled offset from the trip's first departure. One timeline serves every trip
 * of the same pattern, so a line's live vehicles can all be estimated against it.
 */
export class TripTimeline {
  readonly line: GeoPoint[];
  private readonly cum: number[];
  readonly totalM: number;
  /** Distance along [line] of each stop, forced monotonic so loops don't confuse order. */
  readonly stopAlong: number[];

  constructor(
    readonly stops: GeoPoint[],
    readonly offsetsSec: number[],
    shape: GeoPoint[],
  ) {
    this.line = shape.length >= 2 ? shape : stops;
    this.cum = GeoMath.cumulative(this.line);
    this.totalM = this.cum.length ? this.cum[this.cum.length - 1] : 0;
    const out: number[] = [];
    let prev = 0;
    for (let i = 0; i < stops.length; i++) {
      const hint = i === 0 ? 0 : prev + GeoMath.distance(stops[i - 1], stops[i]);
      const p = GeoMath.project(this.line, this.cum, stops[i], hint, 0, 60);
      const along = Math.max(p?.alongM ?? hint, prev);
      out.push(along);
      prev = along;
    }
    this.stopAlong = out;
  }

  /** Scheduled offset (sec from origin departure) at a distance along the route. */
  offsetAt(alongM: number): number {
    const { stops, stopAlong, offsetsSec } = this;
    if (stops.length === 0) return 0;
    if (alongM <= stopAlong[0]) return offsetsSec[0];
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stopAlong[i];
      const b = stopAlong[i + 1];
      if (alongM <= b) {
        const frac = b - a < 1 ? 1 : (alongM - a) / (b - a);
        return offsetsSec[i] + frac * (offsetsSec[i + 1] - offsetsSec[i]);
      }
    }
    return offsetsSec[offsetsSec.length - 1];
  }

  estimate(v: Vehicle, origin: Instant, now: Instant): Progress | null {
    const { stops, stopAlong, offsetsSec } = this;
    if (stops.length < 2) return null;
    const proj = GeoMath.project(this.line, this.cum, vehiclePoint(v), v.distanceFromStart, 0, 80);
    let along: number;
    if (proj != null && proj.offsetM <= 400) along = proj.alongM;
    else if (v.distanceFromStart != null) along = clamp(v.distanceFromStart, 0, this.totalM);
    else return null;
    const atOrigin = along - stopAlong[0] < 60;
    const rawDelay = atOrigin
      ? // Waiting at the terminal: late only if it's already past departure time.
        Math.max(v.recordedAt - (origin + offsetsSec[0]), 0)
      : v.recordedAt - (origin + Math.trunc(this.offsetAt(along)));
    const delay = clamp(rawDelay, -10 * 60, 90 * 60);

    let lastPassed = -1;
    for (let i = 0; i < stops.length; i++) if (stopAlong[i] < along - 30) lastPassed = i;
    if (atOrigin) lastPassed = -1;

    const predicted = stops.map((_, j) => {
      if (j <= lastPassed) return null;
      const byDelay = origin + offsetsSec[j] + delay;
      // Never faster than ~60 km/h from the reported position, never in the past. An old report
      // counts as at most a minute old: a bus last seen 6 stops back isn't "arriving" just because time went by.
      const byDistance = Math.max(v.recordedAt, now - 60) + Math.trunc(Math.max(stopAlong[j] - along, 0) / 17);
      return Math.max(byDelay, byDistance, now);
    });
    return { vehicle: v, alongM: along, delaySec: delay, lastPassed, predicted, stale: Freshness.isStale(v.recordedAt, now) };
  }

  /** Where to draw a vehicle marker: its reported position, snapped onto the route if near. */
  pointAt(alongM: number): GeoPoint {
    const { line, cum } = this;
    if (line.length === 0) return { lat: 0, lon: 0 };
    for (let i = 0; i < line.length - 1; i++) {
      if (alongM <= cum[i + 1]) {
        const seg = cum[i + 1] - cum[i];
        const t = seg <= 0 ? 0 : (alongM - cum[i]) / seg;
        const a = line[i];
        const b = line[i + 1];
        return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
      }
    }
    return line[line.length - 1];
  }

  /** The part of [line] between two distances along it. */
  slice(fromM: number, toM: number): GeoPoint[] {
    if (this.line.length < 2 || toM <= fromM) return [];
    const out = [this.pointAt(fromM)];
    for (let i = 0; i < this.line.length; i++) if (this.cum[i] > fromM && this.cum[i] < toM) out.push(this.line[i]);
    out.push(this.pointAt(toM));
    return out;
  }

  /** Timeline for a trip returned by the planner (all stops with scheduled times). */
  static fromTrip(trip: Leg): TripTimeline | null {
    const calls = [trip.from, ...trip.intermediateStops, trip.to];
    const times = calls.map(scheduledTime);
    const t0 = times[0];
    if (t0 == null || times.some((t) => t == null)) return null;
    return new TripTimeline(
      calls.map(callPoint),
      times.map((t) => t! - t0),
      trip.geometry,
    );
  }

  static fromLineStops(stops: LineStop[], shape: GeoPoint[]): TripTimeline {
    return new TripTimeline(
      stops.map((s) => ({ lat: s.lat, lon: s.lon })),
      stops.map((s) => s.offsetSec),
      shape,
    );
  }
}

/** Where a live vehicle still has to go before reaching the boarding stop. */
export interface LiveApproach {
  path: GeoPoint[];
  stops: GeoPoint[];
}

/**
 * LIVE: vehicle is tracked and heading to the stop. SCHEDULED: trip hasn't started yet; showing
 * the timetable. UNTRACKED: trip should be running but isn't reporting. PASSED: the vehicle
 * already passed the stop.
 */
export type LiveStatus = 'LIVE' | 'SCHEDULED' | 'UNTRACKED' | 'PASSED';

export interface LiveCall {
  status: LiveStatus;
  scheduled: Instant;
  expected: Instant | null;
  delaySec: number;
  stopsAway: number | null;
  vehicle: Vehicle | null;
  alightExpected: Instant | null;
  progress: Progress | null;
}

export function liveCall(status: LiveStatus, scheduled: Instant, expected: Instant | null, rest: Partial<LiveCall> = {}): LiveCall {
  return { status, scheduled, expected, delaySec: 0, stopsAway: null, vehicle: null, alightExpected: null, progress: null, ...rest };
}

export const bestTime = (c: LiveCall): Instant => c.expected ?? c.scheduled;

export const LiveCalls = {
  /**
   * Live state of one trip at stop [boardIndex] (and optionally [alightIndex]).
   * [vehicle] is the vehicle matched to this trip, if any.
   */
  compute(
    timeline: TripTimeline,
    origin: Instant,
    boardIndex: number,
    alightIndex: number | null,
    vehicle: Vehicle | null,
    now: Instant,
  ): LiveCall {
    const scheduled = origin + timeline.offsetsSec[boardIndex];
    if (vehicle == null) {
      return liveCall(now < origin + 60 ? 'SCHEDULED' : 'UNTRACKED', scheduled, null);
    }
    const p = timeline.estimate(vehicle, origin, now);
    if (p == null) return liveCall('UNTRACKED', scheduled, null, { vehicle });
    const alightExpected = alightIndex != null ? (p.predicted[alightIndex] ?? null) : null;
    if (p.lastPassed >= boardIndex) {
      return liveCall('PASSED', scheduled, null, { delaySec: p.delaySec, stopsAway: 0, vehicle, alightExpected, progress: p });
    }
    return liveCall('LIVE', scheduled, p.predicted[boardIndex], {
      delaySec: p.delaySec,
      stopsAway: stopsAway(p, boardIndex),
      vehicle,
      alightExpected,
      progress: p,
    });
  },
};
