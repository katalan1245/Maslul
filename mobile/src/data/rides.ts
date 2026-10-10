import { GeoMath } from './geo';
import {
  type GeoPoint,
  type Itinerary,
  type Leg,
  type Place,
  callPoint,
  isTransit,
  itinDurationSec,
  legDurationSec,
  rideKey,
  transitLegs,
} from './models';
import type { Instant } from './time';
import { groupBy, minBy, sortedBy } from './util';

/**
 * Someone driving you part of the way; the rest is by transit. Either the driver is going to
 * [dest] (get out wherever on the way suits you best, or with [only] at [dest] alone, when they
 * can't stop on the way), or takes you wherever you like, up to [minutes] of driving.
 */
export type RideOffer = { kind: 'toPlace'; dest: Place; only?: boolean } | { kind: 'within'; minutes: number };

export const RIDE_MINUTES = [5, 10, 15, 20, 30, 45];

/** A place on the driver's route to get out at, [atSec] seconds of driving in. */
export interface DropOff {
  point: GeoPoint;
  alongM: number;
  atSec: number;
}

/** Getting out and walking away takes a moment. */
const STOP_SEC = 60;
const MIN_STEP_SEC = 5 * 60;
/** Evenly spaced drop-offs; with the one nearest the destination and the end, at most 6 to plan from. */
const MAX_SAMPLES = 4;
/** Drop-offs this close in driving time are the same place. */
const SAME_SEC = 90;

function pointAt(line: GeoPoint[], cum: number[], alongM: number): GeoPoint {
  for (let i = 0; i < line.length - 1; i++) {
    if (alongM <= cum[i + 1]) {
      const seg = cum[i + 1] - cum[i];
      const f = seg <= 0 ? 0 : (alongM - cum[i]) / seg;
      return { lat: line[i].lat + (line[i + 1].lat - line[i].lat) * f, lon: line[i].lon + (line[i + 1].lon - line[i].lon) * f };
    }
  }
  return line[line.length - 1];
}

const routeLine = (route: Leg): GeoPoint[] => (route.geometry.length ? route.geometry : [callPoint(route.from), callPoint(route.to)]);

/**
 * Candidate drop-offs along [route] (a car leg with geometry): evenly spaced in driving time,
 * the point nearest [target], and the route's end. Soonest first.
 */
function dropOffs(route: Leg, target: GeoPoint): DropOff[] {
  const line = routeLine(route);
  const cum = GeoMath.cumulative(line);
  const totalM = cum[cum.length - 1];
  const totalSec = Math.max(legDurationSec(route), 1);
  if (totalM <= 0) return [{ point: line[line.length - 1], alongM: 0, atSec: totalSec }];
  const at = (alongM: number): DropOff => ({ point: pointAt(line, cum, alongM), alongM, atSec: Math.trunc((totalSec * alongM) / totalM) });

  const step = Math.max(MIN_STEP_SEC, Math.trunc(totalSec / (MAX_SAMPLES + 1)));
  let out: DropOff[] = [];
  for (let t = step; t < totalSec - SAME_SEC; t += step) out.push(at((totalM * t) / totalSec));
  // The point nearest where you're going beats a sample next to it.
  const p = GeoMath.project(line, cum, target);
  if (p != null) {
    const near = at(p.alongM);
    if (near.atSec >= SAME_SEC && near.atSec <= totalSec - SAME_SEC) {
      out = out.filter((d) => !(Math.abs(d.atSec - near.atSec) < SAME_SEC));
      out.push(near);
    }
  }
  out.push({ point: line[line.length - 1], alongM: totalM, atSec: totalSec });
  return sortedBy(out, (d) => d.atSec);
}

/** The ride from the start of [route] to [drop], leaving at [leave]. */
function carLeg(route: Leg, drop: DropOff, leave: Instant): Leg {
  const line = routeLine(route);
  const cum = GeoMath.cumulative(line);
  const path = [line[0], ...line.filter((_, i) => cum[i] > 0 && cum[i] < drop.alongM), drop.point];
  const end = leave + drop.atSec;
  const atEnd = drop.alongM >= cum[cum.length - 1] - 1;
  return {
    ...route,
    from: { ...route.from, scheduledDeparture: leave, scheduledArrival: null },
    to: {
      stopId: null,
      name: atEnd ? route.to.name : '',
      code: null,
      lat: drop.point.lat,
      lon: drop.point.lon,
      scheduledArrival: end,
      scheduledDeparture: null,
    },
    start: leave,
    end,
    distanceM: drop.alongM,
    geometry: path,
    steps: [],
    fixed: true,
  };
}

/** The lift in [car] and then [rest] (planned from where it ends), as one trip. */
function compose(car: Leg, rest: Itinerary, id = `ride:${legDurationSec(car)}:${rest.id}`): Itinerary {
  return { id, start: car.start, end: Math.max(rest.end, car.end), transfers: rest.transfers, legs: [car, ...rest.legs] };
}

/**
 * One option per way of continuing (the same rides boarded from different drop-offs): the one
 * [score]d best, and on a tie the one that rides further, so there's less waiting by the road.
 */
function distinct(options: Itinerary[], score: (i: Itinerary) => number): Itinerary[] {
  const groups = groupBy(options, (itin) => {
    const keys = transitLegs(itin).map(rideKey);
    return (keys.length ? keys : ['street']).join('\u0000');
  });
  const best = [...groups.values()].map((group) => {
    let b = group[0];
    for (const x of group.slice(1)) {
      const sx = score(x);
      const sb = score(b);
      if (sx < sb || (sx === sb && x.legs[0].end > b.legs[0].end)) b = x;
    }
    return b;
  });
  return sortedBy(best, score);
}

/**
 * [options] without those getting in much later than the soonest (by over half its trip, and
 * at least [slackSec]): waiting hours for a morning bus isn't an option when you're on your way.
 */
function inReach(options: Itinerary[], slackSec = 30 * 60): Itinerary[] {
  const best = minBy(options, (i) => i.end);
  if (best == null) return options;
  const limit = best.end + Math.max(slackSec, Math.trunc(itinDurationSec(best) / 2));
  return options.filter((i) => !(i.end > limit));
}

/** Where a ride option gets out: the car leg's end, by name when it has one, else the stop walked to. */
function dropOffName(itin: Itinerary): string | null {
  const i = itin.legs.findIndex((l) => l.mode === 'CAR');
  if (i < 0) return null;
  const car = itin.legs[i];
  if (car.to.name.trim() !== '') return car.to.name;
  const after = itin.legs.slice(i + 1);
  const board = after.find((l) => isTransit(l.mode))?.from?.name;
  if (board != null && board.trim() !== '') return board;
  return after.find((l) => l.to.name.trim() !== '')?.to?.name ?? null;
}

/**
 * Where along a driver's route to get out. The route is sampled every few minutes of driving
 * (plus the point closest to where you're going, and the driver's own destination); transit is
 * planned from each point for when you'd get there, and the best of those wins.
 */
export const RidePlanner = { STOP_SEC, dropOffs, carLeg, compose, distinct, inReach, dropOffName };
