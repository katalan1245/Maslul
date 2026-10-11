import type { LiveCall } from '../data/eta';
import { GeoMath } from '../data/geo';
import { type GeoPoint, type Itinerary, type Leg, callPoint, isTransit, samePoint, scheduledTime, vehicleKind } from '../data/models';
import { S } from '../i18n';
import type { Instant } from '../data/time';
import { Fmt, rideName } from '../ui/fmt';

/** A ride that has gone without you: passed the stop, or due (live or timetable) over 5 minutes ago with nothing newer. */
export function rideGone(leg: Leg, call: LiveCall | null | undefined, now: Instant): boolean {
  if (call?.status === 'PASSED') return true;
  const due = call?.status === 'LIVE' && call.expected != null ? call.expected : leg.start;
  return due < now - 300;
}

export type GuideAlert = 'BOARD_SOON' | 'GET_OFF_NEXT' | 'GET_OFF_NOW' | 'ARRIVED';

export interface GuideState {
  legIndex: number;
  title: string;
  text: string;
  alert: GuideAlert | null;
  /** Alerts fire once per (leg, kind); this is the dedupe key. */
  alertKey: string | null;
  progress: number;
  finished: boolean;
}

/**
 * Follows the user along an itinerary. Positions are projected onto the concatenated leg
 * geometry, which tells us the current leg and — on a transit leg — how many stops remain.
 */
export class TripGuide {
  private readonly path: GeoPoint[] = [];
  private readonly legStart: number[];
  private readonly cum: number[];
  /** Distance along the path of each stop on each transit leg (index 0 = boarding stop). */
  private readonly stopAlong = new Map<number, number[]>();
  private lastAlong = 0;
  /** Arrival sticks: walking off afterwards mustn't turn the trip back into "N m to go". */
  private arrived = false;
  /** When "Get off now" first showed, per transit leg. */
  private readonly offAt = new Map<number, Instant>();

  constructor(
    private readonly itinerary: Itinerary,
    private readonly destination: string,
  ) {
    const legs = itinerary.legs;
    this.legStart = new Array<number>(legs.length + 1).fill(0);
    legs.forEach((leg, i) => {
      const pts = leg.geometry.length ? leg.geometry : [callPoint(leg.from), callPoint(leg.to)];
      const c = this.path.length === 0 ? null : GeoMath.cumulative(this.path);
      this.legStart[i] = c ? c[c.length - 1] : 0;
      if (this.path.length && pts.length && samePoint(this.path[this.path.length - 1], pts[0])) this.path.push(...pts.slice(1));
      else this.path.push(...pts);
    });
    this.cum = GeoMath.cumulative(this.path);
    this.legStart[legs.length] = this.cum.length ? this.cum[this.cum.length - 1] : 0;
    legs.forEach((leg, i) => {
      if (!isTransit(leg.mode)) return;
      const stops = [leg.from, ...leg.intermediateStops, leg.to];
      let prev = this.legStart[i];
      this.stopAlong.set(
        i,
        stops.map((s) => {
          const p = GeoMath.project(this.path, this.cum, callPoint(s), prev, 0, 80);
          const a = Math.min(Math.max(p?.alongM ?? prev, prev), Math.max(this.legStart[i + 1], prev));
          prev = a;
          return a;
        }),
      );
    });
  }

  get totalM(): number {
    return this.legStart[this.legStart.length - 1];
  }

  update(pos: GeoPoint | null, now: Instant, live: ReadonlyMap<number, LiveCall>): GuideState {
    const legs = this.itinerary.legs;
    let along: number | null = null;
    if (pos != null) {
      const proj = GeoMath.project(this.path, this.cum, pos, this.lastAlong, 0, 120);
      // Ignore big backwards jumps (GPS noise) and positions far from the route.
      if (proj != null && proj.offsetM < 400 && proj.alongM > this.lastAlong - 150) along = this.notAheadOfRides(proj.alongM, now, live);
    }
    if (along != null) this.lastAlong = Math.max(this.lastAlong, along);
    let legIndex = pos != null ? this.legAt(this.lastAlong) : this.legByTime(now);
    // At the stop the position is already the walk's start: say "Get off now" there, for a minute at most
    // (a transfer may mean waiting at that same stop).
    const prev = legs[legIndex - 1];
    const offSince = this.offAt.get(legIndex - 1);
    if (pos != null && prev && isTransit(prev.mode) && !isTransit(legs[legIndex].mode) && GeoMath.distance(pos, callPoint(prev.to)) < 40 && (offSince == null || now - offSince < 60)) legIndex--;
    // Waiting at the boarding stop is still the walk's step, which counts down to the bus.
    const board = legs[legIndex];
    if (pos != null && prev && !isTransit(prev.mode) && isTransit(board.mode) && GeoMath.distance(pos, callPoint(board.from)) < 40 && now < (live.get(legIndex)?.expected ?? board.start)) legIndex--;
    const leg = legs[legIndex];
    const total = this.totalM;
    const progress = total > 0 ? Math.min(Math.max(this.lastAlong / total, 0), 1) : 0;

    const dest = callPoint(legs[legs.length - 1].to);
    this.arrived ||= pos != null && (GeoMath.distance(pos, dest) < 60 || this.lastAlong >= total - 40);
    if (this.arrived) {
      return { legIndex, title: S.guide.arrived, text: this.destination, alert: 'ARRIVED', alertKey: 'arrived', progress: 1, finished: true };
    }

    if (!isTransit(leg.mode)) {
      let nextIdx = -1;
      for (let k = legIndex + 1; k < legs.length; k++) {
        if (isTransit(legs[k].mode)) {
          nextIdx = k;
          break;
        }
      }
      if (nextIdx < 0) {
        // Off the planned path (another street) the distance along it stalls: the straight line can only be shorter.
        const remaining = Math.min(Math.max(total - this.lastAlong, 0), pos != null ? GeoMath.distance(pos, dest) : Infinity);
        return {
          legIndex,
          title: leg.mode === 'CAR' ? S.guide.rideTo(this.destination) : S.guide.walkTo(this.destination),
          text: S.guide.toGo(Fmt.distance(remaining)),
          alert: null,
          alertKey: null,
          progress,
          finished: false,
        };
      }
      const next = legs[nextIdx];
      const call = live.get(nextIdx);
      const ride = rideName(next);
      if (rideGone(next, call, now)) {
        return { legIndex, title: S.guide.walkTo(next.from.name), text: S.cards.alreadyPassed(ride, next.from.name), alert: null, alertKey: null, progress, finished: false };
      }
      const isLive = call?.status === 'LIVE';
      const eta = isLive ? call!.expected : next.start;
      const mins = eta != null ? Math.trunc((eta - now + 30) / 60) : null;
      const away = isLive && call!.stopsAway != null && call!.stopsAway >= 1 && call!.stopsAway <= 40 ? call!.stopsAway : null;
      const text =
        (mins == null || mins > 60
          ? S.guide.rideAt(ride, Fmt.when(eta ?? next.start, now)) // "in 1208 min" reads as a bug; after the last bus it's tomorrow's
          : mins <= 0
            ? S.guide.rideArriving(ride, vehicleKind(next.mode))
            : S.guide.rideIn(ride, mins)) +
        (away != null ? ` · ${S.cards.stopsAway(away)}` : '') +
        (isLive ? S.guide.liveTag : '');
      // Stops count too: in traffic the minutes keep slipping while the bus is already close.
      const soon = (mins != null && mins >= 0 && mins <= 3) || (away != null && away <= 2);
      return {
        legIndex,
        title: leg.mode === 'CAR' ? S.cards.dropOffNear(next.from.name) : S.guide.walkTo(next.from.name),
        text,
        alert: soon ? 'BOARD_SOON' : null,
        alertKey: soon ? `board-${nextIdx}` : null,
        progress,
        finished: false,
      };
    }

    // On board: count stops still ahead of us.
    const stops = this.stopAlong.get(legIndex);
    const all = [leg.from, ...leg.intermediateStops, leg.to];
    const remaining =
      stops != null && pos != null
        ? stops.slice(1).filter((a) => a > this.lastAlong + 40).length
        : // Without location, estimate by schedule.
          all.slice(1).filter((s) => (scheduledTime(s) ?? leg.end) > now).length;
    const arriveAt = live.get(legIndex)?.alightExpected ?? leg.end;
    const title = S.guide.rideTitle(rideName(leg), leg.to.name);
    // Past the last stop and away from it, but off the walking path (so the walk leg never matched): off the bus.
    if (remaining <= 0 && pos != null && legIndex + 1 < legs.length && GeoMath.distance(pos, callPoint(leg.to)) > 100) {
      this.lastAlong = Math.max(this.lastAlong, this.legStart[legIndex + 1]);
      return this.update(pos, now, live);
    }
    if (remaining <= 0) {
      if (!this.offAt.has(legIndex)) this.offAt.set(legIndex, now);
      return { legIndex, title: S.guide.getOffNow, text: leg.to.name, alert: 'GET_OFF_NOW', alertKey: `off-${legIndex}`, progress, finished: false };
    }
    if (remaining === 1) {
      return {
        legIndex,
        title: S.cards.getOffNext,
        text: leg.to.name,
        alert: 'GET_OFF_NEXT',
        alertKey: `next-${legIndex}`,
        progress,
        finished: false,
      };
    }
    return {
      legIndex,
      title,
      text: S.guide.stopsLeft(remaining, Fmt.time(arriveAt)),
      alert: null,
      alertKey: null,
      progress,
      finished: false,
    };
  }

  /**
   * No further than the boarding stop of a ride that hasn't left it yet: a walk often runs beside the
   * bus's path (or a later one's), and being near it doesn't put you on board.
   */
  private notAheadOfRides(along: number, now: Instant, live: ReadonlyMap<number, LiveCall>): number {
    const legs = this.itinerary.legs;
    for (let k = 0; k < legs.length && this.legStart[k] < along; k++) {
      // Two minutes' slack: a bus may leave a little early, or the clock run a little late.
      if (isTransit(legs[k].mode) && now < (live.get(k)?.expected ?? legs[k].start) - 120) return Math.min(along, this.legStart[k] - 2);
    }
    return along;
  }

  private legAt(along: number): number {
    for (let i = this.itinerary.legs.length - 1; i >= 0; i--) if (along >= this.legStart[i] - 1) return i;
    return 0;
  }

  private legByTime(now: Instant): number {
    const i = this.itinerary.legs.findIndex((l) => now < l.end);
    return i >= 0 ? i : this.itinerary.legs.length - 1;
  }
}
