import { Combine } from './combine';
import { type LiveApproach, type LiveCall, LiveCalls, type Progress, TripTimeline, liveCall } from './eta';
import { GeoMath, TripIds, tripNumberOf } from './geo';
import { LiveRepository, type Snapshot, forTrip } from './liveRepository';
import {
  type Departure,
  type GeoPoint,
  type Itinerary,
  type Leg,
  type Line,
  type LineRoute,
  type LineStop,
  type Place,
  type PlanResult,
  type Ride,
  type StopCall,
  type TransitMode,
  type Vehicle,
  callPoint,
  isTransit,
  itinDurationSec,
  legLineRef,
  placePoint,
  rideKey,
  rideTripNumber,
  routeDestination,
  routeLabel,
  scheduledTime,
  transitLegs,
  vehiclePoint,
} from './models';
import { NominatimApi } from './nominatimApi';
import { type BoardCandidate, OnBoard, type OnBoardStart } from './onBoard';
import { PhotonApi } from './photonApi';
import { Ranking } from './ranking';
import { RidePlanner } from './rides';
import { ShuttleSchedule } from './shuttles';
import { StrideApi, groupLines } from './strideApi';
import { type Instant, type LocalDate, localParts, nowSec, plusDays, startOfDay, today } from './time';
import { AddressSearch } from './addressSearch';
import { type PlanRequest, TransitousApi, planDefaults } from './transitousApi';
import type { Shuttle } from './userStore';
import { distinctBy, fixed, groupBy, maxBy, minBy, sortedBy } from './util';

export interface LineDetail {
  route: LineRoute;
  stops: LineStop[];
  shape: GeoPoint[];
  rides: Ride[];
  timeline: TripTimeline;
  /** Transitous stop id of the first stop, to look up trips departing from it. */
  firstStopId: string | null;
}

/** No driving route between the places of a RideOffer. */
export class NoDriveException extends Error {
  constructor() {
    super("Couldn't find a driving route for this ride.");
    this.name = 'NoDriveException';
  }
}

/** Neither the line's own day nor recent days have stop data for it. */
export class LineUnavailableException extends Error {
  constructor() {
    super('No stop data for this line right now. Please try again later.');
    this.name = 'LineUnavailableException';
  }
}

/** A live vehicle on a line, with its estimated progress along the line's stops. */
export interface LineVehicle {
  vehicle: Vehicle;
  progress: Progress;
  ride: Ride | null;
}

/** Next arrival at one stop of a line. */
export interface StopArrival {
  time: Instant;
  live: boolean;
  delaySec: number;
  journeyRef: string | null;
  /** When the live vehicle last reported its position; null for timetable arrivals. */
  recordedAt: Instant | null;
}

export interface BoardEntry {
  departure: Departure;
  live: LiveCall | null;
}

/** A line (one direction) serving a stop near the user, with its next departures there. */
export interface NearbyLine {
  departure: Departure;
  stop: Place;
  distanceM: number;
  next: Instant[];
}

/** Requests at once when trying several starting points (see onward). */
const FAN_OUT = 2;
const ONWARD_TIMEOUT_MS = 15_000;
/** How far back to look for late trips whose scheduled time at a stop already passed. */
export const LATE_WINDOW_SEC = 90 * 60;
const PATTERN_LOOKBACK_DAYS = 7;

/** A small least-recently-used cache. */
class Lru<V> {
  private readonly map = new Map<string, V>();
  constructor(private readonly max: number) {}
  get(k: string): V | undefined {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: string, v: V) {
    this.map.delete(k);
    this.map.set(k, v);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
  }
}

/** Runs at most [n] tasks at once. */
export function limiter(n: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= n) await new Promise<void>((r) => waiting.push(r));
    running++;
    try {
      return await task();
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

async function orDefault<T>(p: Promise<T>, d: T): Promise<T> {
  try {
    return await p;
  } catch {
    return d;
  }
}

const shifted = (itin: Itinerary, sec: number): Itinerary => ({
  ...itin,
  start: itin.start + sec,
  end: itin.end + sec,
  legs: itin.legs.map((l) => ({ ...l, start: l.start + sec, end: l.end + sec })),
});

const pointKey = (p: GeoPoint) => `GeoPoint(lat=${p.lat}, lon=${p.lon})`;
const callsOf = (trip: Leg): StopCall[] => [trip.from, ...trip.intermediateStops, trip.to];

/** Options gathered from several starting points, reported as they come in (see rideAlong, planOnBoard). */
class Found {
  private readonly all: Itinerary[] = [];
  constructor(
    private readonly score: (i: Itinerary) => number,
    private readonly progress: (l: Itinerary[]) => void,
  ) {}
  add(options: Itinerary[]) {
    if (options.length === 0) return;
    this.all.push(...options);
    this.progress(this.result());
  }
  result(): Itinerary[] {
    return RidePlanner.distinct(RidePlanner.inReach([...this.all]), this.score);
  }
}

export class TransitRepository {
  private readonly tripCache = new Lru<Leg>(80);
  private readonly rideCache = new Lru<Leg[]>(60);
  private readonly carCache = new Lru<Leg>(24);
  language: string | null = null;

  constructor(
    readonly live: LiveRepository,
    readonly transitous = new TransitousApi(),
    private readonly photon = new PhotonApi(),
    private readonly stride = new StrideApi(),
    private readonly nominatim = new NominatimApi(),
  ) {}

  // ---- Places ---------------------------------------------------------------------

  async searchPlaces(text: string, near: GeoPoint | null): Promise<Place[]> {
    const q = AddressSearch.parse(text);
    const a = orDefault(this.transitous.geocode(q.text, near), [] as Place[]);
    const b = orDefault(this.photon.search(q.text, near), [] as Place[]);
    // With a house number, also look up the bare street in case the number isn't mapped.
    const c = q.number != null ? orDefault(this.photon.search(q.rest, near), [] as Place[]) : null;
    const merged = TransitRepository.mergePlaces(await a, await b);
    if (c == null) return merged;
    const candidates = [...merged, ...(await c)];
    const resolved = AddressSearch.resolve(q, candidates);
    if (resolved) return resolved.slice(0, 14);
    const n = await orDefault(this.nominatim.search(q.text), [] as Place[]);
    return (AddressSearch.resolve(q, [...n, ...candidates]) ?? merged).slice(0, 14);
  }

  reverseGeocode(p: GeoPoint): Promise<Place | null> {
    return orNull(this.transitous.reverseGeocode(p));
  }

  nearbyStops(p: GeoPoint): Promise<Place[]> {
    return this.transitous.nearbyStops(p);
  }

  /** Stops and stations matching [text], biased towards [near]. */
  async searchStops(text: string, near: GeoPoint | null): Promise<Place[]> {
    return (await this.transitous.geocode(text, near, null, 'STOP')).filter((p) => p.kind === 'STOP' && p.stopId != null);
  }

  // ---- Routing --------------------------------------------------------------------

  plan(req: PlanRequest): Promise<PlanResult> {
    return this.transitous.plan({ ...req, language: this.language });
  }

  /**
   * Direct rides (any line) between [leg]'s boarding and alighting stops around its time,
   * so an option can offer every line that makes the same hop. Cached per 15-minute bucket.
   */
  async rideAlternatives(leg: Leg, modes: readonly TransitMode[]): Promise<Leg[]> {
    // The user's own shuttle isn't in the open data; its timetable is (see ShuttleSchedule).
    if (leg.shuttleId != null) return [];
    const key = TransitRepository.rideBucket(leg);
    const cached = this.rideCache.get(key);
    if (cached) return cached;
    const r = await this.transitous.plan({
      from: callPoint(leg.from),
      to: callPoint(leg.to),
      fromStopId: leg.from.stopId,
      toStopId: leg.to.stopId,
      // From well before the ride: an earlier bus running late may come first.
      time: leg.start - Combine.LATE_SEC,
      modes,
      maxWalkMinutes: 3,
      maxTransfers: 0,
      minTransferMinutes: 0,
      additionalTransferMinutes: 0,
      numItineraries: 24,
      // Cover every ride from the late window up to the latest alternative.
      searchWindowSec: Combine.LATE_SEC + Combine.WINDOW_SEC + 10 * 60,
      language: this.language,
    });
    const rides = r.itineraries
      .map((i) => transitLegs(i))
      .filter((t) => t.length === 1)
      .map((t) => t[0])
      .filter((l) => Combine.sameRide(l, leg));
    this.rideCache.set(key, rides);
    return rides;
  }

  /**
   * The next direct rides (any line) between [leg]'s stops after it leaves: how long the wait
   * is if it's missed. Looks up to an hour ahead; cached per ride.
   */
  async ridesAfter(leg: Leg, modes: readonly TransitMode[]): Promise<Leg[]> {
    if (leg.shuttleId != null) return [];
    const key = `after|${leg.from.stopId ?? pointKey(callPoint(leg.from))}|${leg.to.stopId ?? pointKey(callPoint(leg.to))}|${leg.start}`;
    const cached = this.rideCache.get(key);
    if (cached) return cached;
    const r = await this.transitous.plan({
      from: callPoint(leg.from),
      to: callPoint(leg.to),
      fromStopId: leg.from.stopId,
      toStopId: leg.to.stopId,
      time: leg.start + 60,
      modes,
      maxWalkMinutes: 3,
      maxTransfers: 0,
      minTransferMinutes: 0,
      additionalTransferMinutes: 0,
      numItineraries: 5,
      searchWindowSec: 60 * 60,
      language: this.language,
    });
    const single = r.itineraries.map(transitLegs).filter((t) => t.length === 1).map((t) => t[0]);
    const rides = Combine.ridesAfter({ ...leg, alternatives: [] }, single, 5);
    this.rideCache.set(key, rides);
    return rides;
  }

  // ---- Rides, shuttles and being on board --------------------------------------------

  /** Driving route from [from] to [to] (a single car leg with its geometry), leaving at [at]. */
  async carRoute(from: GeoPoint, to: GeoPoint, at: Instant | null = null): Promise<Leg | null> {
    const key = `${fixed(from.lat, 4)},${fixed(from.lon, 4)}>${fixed(to.lat, 4)},${fixed(to.lon, 4)}`;
    const c = this.carCache.get(key);
    if (c) {
      // Same road; only the times move.
      const shift = at != null ? at - c.start : 0;
      return { ...c, start: c.start + shift, end: c.end + shift };
    }
    const r = await this.transitous.plan({
      from,
      to,
      time: at,
      directModes: 'CAR',
      maxDirectMinutes: 6 * 60,
      directOnly: true,
      numItineraries: 1,
      language: this.language,
    });
    const car = r.carOnly?.legs.find((l) => l.mode === 'CAR');
    if (!car) return null;
    this.carCache.set(key, car);
    return car;
  }

  /**
   * Options for a lift with a driver heading to [driverDest]: get out at the drop-off along the
   * way that gets you to [req]'s destination best, then continue by transit. [score] ranks.
   * [progress] gets the options found so far, each time a drop-off is done.
   */
  async rideAlong(
    req: PlanRequest,
    driverDest: GeoPoint,
    score: (i: Itinerary) => number,
    progress: (l: Itinerary[]) => void = () => {},
  ): Promise<Itinerary[]> {
    const r0 = planDefaults(req);
    const leave = Math.floor(r0.time ?? nowSec());
    const route = await this.carRoute(r0.from, driverDest, leave);
    if (route == null) throw new NoDriveException();
    const found = new Found(score, progress);
    const gate = limiter(FAN_OUT);
    // The likeliest drop-offs first (by where you're going, and the driver's end), so they show soonest.
    const drops = sortedBy(
      RidePlanner.dropOffs(route, r0.to).map((d, i) => ({ d, i })),
      ({ d }) => GeoMath.distance(d.point, r0.to),
    );
    await Promise.all(
      drops.map(({ d, i }) =>
        gate(async () => {
          const car = RidePlanner.carLeg(route, d, leave);
          const r = await this.onward({ ...req, from: d.point, fromStopId: null, time: car.end + RidePlanner.STOP_SEC });
          if (r == null) return;
          const walk = r.walkOnly != null && itinDurationSec(r.walkOnly) <= r0.maxWalkMinutes * 60 ? r.walkOnly : null;
          const best = sortedBy(r.itineraries, score).slice(0, 3);
          found.add([...best, ...(walk ? [walk] : [])].map((it) => RidePlanner.compose(car, it, `ride${i}:${it.id}`)));
        }),
      ),
    );
    return found.result();
  }

  /** Trips that take one of the user's [shuttles] between [req]'s endpoints. */
  async shuttleOptions(req: PlanRequest, shuttles: Shuttle[], now: Instant = nowSec()): Promise<Itinerary[]> {
    const r = planDefaults(req);
    const lists = await Promise.all(
      ShuttleSchedule.relevant(shuttles, r.from, r.to).map((s) => orDefault(this.shuttleOptionsFor(req, s, now), [] as Itinerary[])),
    );
    return lists.flat();
  }

  /**
   * Up to two trips riding [s]: getting to it (planned to arrive just before it leaves), the
   * shuttle, and on from it; with its next departures as alternatives.
   */
  private async shuttleOptionsFor(req: PlanRequest, s: Shuttle, now: Instant): Promise<Itinerary[]> {
    const r = planDefaults(req);
    const geometry = orNull(this.carRoute(placePoint(s.from), placePoint(s.to))).then((c) => c?.geometry ?? []);
    const t = r.time ?? now;
    const accessM = GeoMath.distance(r.from, placePoint(s.from));
    const walkSec = Math.trunc((accessM * 1.3) / r.walkSpeedMps);
    // A lower bound on getting to the shuttle, so departures that can't be made aren't tried.
    const reachSec = ShuttleSchedule.isNear(r.from, placePoint(s.from)) ? 0 : walkSec <= r.maxWalkMinutes * 60 ? walkSec : Math.trunc(accessM / 20);
    const ride = s.rideMinutes * 60;
    const departures = r.arriveBy
      ? ShuttleSchedule.departures(s, t - 4 * 3600, t - ride).reverse()
      : ShuttleSchedule.departures(s, t + reachSec, t + 4 * 3600);
    const out: Itinerary[] = [];
    for (const dep of departures.slice(0, 2)) {
      const leg = ShuttleSchedule.leg(s, dep);
      const [a, e] = await Promise.all([this.accessTo(req, s, dep), this.egressFrom(req, s, leg.end, r.arriveBy ? t : null)]);
      if (a == null || e == null) continue;
      // Leaving after now (or the chosen time), arriving in time.
      if ((a[0]?.start ?? dep) < (r.arriveBy ? now : t) - 60) continue;
      const legs = [...a, leg, ...e];
      out.push({
        id: `shuttle:${s.id}:${dep}`,
        start: legs[0].start,
        end: legs[legs.length - 1].end,
        transfers: legs.filter((l) => isTransit(l.mode)).length - 1,
        legs,
      });
      if (out.length >= 2) break;
    }
    const path = await geometry;
    const earliest = minBy(out, (i) => i.start)?.start ?? t;
    const later = ShuttleSchedule.departures(s, earliest, t + 5 * 3600).map((d) => ShuttleSchedule.leg(s, d, path));
    // Two shuttles making the same connection: the later one, with less waiting at the other end.
    const groups = groupBy(out, (itin) => transitLegs(itin).filter((l) => l.shuttleId == null).map(rideKey).join('\u0000'));
    return [...groups.values()]
      .map((g) => maxBy(g, (i) => i.legs[0].start)!)
      .map((itin) => {
        const i = itin.legs.findIndex((l) => l.shuttleId === s.id);
        const drawn = path.length === 0 ? itin : { ...itin, legs: itin.legs.map((l, k) => (k === i ? { ...l, geometry: path } : l)) };
        return Combine.addAlternatives(drawn, i, later, now);
      });
  }

  /**
   * The next few ways on from [req]'s start at its time, for one of several starting points tried
   * (drop-offs, stops to get off at). Transitous serves a client's requests one at a time, so
   * these go FAN_OUT at once and are kept small; one that stalls is given up on.
   */
  private onward(req: PlanRequest, count = 3): Promise<PlanResult | null> {
    return withTimeout(
      this.plan({ ...req, arriveBy: false, pageCursor: null, numItineraries: count, searchWindowSec: 20 * 60 }),
      ONWARD_TIMEOUT_MS,
    );
  }

  /** Getting to [s]'s first stop by [dep] (latest start first): no legs when you're there already, null when it can't be made. */
  private async accessTo(req: PlanRequest, s: Shuttle, dep: Instant): Promise<Leg[] | null> {
    const r0 = planDefaults(req);
    if (ShuttleSchedule.isNear(r0.from, placePoint(s.from))) return [];
    const by = dep - 60;
    const r = await this.plan({ ...req, to: placePoint(s.from), toStopId: null, time: by, arriveBy: true, pageCursor: null, numItineraries: 3 });
    // A direct walk comes timed from the request; walk so as to arrive just before the shuttle.
    const walk = r.walkOnly != null && itinDurationSec(r.walkOnly) <= r0.maxWalkMinutes * 60 ? shifted(r.walkOnly, by - r.walkOnly.end) : null;
    const options = [...r.itineraries, ...(walk ? [walk] : [])].filter((i) => !(i.legs[i.legs.length - 1].end > dep));
    let best: Itinerary | null = null;
    for (const o of options) {
      // Latest start wins; then fewer transfers (Kotlin's maxWith on (start, -transfers)).
      if (best == null || o.legs[0].start > best.legs[0].start || (o.legs[0].start === best.legs[0].start && -o.transfers > -best.transfers)) {
        best = o;
      }
    }
    return best?.legs ?? null;
  }

  /** From [s]'s last stop to the destination, leaving at [arrive] (and in by [by] when given). */
  private async egressFrom(req: PlanRequest, s: Shuttle, arrive: Instant, by: Instant | null): Promise<Leg[] | null> {
    const r0 = planDefaults(req);
    if (ShuttleSchedule.isNear(placePoint(s.to), r0.to)) return [];
    const r = await this.plan({ ...req, from: placePoint(s.to), fromStopId: null, time: arrive + 60, arriveBy: false, pageCursor: null, numItineraries: 3 });
    const walk = r.walkOnly != null && itinDurationSec(r.walkOnly) <= r0.maxWalkMinutes * 60 ? shifted(r.walkOnly, arrive - r.walkOnly.start) : null;
    const options = [...r.itineraries, ...(walk ? [walk] : [])].filter((i) => by == null || !(i.legs[i.legs.length - 1].end > by));
    return minBy(options, (i) => Ranking.score(i, false, r0.walkSpeedMps))?.legs ?? null;
  }

  /** Rides you might be on at [here]: timetable rides due around now at the stops around you, and live vehicles close by. */
  async boardCandidates(here: GeoPoint, now: Instant = nowSec()): Promise<BoardCandidate[]> {
    const snapshot = orNull(this.live.snapshot());
    const stops = (await orDefault(this.transitous.nearbyStops(here, 0.01), [] as Place[]))
      .filter((s) => s.stopId != null && GeoMath.distance(here, placePoint(s)) <= OnBoard.STOP_RADIUS_M)
      .slice(0, 8);
    const departures = (
      await Promise.all(
        stops.map(async (st) => {
          const d = GeoMath.distance(here, placePoint(st));
          const deps = await orDefault(
            this.transitous.stopTimes(st.stopId!, {
              time: now - OnBoard.BEFORE_SEC,
              count: 40,
              language: this.language,
              windowSec: OnBoard.BEFORE_SEC + OnBoard.AFTER_SEC,
            }),
            [] as Departure[],
          );
          return deps.map((x): [number, Departure] => [d, x]);
        }),
      )
    ).flat();
    const byLine = (await snapshot)?.byLine ?? new Map<string, Vehicle[]>();
    const timetabled = OnBoard.fromDepartures(here, departures, byLine, now);
    const matched = new Set(timetabled.map((c) => c.vehicle).filter((v) => v != null));
    const loose = OnBoard.nearVehicles(here, byLine, now)
      .filter((v) => !matched.has(v))
      .slice(0, 20);
    // Live vehicles the timetable didn't account for (e.g. on a highway): named from their line.
    let routes = new Map<string, LineRoute>();
    if (loose.length > 0) {
      const refs = [...new Set(loose.filter((v) => /^[+-]?\d+$/.test(v.lineRef)).map((v) => Number(v.lineRef)))];
      const day = today();
      const found = await orDefault(
        (async () => {
          const r = await this.stride.routesByLineRef(refs, day);
          return r.length ? r : this.stride.routesByLineRef(refs, plusDays(day, -1));
        })(),
        [] as LineRoute[],
      );
      routes = new Map(found.map((r) => [String(r.lineRef), r]));
    }
    const tracked = loose.flatMap((v): BoardCandidate[] => {
      const r = routes.get(v.lineRef);
      if (!r) return [];
      return [
        {
          tripId: null,
          lineRef: v.lineRef,
          lineLabel: routeLabel(r),
          mode: r.mode,
          headsign: OnBoard.placeName(routeDestination(r)),
          agencyName: r.agency,
          agencyId: String(r.operatorRef),
          routeColor: null,
          vehicle: v,
          distanceM: GeoMath.distance(here, vehiclePoint(v)),
        },
      ];
    });
    return OnBoard.rank([...timetabled, ...tracked], now);
  }

  /** The Transitous trip of [c] (a live vehicle's, found through the stop it's heading to), or null. */
  async boardTripId(c: BoardCandidate, now: Instant = nowSec()): Promise<string | null> {
    if (c.tripId != null) return c.tripId;
    const v = c.vehicle;
    if (v == null) return null;
    const nearby = await orDefault(this.transitous.nearbyStops(vehiclePoint(v), 0.02), [] as Place[]);
    const next = v.nextStopCode != null ? nearby.find((s) => s.subtitle?.split(' ')[0] === `#${v.nextStopCode}`) : undefined;
    for (const stop of distinctBy([...(next ? [next] : []), ...nearby.slice(0, 3)], (s) => s.stopId)) {
      const stopId = stop.stopId;
      if (stopId == null) continue;
      const deps = await orDefault(
        this.transitous.stopTimes(stopId, { time: now - 90 * 60, count: 60, language: this.language, windowSec: 3 * 3600 }),
        [] as Departure[],
      );
      const sameLine = deps.filter((d) => TripIds.lineRef(d.routeId) === v.lineRef);
      const match =
        sameLine.find((d) => {
          const p = TripIds.parse(d.tripId);
          return p != null && tripNumberOf(p) === v.journeyRef;
        }) ??
        sameLine.find((d) => {
          const p = TripIds.parse(d.tripId);
          return p != null && Math.abs(p.originDeparture - v.originDeparture) < 60;
        });
      if (match) return match.tripId;
    }
    return null;
  }

  /**
   * Ways on from the trip being ridden ([start]): staying on to one of its later stops and
   * going on from there, or getting off at the next stop to change. The planner alone won't
   * reliably offer staying on: from the next stop, a faster line leaving that minute beats it.
   */
  async planOnBoard(
    req: PlanRequest,
    start: OnBoardStart,
    score: (i: Itinerary) => number,
    progress: (l: Itinerary[]) => void = () => {},
  ): Promise<Itinerary[]> {
    const r0 = planDefaults(req);
    const trip = start.trip;
    const calls = callsOf(trip);
    const timeline = TripTimeline.fromTrip(trip);
    const tripId = trip.tripId;
    const found = new Found(score, progress);
    const gate = limiter(FAN_OUT);
    // Every option starts on this bus, from the stop it last passed: they all start now, so they
    // compare by when they get there (getting off to wait for a later one loses to staying on).
    const from = Math.max(start.nextIndex - 1, 0);
    const toNext = from < start.nextIndex ? OnBoard.ride(trip, calls, timeline, from, start.nextIndex, tripId) : null;
    const next = calls[start.nextIndex];
    // The stop nearest where you're going first, then changing at the next stop, then the rest.
    const stops = sortedBy(OnBoard.alightStops(calls, start.nextIndex, r0.to), (i) => GeoMath.distance(callPoint(calls[i]), r0.to));
    const stays = [...stops.slice(0, 1), -1, ...stops.slice(1)];
    const offTrip = (i: Itinerary) => transitLegs(i).every((l) => l.tripId !== tripId);
    await Promise.all(
      stays.map((k) =>
        gate(async () => {
          if (k < 0) {
            // Getting off at the next stop to change there.
            const t = next.scheduledArrival ?? next.scheduledDeparture;
            if (t == null) return;
            const r = await this.onward({ ...req, fromStopId: next.stopId, time: t + OnBoard.CHANGE_SEC }, 4);
            if (r == null) return;
            found.add(
              sortedBy(r.itineraries.filter(offTrip), score)
                .slice(0, 4)
                .map((c) => (toNext ? OnBoard.compose(toNext, c) : c)),
            );
            return;
          }
          const ride = OnBoard.ride(trip, calls, timeline, from, k, tripId);
          if (ShuttleSchedule.isNear(callPoint(calls[k]), r0.to)) {
            found.add([OnBoard.compose(ride, null)]);
            return;
          }
          const r = await this.onward({ ...req, from: callPoint(calls[k]), fromStopId: calls[k].stopId, time: ride.end + 60 });
          if (r == null) return;
          const walk = r.walkOnly != null && itinDurationSec(r.walkOnly) <= r0.maxWalkMinutes * 60 ? r.walkOnly : null;
          // Boarding this same trip again from a later stop is just staying on longer.
          found.add([...sortedBy(r.itineraries.filter(offTrip), score).slice(0, 2), ...(walk ? [walk] : [])].map((it) => OnBoard.compose(ride, it)));
        }),
      ),
    );
    return found.result();
  }

  /** Where trip [tripId] (which the user is on, at [here]) goes next. */
  async onBoardStart(tripId: string, here: GeoPoint | null, now: Instant = nowSec()): Promise<OnBoardStart | null> {
    const trip = await this.trip(tripId);
    if (trip == null) return null;
    const calls = callsOf(trip);
    const timeline = TripTimeline.fromTrip(trip);
    const parsed = TripIds.parse(tripId);
    const ref = legLineRef(trip);
    const v = forTrip(ref != null ? await this.live.vehiclesForLine(ref) : [], parsed ? tripNumberOf(parsed) : null, parsed?.originDeparture ?? null);
    const origin = scheduledTime(trip.from) ?? parsed?.originDeparture ?? null;
    const progress = timeline != null && v != null && origin != null ? timeline.estimate(v, origin, now) : null;
    const i = OnBoard.nextStop(calls, timeline, here, progress, now);
    return { trip: { ...trip, tripId }, nextIndex: i, next: calls[i] };
  }

  async trip(tripId: string): Promise<Leg | null> {
    const cached = this.tripCache.get(tripId);
    if (cached) return cached;
    const t = await orNull(this.transitous.trip(tripId, this.language));
    if (t) this.tripCache.set(tripId, t);
    return t;
  }

  /** Live state of a transit leg: where its vehicle is and when it reaches the boarding stop. */
  async legLive(leg: Leg, now: Instant = nowSec()): Promise<LiveCall | null> {
    const tripId = leg.tripId;
    if (tripId == null) return null;
    const parsed = TripIds.parse(tripId);
    if (parsed == null) return null;
    const trip = await this.trip(tripId);
    if (trip == null) return null;
    const timeline = TripTimeline.fromTrip(trip);
    if (timeline == null) return null;
    const calls = callsOf(trip);
    const board = TransitRepository.indexOfStop(calls, leg.from);
    if (board == null) return null;
    const alight = TransitRepository.indexOfStop(calls, leg.to, board + 1);
    const ref = legLineRef(leg);
    const vehicles = ref != null ? await this.live.vehiclesForLine(ref) : [];
    const v = forTrip(vehicles, tripNumberOf(parsed), parsed.originDeparture);
    const origin = scheduledTime(calls[0]) ?? parsed.originDeparture;
    return LiveCalls.compute(timeline, origin, board, alight, v, now);
  }

  /**
   * Whether [leg] is worth a live lookup at [now]: it hasn't finished on the timetable
   * (with [graceSec] leeway), or it's scheduled within the late window and its vehicle is on
   * the road — a bus running late whose timetable slot is long gone. Only reads the
   * snapshot, so it's cheap to ask for every late candidate.
   */
  async worthLive(leg: Leg, now: Instant, graceSec = 0): Promise<boolean> {
    if (leg.end > now - graceSec) return true;
    if (leg.start < now - LATE_WINDOW_SEC) return false;
    const parsed = TripIds.parse(leg.tripId);
    if (parsed == null) return false;
    const ref = legLineRef(leg);
    const vehicles = ref != null ? await this.live.vehiclesForLine(ref) : [];
    return forTrip(vehicles, tripNumberOf(parsed), parsed.originDeparture) != null;
  }

  /** Route and stops from a live vehicle up to [leg]'s boarding stop, so the bus isn't drawn floating. */
  async approach(leg: Leg, call: LiveCall): Promise<LiveApproach | null> {
    const p = call.status === 'LIVE' ? call.progress : null;
    if (p == null || leg.tripId == null) return null;
    const trip = await this.trip(leg.tripId);
    if (trip == null) return null;
    const timeline = TripTimeline.fromTrip(trip);
    if (timeline == null) return null;
    const calls = callsOf(trip);
    const board = TransitRepository.indexOfStop(calls, leg.from);
    if (board == null) return null;
    const path = timeline.slice(p.alongM, timeline.stopAlong[board]);
    const from = Math.min(Math.max(p.lastPassed + 1, 0), board);
    const stops = calls.slice(from, board).map(callPoint);
    return { path: path.length ? path : [vehiclePoint(p.vehicle), callPoint(leg.from)], stops };
  }

  /** The full trip plus its live vehicle progress, for the trip screen. */
  async tripLive(tripId: string, now: Instant = nowSec()): Promise<[Leg, Progress | null] | null> {
    const trip = await this.trip(tripId);
    if (trip == null) return null;
    const parsed = TripIds.parse(tripId);
    const timeline = TripTimeline.fromTrip(trip);
    if (timeline == null) return [trip, null];
    const ref = legLineRef(trip);
    const v = forTrip(ref != null ? await this.live.vehiclesForLine(ref) : [], parsed ? tripNumberOf(parsed) : null, parsed?.originDeparture ?? null);
    const origin = scheduledTime(trip.from) ?? parsed?.originDeparture ?? null;
    if (origin == null) return [trip, null];
    return [trip, v ? timeline.estimate(v, origin, now) : null];
  }

  // ---- Stops ----------------------------------------------------------------------

  async stopBoard(stopId: string, now: Instant = nowSec()): Promise<BoardEntry[]> {
    // Stop times start at the requested time, so a late bus whose timetable slot here has
    // already passed would be missing entirely; fetch the recent past too.
    const upcoming = this.transitous.stopTimes(stopId, { count: 40, language: this.language });
    // The whole window, however busy the stop: a count alone can end well short of now.
    const recent = orDefault(
      this.transitous.stopTimes(stopId, { time: now - LATE_WINDOW_SEC, count: 10, language: this.language, windowSec: LATE_WINDOW_SEC }),
      [] as Departure[],
    );
    const deps = TransitRepository.mergeDepartures(await upcoming, await recent, now);
    const snapshot = await this.live.snapshot();
    return this.boardEntries(deps, snapshot, now);
  }

  private async boardEntries(deps: Departure[], snapshot: Snapshot | null, now: Instant): Promise<BoardEntry[]> {
    const entries = await Promise.all(
      deps.map(async (d): Promise<BoardEntry> => {
        const lineRef = TripIds.lineRef(d.routeId);
        const parsed = TripIds.parse(d.tripId);
        const soon = d.scheduled < now + 60 * 60;
        const vehicle = forTrip(
          lineRef != null ? (snapshot?.byLine.get(lineRef) ?? []) : [],
          parsed ? tripNumberOf(parsed) : null,
          parsed?.originDeparture ?? null,
        );
        let live: LiveCall | null = null;
        if (soon && parsed != null && vehicle != null) {
          live = await orNull(
            (async () => {
              const trip = await this.trip(d.tripId);
              if (trip == null) return null;
              const tl = TripTimeline.fromTrip(trip);
              if (tl == null) return null;
              const idx = TransitRepository.indexOfStop(callsOf(trip), d.stop);
              if (idx == null) return null;
              return LiveCalls.compute(tl, scheduledTime(trip.from) ?? parsed.originDeparture, idx, null, vehicle, now);
            })(),
          );
        } else if (parsed != null && soon) {
          live = liveCall(now < parsed.originDeparture + 60 ? 'SCHEDULED' : 'UNTRACKED', d.scheduled, null);
        }
        return { departure: d, live };
      }),
    );
    return TransitRepository.arrangeBoard(entries, now);
  }

  // ---- Lines ----------------------------------------------------------------------

  /** Lines leaving from the stops nearest to [here], each at its closest stop. */
  async nearbyLines(here: GeoPoint, stops: Place[], now: Instant = nowSec()): Promise<NearbyLine[]> {
    const boards = await Promise.all(
      stops
        .filter((s) => s.stopId != null)
        .slice(0, 8)
        .map((st) => orNull(this.transitous.stopTimes(st.stopId!, { count: 25, language: this.language }).then((deps) => ({ st, deps })))),
    );
    const rows = boards
      .filter((b) => b != null)
      .flatMap(({ st, deps }) => {
        const d = GeoMath.distance(here, placePoint(st));
        return deps.filter((x) => x.scheduled > now - 60).map((dep) => ({ st, d, dep }));
      });
    const lines = [...groupBy(rows, (r) => `${r.dep.routeId ?? r.dep.lineLabel}|${r.dep.headsign}`).values()].map((g) => {
      const nearest = Math.min(...g.map((r) => r.d));
      const atStop = sortedBy(
        g.filter((r) => r.d === nearest),
        (r) => r.dep.scheduled,
      );
      return { departure: atStop[0].dep, stop: atStop[0].st, distanceM: nearest, next: atStop.slice(0, 3).map((r) => r.dep.scheduled) };
    });
    // Group by ~100 m bands so nearby stops mix, then soonest first.
    return sortedBy(
      lines,
      (l) => Math.trunc(l.distanceM / 100),
      (l) => l.next[0],
    );
  }

  /** Resolves a GTFS route id (from a departure) to today's Stride line route. */
  async lineRoute(routeId: string | null): Promise<LineRoute | null> {
    const s = TripIds.lineRef(routeId);
    if (s == null || !/^[+-]?\d+$/.test(s)) return null;
    const ref = Number(s);
    return (await this.onFeedDay((day) => this.stride.routesByLineRef([ref], day)))[0] ?? null;
  }

  /**
   * [get] on today's Stride feed, else yesterday's (today's loads shortly after midnight), else the
   * newest Stride has: over a weekend that can be Thursday's.
   */
  private async onFeedDay<T>(get: (day: LocalDate) => Promise<T[]>): Promise<T[]> {
    const day = today();
    for (const d of [day, plusDays(day, -1)]) {
      const r = await get(d);
      if (r.length) return r;
    }
    const latest = await orNull(this.stride.latestDate());
    return latest != null && latest < plusDays(day, -1) ? get(latest) : [];
  }

  async searchLines(query: string, mode: TransitMode | null): Promise<Line[]> {
    let routes = await this.onFeedDay((day) => this.stride.searchRoutes(query, day, mode));
    if (mode != null) routes = routes.filter((r) => r.mode === mode);
    return groupLines(routes);
  }

  async lineVariants(route: LineRoute): Promise<LineRoute[]> {
    let list = await orDefault(this.stride.lineVariants(route.operatorRef, route.mkt, route.date), [route]);
    if (list.length === 0) list = [route];
    return sortedBy(
      list,
      (r) => r.direction,
      (r) => r.alternative,
    );
  }

  /** Refreshes a (possibly saved, older) route to today's gtfs route id. */
  async currentRoute(route: LineRoute): Promise<LineRoute> {
    const day = today();
    if (route.date === day) return route;
    return (await orNull(this.stride.routesByLineRef([route.lineRef], day)))?.[0] ?? route;
  }

  async lineDetail(route: LineRoute): Promise<LineDetail> {
    const date = route.date;
    const pattern = await this.patternStops(route, date);
    if (pattern == null) throw new LineUnavailableException();
    const [stops, sameDay] = pattern;
    const first = this.transitStop(stops[0]).then((p) => p?.stopId ?? null);
    // Stride's per-day stop ids only match when the stops came from the route's own day.
    const strideRides = sameDay ? await orDefault(this.stride.departures(route.gtfsRouteId, stops[0].gtfsStopId, date), [] as Ride[]) : [];
    const firstStopId = await first;
    const rides = strideRides.length ? strideRides : ((await orNull(this.transitousRides(route, stops, firstStopId, date))) ?? []);
    // Prefer a daytime ride; any ride of the pattern shares the shape.
    let shape: GeoPoint[] = [];
    for (const r of sortedBy(rides, (x) => (localParts(x.departure).hour < 5 ? 1 : 0)).slice(0, 2)) {
      const t = await this.trip(await this.rideTripIdFor(route, stops, firstStopId, r));
      if (t != null && t.geometry.length >= 2) {
        shape = t.geometry;
        break;
      }
    }
    return { route, stops, shape, rides, timeline: TripTimeline.fromLineStops(stops, shape), firstStopId };
  }

  /** Transitous trip id of one of [detail]'s rides, e.g. to open it on the trip screen. */
  rideTripId(detail: LineDetail, ride: Ride): Promise<string> {
    return this.rideTripIdFor(detail.route, detail.stops, detail.firstStopId, ride);
  }

  /**
   * Stride and Transitous load different daily GTFS feeds, whose trip ids share the trip
   * number but not the feed-date suffix ("279000_270926" vs "279000_280926"), so a Stride
   * ride is looked up by trip number among the departures from its first stops.
   */
  private async rideTripIdFor(route: LineRoute, stops: LineStop[], firstStopId: string | null, ride: Ride): Promise<string> {
    if (ride.tripId != null) return ride.tripId;
    for (let i = 0; i <= Math.min(1, stops.length - 1); i++) {
      const stopId = await this.transitStopId(stops, i, firstStopId);
      if (stopId == null) continue;
      const at = ride.departure + stops[i].offsetSec;
      const deps = (await orNull(this.transitous.stopTimes(stopId, { time: at - 60, count: 20, language: this.language }))) ?? [];
      const m = TransitRepository.matchTripId(deps, ride, route.lineRef, stops[i].offsetSec);
      if (m != null) return m;
    }
    return TripIds.fromJourney(ride.journeyRef, ride.departure, route.date);
  }

  /**
   * Transitous stop id of stop [i]. Transitous lists no departures at a terminus where
   * boarding isn't allowed (an "operational stop"), so callers also try the second stop.
   */
  private async transitStopId(stops: LineStop[], i: number, firstStopId: string | null): Promise<string | null> {
    return i === 0 ? firstStopId : ((await this.transitStop(stops[i]))?.stopId ?? null);
  }

  /**
   * The route's ordered stops, and whether they came from [date] itself. Stride lists a day's
   * rides before it has loaded their stops (for some routes, for hours), so when the day has
   * none yet, fall back to the most recent earlier day of the same line ref (same pattern).
   */
  private async patternStops(route: LineRoute, date: LocalDate): Promise<[LineStop[], boolean] | null> {
    const own = await this.rideStopsOf(route.gtfsRouteId, date);
    if (own != null) return [own, true];
    for (let back = 1; back <= PATTERN_LOOKBACK_DAYS; back++) {
      const day = plusDays(date, -back);
      const stops = await orNull(
        (async () => {
          const r = (await this.stride.routesByLineRef([route.lineRef], day))[0];
          return r ? this.rideStopsOf(r.gtfsRouteId, day) : null;
        })(),
      );
      if (stops != null) return [stops, false];
    }
    return null;
  }

  /** Stops of the first ride of [gtfsRouteId] that has any, or null. */
  private async rideStopsOf(gtfsRouteId: number, date: LocalDate): Promise<LineStop[] | null> {
    for (const ride of (await this.stride.rides(gtfsRouteId)).slice(0, 3)) {
      const stops = await this.stride.rideStops(ride.id, date);
      if (stops.length >= 2) return stops;
      // Stops are loaded per day, not per ride: one empty ride means the rest are empty too.
      if (stops.length === 0) return null;
    }
    return null;
  }

  /** The day's departures of [route] from its first stop, from Transitous, when Stride has none. */
  private async transitousRides(route: LineRoute, stops: LineStop[], firstStopId: string | null, date: LocalDate): Promise<Ride[]> {
    const dayStart = startOfDay(date);
    for (let i = 0; i <= Math.min(1, stops.length - 1); i++) {
      const stopId = await this.transitStopId(stops, i, firstStopId);
      if (stopId == null) continue;
      const deps = await this.transitous.stopTimes(stopId, { time: dayStart, count: 500, language: this.language });
      const rides = TransitRepository.ridesFromDepartures(deps, route.lineRef, dayStart, stops[i].offsetSec);
      if (rides.length > 0) return rides;
    }
    return [];
  }

  /** Transitous stop for a Stride stop: Stride knows stop codes, Transitous needs the GTFS stop_id. */
  async transitStop(s: LineStop): Promise<Place | null> {
    const near = await orDefault(this.transitous.nearbyStops({ lat: s.lat, lon: s.lon }, 0.0015), [] as Place[]);
    return near.find((p) => p.subtitle?.startsWith(`#${s.code}`) === true) ?? null;
  }

  async lineVehicles(detail: LineDetail, now: Instant = nowSec()): Promise<LineVehicle[]> {
    const vehicles = await this.live.vehiclesForLine(String(detail.route.lineRef));
    // Like Kotlin's associateBy: the last ride per trip number.
    const byRef = new Map<string, Ride>(detail.rides.map((r) => [rideTripNumber(r), r]));
    const out = vehicles.flatMap((v): LineVehicle[] => {
      const ride =
        (v.journeyRef != null ? byRef.get(v.journeyRef) : undefined) ??
        detail.rides.find((r) => Math.abs(r.departure - v.originDeparture) < 60) ??
        null;
      const p = detail.timeline.estimate(v, ride?.departure ?? v.originDeparture, now);
      if (p == null || p.lastPassed >= detail.stops.length - 1) return [];
      return [{ vehicle: v, progress: p, ride }];
    });
    return [...out].sort((a, b) => b.progress.alongM - a.progress.alongM);
  }

  /** Upcoming arrivals at stop [index]: live vehicles first, then the timetable. */
  arrivalsAt(detail: LineDetail, vehicles: LineVehicle[], index: number, now: Instant, limit = 4): StopArrival[] {
    const out: StopArrival[] = [];
    const liveRefs = new Set<string>();
    for (const lv of vehicles) {
      if (lv.vehicle.journeyRef != null) liveRefs.add(lv.vehicle.journeyRef);
      const t = lv.progress.predicted[index];
      if (t == null) continue;
      out.push({ time: t, live: true, delaySec: lv.progress.delaySec, journeyRef: lv.vehicle.journeyRef, recordedAt: lv.vehicle.recordedAt });
    }
    const offset = detail.stops[index].offsetSec;
    for (const r of detail.rides) {
      if (liveRefs.has(rideTripNumber(r))) continue;
      const t = r.departure + offset;
      // Trips that should have left over 3 min ago but aren't tracked are probably gone.
      if (t > now && r.departure > now - 180) out.push({ time: t, live: false, delaySec: 0, journeyRef: r.journeyRef, recordedAt: null });
    }
    return sortedBy(out, (a) => a.time).slice(0, limit);
  }

  // ---- Pure helpers (companion object in Kotlin) -------------------------------------

  /** Upcoming stop times plus recently-scheduled ones (possibly running late), without duplicates. */
  static mergeDepartures(upcoming: Departure[], recent: Departure[], now: Instant): Departure[] {
    const seen = new Set<string>();
    return sortedBy(
      [...recent, ...upcoming]
        .filter((d) => d.scheduled > now - LATE_WINDOW_SEC)
        .filter((d) => {
          const k = `${d.tripId}|${d.scheduled}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }),
      (d) => d.scheduled,
    );
  }

  /**
   * Drops trips that already left (passed, or overdue and not tracked) and orders the rest
   * by best known arrival, so a late earlier trip shows ahead of the next scheduled one.
   */
  static arrangeBoard(entries: BoardEntry[], now: Instant): BoardEntry[] {
    const best = (e: BoardEntry) => (e.live ? (e.live.expected ?? e.live.scheduled) : e.departure.scheduled);
    return sortedBy(
      entries.filter((e) => e.live?.status !== 'PASSED').filter((e) => best(e) > now - 60),
      best,
    );
  }

  /**
   * Departures of line [lineRef] during the service day starting at [dayStart], as rides.
   * [offsetSec] is the stop's scheduled offset from the first stop, where rides depart.
   */
  static ridesFromDepartures(deps: Departure[], lineRef: number, dayStart: Instant, offsetSec = 0): Ride[] {
    const end = dayStart + 30 * 3600;
    const rides = deps
      .filter((d) => TripIds.lineRef(d.routeId) === String(lineRef))
      .flatMap((d): Ride[] => {
        const p = TripIds.parse(d.tripId);
        return p ? [{ journeyRef: p.gtfsTripId, departure: d.scheduled - offsetSec, tripId: d.tripId }] : [];
      })
      .filter((r) => !(r.departure < dayStart) && r.departure < end);
    return sortedBy(distinctBy(rides, (r) => r.journeyRef), (r) => r.departure);
  }

  /**
   * Transitous trip id of [ride] among departures from a stop [offsetSec] into the line:
   * same trip number, else same line at the same time.
   */
  static matchTripId(deps: Departure[], ride: Ride, lineRef: number, offsetSec = 0): string | null {
    const at = ride.departure + offsetSec;
    const byNumber = deps.find((d) => {
      const p = TripIds.parse(d.tripId);
      return p != null && tripNumberOf(p) === rideTripNumber(ride);
    });
    if (byNumber) return byNumber.tripId;
    return deps.find((d) => TripIds.lineRef(d.routeId) === String(lineRef) && d.scheduled === at)?.tripId ?? null;
  }

  static rideBucket(leg: Leg): string {
    return `${leg.from.stopId ?? pointKey(callPoint(leg.from))}|${leg.to.stopId ?? pointKey(callPoint(leg.to))}|${Math.floor(leg.start / 900)}`;
  }

  static indexOfStop(calls: StopCall[], target: StopCall, from = 0): number | null {
    for (let i = from; i < calls.length; i++) if (target.stopId != null && calls[i].stopId === target.stopId) return i;
    // Fall back to the geographically closest stop.
    let best = -1;
    let bestD = Number.MAX_VALUE;
    for (let i = from; i < calls.length; i++) {
      const d = GeoMath.distance(callPoint(calls[i]), callPoint(target));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best >= 0 && bestD < 150 ? best : null;
  }

  /** Interleaves two ranked result lists, dropping near-duplicates. */
  static mergePlaces(primary: Place[], secondary: Place[]): Place[] {
    const out: Place[] = [];
    const maxLen = Math.max(primary.length, secondary.length);
    for (let i = 0; i < maxLen; i++) {
      for (const p of [primary[i], secondary[i]]) {
        if (p == null) continue;
        // Same name close by, or the same name and subtitle within a large site (a campus's
        // several entries): rows nobody could tell apart.
        const dup = out.some((o) => {
          if (o.name.toLowerCase() !== p.name.toLowerCase()) return false;
          const d = GeoMath.distance(placePoint(o), placePoint(p));
          return d < 300 || (d < 1500 && (o.subtitle ?? '') === (p.subtitle ?? ''));
        });
        if (!dup) out.push(p);
      }
    }
    return out.slice(0, 14);
  }
}

