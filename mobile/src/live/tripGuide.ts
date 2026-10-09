import type { LiveCall } from '../data/eta';
import { GeoMath } from '../data/geo';
import { type GeoPoint, type Itinerary, callPoint, isTransit, lineLabel, samePoint, scheduledTime } from '../data/models';
import type { Instant } from '../data/time';
import { Fmt, modeName } from '../ui/fmt';

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
      if (proj != null && proj.offsetM < 400 && proj.alongM > this.lastAlong - 150) along = proj.alongM;
    }
    if (along != null) this.lastAlong = Math.max(this.lastAlong, along);
    const legIndex = pos != null ? this.legAt(this.lastAlong) : this.legByTime(now);
    const leg = legs[legIndex];
    const total = this.totalM;
    const progress = total > 0 ? Math.min(Math.max(this.lastAlong / total, 0), 1) : 0;

    const dest = callPoint(legs[legs.length - 1].to);
    this.arrived ||= pos != null && (GeoMath.distance(pos, dest) < 60 || this.lastAlong >= total - 40);
    if (this.arrived) {
      return { legIndex, title: "You've arrived", text: this.destination, alert: 'ARRIVED', alertKey: 'arrived', progress: 1, finished: true };
    }

    if (!isTransit(leg.mode)) {
      const verb = leg.mode === 'CAR' ? 'Ride to' : 'Walk to';
      let nextIdx = -1;
      for (let k = legIndex + 1; k < legs.length; k++) {
        if (isTransit(legs[k].mode)) {
          nextIdx = k;
          break;
        }
      }
      if (nextIdx < 0) {
        const remaining = Math.max(total - this.lastAlong, 0);
        return {
          legIndex,
          title: `${verb} ${this.destination}`,
          text: `${Fmt.distance(remaining)} to go`,
          alert: null,
          alertKey: null,
          progress,
          finished: false,
        };
      }
      const next = legs[nextIdx];
      const call = live.get(nextIdx);
      const isLive = call?.status === 'LIVE';
      const eta = isLive ? call!.expected : next.start;
      const mins = eta != null ? Math.trunc((eta - now + 30) / 60) : null;
      const liveTag = isLive ? ' (live)' : '';
      const text =
        `${modeName(next.mode)} ${lineLabel(next)} ` +
        (mins != null ? (mins <= 0 ? `is arriving${liveTag}` : `in ${mins} min${liveTag}`) : `at ${Fmt.time(next.start)}`);
      const soon = mins != null && mins >= 0 && mins <= 3;
      return {
        legIndex,
        title: leg.mode === 'CAR' ? `Get dropped off near ${next.from.name}` : `Walk to ${next.from.name}`,
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
    const title = `${modeName(leg.mode)} ${lineLabel(leg)} → ${leg.to.name}`;
    // Past the last stop and away from it, but off the walking path (so the walk leg never matched): off the bus.
    if (remaining <= 0 && pos != null && legIndex + 1 < legs.length && GeoMath.distance(pos, callPoint(leg.to)) > 100) {
      this.lastAlong = Math.max(this.lastAlong, this.legStart[legIndex + 1]);
      return this.update(pos, now, live);
    }
    if (remaining <= 0) {
      return { legIndex, title: 'Get off now', text: leg.to.name, alert: 'GET_OFF_NOW', alertKey: `off-${legIndex}`, progress, finished: false };
    }
    if (remaining === 1) {
      return {
        legIndex,
        title: 'Get off at the next stop',
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
      text: `${remaining} stops · get off ${Fmt.time(arriveAt)}`,
      alert: null,
      alertKey: null,
      progress,
      finished: false,
    };
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
