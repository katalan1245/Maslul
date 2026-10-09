import { Combine } from '../../data/combine';
import type { LiveCall } from '../../data/eta';
import {
  type GeoPoint,
  type Itinerary,
  type Leg,
  type Place,
  type PlanResult,
  firstTransit,
  isTransit,
  itinDurationSec,
  legOptions,
  placeKey,
  placePoint,
  rideKey,
  scheduledTime,
  transitLegs,
} from '../../data/models';
import { HttpException } from '../../data/http';
import type { OnBoardStart } from '../../data/onBoard';
import { Ranking, type Transfer } from '../../data/ranking';
import type { RideOffer } from '../../data/rides';
import { ShuttleSchedule } from '../../data/shuttles';
import { type Instant, nowSec } from '../../data/time';
import { NoDriveException, TransitRepository } from '../../data/transitRepository';
import type { PlanRequest } from '../../data/transitousApi';
import { DEFAULT_SETTINGS, type Settings, WALK_SPEEDS } from '../../data/userStore';
import { location } from '../../state/location';
import { repo } from '../../state/services';
import { store } from '../../state/store';
import { Model } from '../model';
import { type SearchField, nav } from '../nav';

export type TimeMode = 'NOW' | 'DEPART' | 'ARRIVE';

const sameSettings = (a: Settings, b: Settings) => JSON.stringify(a) === JSON.stringify(b);

/** Route options between two places (RoutesModel in Kotlin). */
export class RoutesModel extends Model {
  timeMode: TimeMode = 'NOW';
  time: Instant | null = null;
  loading = false;
  /** Options are showing but more are still being looked for (a lift's drop-offs, stops to get off at). */
  refining = false;
  error: string | null = null;
  itineraries: Itinerary[] = [];
  walkOnly: Itinerary | null = null;
  loadingMore = false;
  /** Live state of each option's first ride, by itinerary id. */
  readonly live = new Map<string, LiveCall>();
  /** Live state of every line option on each option's ride, by rideKey. */
  readonly rideLive = new Map<string, LiveCall>();
  /** Rides leaving after a tightly-connected leg, by its rideKey: the wait if it's missed. */
  readonly after = new Map<string, Leg[]>();
  /** A lift for the first part of the trip, if someone's giving one. */
  ride: RideOffer | null = null;
  /** Whether there are earlier / later results to page to. */
  canPage = false;

  private nextCursor: string | null = null;
  private prevCursor: string | null = null;
  private fromPoint: GeoPoint | null = null;
  private toPoint: GeoPoint | null = null;
  /** Itineraries as returned (before combining), and extra rides found per stop pair. */
  private raw: Itinerary[] = [];
  private readonly rides = new Map<string, Leg[]>();
  /** When the current results were loaded, to refresh stale "leave now" searches. */
  private searchedAt = 0;
  /** The endpoints of the current results, to tell a refresh from a new search. */
  private searchedFrom: string | null = null;
  private searchedTo: string | null = null;
  /** On board: the trip being ridden and its next stop, where planning starts. */
  private boardStart: OnBoardStart | null = null;
  /** Bumped by each new search, so a superseded one stops writing results. */
  private gen = 0;

  /** Set by the screen: scrolls the list to the top / whether it shows the top. */
  scrollToTop: () => void = () => {};
  atTop: () => boolean = () => true;

  constructor(
    public from: Place,
    public to: Place,
  ) {
    super();
    this.search();
  }

  override start() {
    this.every(25_000, () => void this.refreshLive());
  }

  /** The trip the user is on, when planning from a bus or train they're riding. */
  get onBoardTripId(): string | null {
    return this.from.kind === 'ON_BOARD' ? (this.from.tripId ?? null) : null;
  }

  private get settings(): Settings {
    return store.value.settings ?? DEFAULT_SETTINGS;
  }
  private get walkMps() {
    return WALK_SPEEDS[this.settings.walkSpeed].mps;
  }
  private get rail() {
    return this.settings.railPreference;
  }

  /** Folds options that differ only by line into one, then ranks and adds more lines found per ride. */
  private ranked(list: Itinerary[]): Itinerary[] {
    const arriveBy = this.timeMode === 'ARRIVE';
    const best = [...list].sort((a, b) => Ranking.score(a, arriveBy, this.walkMps, this.rail) - Ranking.score(b, arriveBy, this.walkMps, this.rail));
    const now = nowSec();
    return Ranking.rank(Combine.merge(best), arriveBy, this.walkMps, this.rail).map((itin) =>
      itin.legs.reduce((acc, _, i) => {
        const leg = acc.legs[i];
        const found = this.rides.get(TransitRepository.rideBucket(leg));
        // Already on board: there's no other bus to take for this part.
        const ridden = leg.tripId != null && leg.tripId === this.onBoardTripId;
        return found == null || !isTransit(leg.mode) || ridden ? acc : Combine.addAlternatives(acc, i, found, now);
      }, itin),
    );
  }

  /** Looks up other lines riding the same hops as the top options, then re-combines. */
  private async findAlternatives(gen: number) {
    const modes = this.settings.modes;
    const legs = this.itineraries
      .slice(0, 8)
      .flatMap(transitLegs)
      .filter((l) => l.from.stopId != null && l.to.stopId != null && (l.tripId == null || l.tripId !== this.onBoardTripId))
      .filter((l, i, a) => a.findIndex((x) => TransitRepository.rideBucket(x) === TransitRepository.rideBucket(l)) === i)
      .filter((l) => !this.rides.has(TransitRepository.rideBucket(l)));
    if (legs.length === 0) return;
    const found = await Promise.all(
      legs.map((l) => repo.rideAlternatives(l, modes).then((r) => [TransitRepository.rideBucket(l), r] as const, () => null)),
    );
    if (gen !== this.gen) return;
    const ok = found.filter((f) => f != null);
    if (ok.length === 0) return;
    ok.forEach(([k, v]) => this.rides.set(k, v));
    this.itineraries = this.ranked(this.raw);
    this.changed();
  }

  /** For each top option's tight transfer, looks up the rides after it: the wait if it's missed. */
  private async findRidesAfter(gen: number) {
    const modes = this.settings.modes;
    const next = this.itineraries
      .slice(0, 8)
      .map((i) => this.riskiest(i)?.next)
      .filter((l): l is Leg => l != null)
      .filter((l, i, a) => a.findIndex((x) => rideKey(x) === rideKey(l)) === i)
      .filter((l) => !this.after.has(rideKey(l)));
    // The user's shuttles: their own timetable says what comes next.
    for (const l of next.filter((x) => x.shuttleId != null)) {
      const r = ShuttleSchedule.ridesAfter(store.value.shuttles, l);
      if (r) this.after.set(rideKey(l), r);
    }
    await Promise.all(
      next
        .filter((l) => l.shuttleId == null)
        .map((l) =>
          repo.ridesAfter(l, modes).then(
            (r) => {
              if (gen === this.gen) this.after.set(rideKey(l), r);
            },
            () => {},
          ),
        ),
    );
    this.changed();
  }

  riskiest = (itin: Itinerary): Transfer | null => Ranking.riskiest(itin, this.walkMps);

  /** The next ride if [t]'s connection is missed, if one is known. */
  nextIfMissed = (t: Transfer): Leg | null => Combine.ridesAfter(t.next, this.after.get(rideKey(t.next)) ?? [], 1)[0] ?? null;

  private async resolve(p: Place): Promise<GeoPoint | null> {
    if (p.kind !== 'CURRENT_LOCATION') return placePoint(p);
    return (await location.current().catch(() => null)) ?? location.last;
  }

  private request(cursor: string | null = null): PlanRequest | null {
    const f = this.fromPoint;
    const t = this.toPoint;
    if (f == null || t == null) return null;
    const s = this.settings;
    const board = this.onBoardTripId != null ? (this.boardStart?.next ?? null) : null;
    const within = this.ride?.kind === 'within' ? this.ride : null;
    return {
      from: f,
      to: t,
      // On board: from the next stop, when the timetable has the bus there.
      time: board != null ? (scheduledTime(board) ?? nowSec()) - 60 : this.timeMode === 'NOW' ? null : this.time,
      // A driver heading somewhere leaves at the time given, whichever way it was set.
      arriveBy: board == null && this.ride?.kind !== 'toPlace' && this.timeMode === 'ARRIVE',
      modes: s.modes,
      walkSpeedMps: WALK_SPEEDS[s.walkSpeed].mps,
      maxWalkMinutes: s.maxWalkMinutes,
      wheelchair: s.wheelchair,
      pageCursor: cursor,
      fromStopId: board?.stopId ?? null,
      preTransitModes: within ? 'CAR_DROPOFF' : null,
      maxPreTransitMinutes: within?.minutes ?? null,
      directModes: within ? 'WALK,CAR' : null,
      maxDirectMinutes: within?.minutes ?? null,
    };
  }

  /** A refreshed "leave now" search keeps options whose live first bus can still be caught, if only by hurrying. */
  private stillCatchable(now: Instant): Itinerary[] {
    if (this.timeMode !== 'NOW' || this.ride != null || this.onBoardTripId != null) return [];
    return this.itineraries.filter((itin) => {
      const first = firstTransit(itin);
      if (!first) return false;
      return Combine.onlyByHurrying(itin, itin.legs.indexOf(first), first, now, this.rideLive.get(rideKey(first)));
    });
  }

  search() {
    // Same trip, leaving now: a bus you could still run for shouldn't vanish on refresh.
    const same = placeKey(this.from) === this.searchedFrom && placeKey(this.to) === this.searchedTo;
    const keep = same ? this.stillCatchable(nowSec()) : [];
    const keptLive = keep
      .map((i) => firstTransit(i))
      .filter((l): l is Leg => l != null)
      .map((l) => [rideKey(l), this.rideLive.get(rideKey(l))] as const);
    this.searchedFrom = placeKey(this.from);
    this.searchedTo = placeKey(this.to);
    // A newer search replaces one still running (a lift's or on-board search can take a while).
    const gen = ++this.gen;
    this.refining = false;
    void this.runSearch(gen, keep, keptLive);
  }

  private async runSearch(gen: number, keep: Itinerary[], keptLive: (readonly [string, LiveCall | undefined])[]) {
    const stale = () => gen !== this.gen || this.disposed;
    // New results start at the top.
    this.scrollToTop();
    this.loading = true;
    this.error = null;
    this.itineraries = [];
    this.walkOnly = null;
    this.raw = [];
    this.rides.clear();
    this.live.clear();
    this.rideLive.clear();
    this.searchedAt = nowSec();
    this.canPage = false;
    this.boardStart = null;
    this.changed();
    const boardTrip = this.onBoardTripId;
    this.fromPoint = boardTrip != null ? await this.boardFrom(boardTrip) : await this.resolve(this.from);
    this.toPoint = await this.resolve(this.to);
    if (stale()) return;
    if (this.fromPoint == null || this.toPoint == null) {
      this.error =
        boardTrip != null
          ? "Couldn't follow the ride you're on. Pick it again, or choose a starting point."
          : "Your location isn't available. Allow location access or choose a starting point.";
      this.loading = false;
      this.changed();
      return;
    }
    keptLive.forEach(([k, c]) => c && this.rideLive.set(k, c));
    // The user's own shuttles, looked up alongside (for plain trips).
    const shuttles = store.value.shuttles;
    const shuttleReq = this.request();
    const shuttleOptions =
      shuttles.length > 0 && this.ride == null && boardTrip == null && shuttleReq != null
        ? repo.shuttleOptions(shuttleReq, shuttles).catch(() => [] as Itinerary[])
        : null;
    try {
      const r = await this.planWithRail(gen);
      if (stale()) return;
      const found = [...r.itineraries, ...(r.carOnly ? [r.carOnly] : [])];
      const ids = new Set(found.map((i) => i.id));
      this.raw = [...found, ...keep.filter((i) => !ids.has(i.id))];
      this.itineraries = this.ranked(this.raw);
      this.walkOnly = r.walkOnly != null && itinDurationSec(r.walkOnly) < 45 * 60 && this.ride == null ? r.walkOnly : null;
      this.nextCursor = r.nextCursor;
      this.prevCursor = r.previousCursor;
      this.canPage = this.nextCursor != null || this.prevCursor != null;
      if (found.length === 0 && this.walkOnly == null) this.error = 'No routes found for this time.';
    } catch (e) {
      if (stale()) return;
      // Said apart, so a failure reported from a device names its cause.
      console.warn('Route search failed', e);
      this.error =
        e instanceof NoDriveException
          ? e.message
          : e instanceof HttpException
            ? `The route planner answered with an error (${e.code}). Try again in a moment.`
            : (e as Error)?.name === 'AbortError'
              ? 'The route planner took too long to answer. Try again.'
              : e instanceof TypeError && /network/i.test(e.message)
                ? "Couldn't load routes. Check your connection."
                : `Couldn't show the routes found (${(e as Error)?.message ?? e}).`;
    }
    this.loading = false;
    this.changed();
    const extra = shuttleOptions ? await shuttleOptions : [];
    if (stale()) return;
    if (extra.length > 0) {
      const ids = new Set(this.raw.map((i) => i.id));
      this.raw = [...this.raw, ...extra.filter((i) => !ids.has(i.id))];
      this.itineraries = this.ranked(this.raw);
      this.changed();
    }
    await this.refreshLive();
    await this.findAlternatives(gen);
    await this.refreshLive();
    await this.findRidesAfter(gen);
  }

  /**
   * Plans the trip; when trains are preferred, also asks for rail-only options, which the
   * planner may otherwise leave out for being slower than a bus.
   */
  private async planWithRail(gen: number): Promise<PlanResult> {
    const req = this.request()!;
    const score = (i: Itinerary) => Ranking.score(i, false, this.walkMps, this.rail);
    const ride = this.ride;
    if (ride?.kind === 'toPlace') {
      const options = await this.refined(gen, (show) => repo.rideAlong(req, placePoint(ride.dest), score, show));
      return { itineraries: options, walkOnly: null, nextCursor: null, previousCursor: null };
    }
    const start = this.onBoardTripId != null ? this.boardStart : null;
    if (start) {
      const options = await this.refined(gen, (show) => repo.planOnBoard(req, start, score, show));
      return { itineraries: options, walkOnly: null, nextCursor: null, previousCursor: null };
    }
    const modes = req.modes ?? [];
    const railModes = modes.filter((m) => m !== 'BUS');
    const railOnly =
      this.rail !== 'NONE' && modes.includes('BUS') && railModes.length > 0 ? repo.plan({ ...req, modes: railModes }).catch(() => null) : null;
    const main = await repo.plan(req);
    const extra = (await railOnly)?.itineraries ?? [];
    const known = new Set(main.itineraries.map((i) => i.id));
    return { ...main, itineraries: [...main.itineraries, ...extra.filter((i) => !known.has(i.id))] };
  }

  async more(later: boolean) {
    const cursor = later ? this.nextCursor : this.prevCursor;
    if (cursor == null) return;
    const gen = this.gen;
    this.loadingMore = true;
    this.changed();
    try {
      const r = await repo.plan(this.request(cursor)!);
      if (gen !== this.gen) return;
      const known = new Set(this.raw.map((i) => i.id));
      const fresh = r.itineraries.filter((i) => !known.has(i.id));
      this.raw = later ? [...this.raw, ...fresh] : [...fresh, ...this.raw];
      this.itineraries = this.ranked(this.raw);
      if (later) this.nextCursor = r.nextCursor;
      else this.prevCursor = r.previousCursor;
    } catch {
      // Keep what's shown.
    }
    this.loadingMore = false;
    this.changed();
    await this.refreshLive();
    await this.findAlternatives(gen);
    await this.refreshLive();
    await this.findRidesAfter(gen);
  }

  async refreshLive() {
    const gen = this.gen;
    const now = nowSec();
    // Every bus of every ride (other lines, later ones, an earlier one running late),
    // so each card can show — and take — whichever comes first.
    const legs = this.itineraries
      .flatMap(transitLegs)
      .flatMap(legOptions)
      .filter((l) => l.start < now + 90 * 60)
      .filter((l, i, a) => a.findIndex((x) => rideKey(x) === rideKey(l)) === i);
    const calls = await Promise.all(
      legs.map(async (l) => {
        try {
          return (await repo.worthLive(l, now)) ? await repo.legLive(l, now) : null;
        } catch {
          return null;
        }
      }),
    );
    if (gen !== this.gen || this.disposed) return;
    legs.forEach((l, i) => {
      const c = calls[i];
      if (c) this.rideLive.set(rideKey(l), c);
    });
    // Leaving now: ride the bus that gets there first rather than the timetable's pick, and rank
    // by when the options are expected to get there (a late bus can turn the best into the worst).
    if (this.timeMode === 'NOW') {
      const liveOf = (l: Leg) => this.rideLive.get(rideKey(l));
      const board = this.onBoardTripId;
      const picked = Combine.distinctRides(
        this.itineraries.map((itin) => {
          // The bus you're on is the one you're on, whatever else comes.
          const keep = new Set(itin.legs.map((l, i) => (board != null && l.tripId === board ? i : -1)).filter((i) => i >= 0));
          return Combine.pickBest(itin, now, liveOf, keep);
        }),
      );
      const score = (i: Itinerary) => Ranking.score(Combine.expected(i, liveOf), false, this.walkMps, this.rail);
      this.itineraries = picked.map((i) => [i, score(i)] as const).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
    }
    for (const itin of this.itineraries) {
      const f = firstTransit(itin);
      const c = f ? this.rideLive.get(rideKey(f)) : undefined;
      if (c) this.live.set(itin.id, c);
    }
    this.changed();
  }

  /** Re-runs the search from now (the screen may have sat open for a while). */
  refreshNow = () => {
    this.timeMode = 'NOW';
    this.time = null;
    this.search();
  };

  /** Runs a search that reports options as it finds them, showing each batch while the rest load. */
  private async refined(gen: number, run: (show: (l: Itinerary[]) => void) => Promise<Itinerary[]>): Promise<Itinerary[]> {
    this.refining = true;
    this.changed();
    try {
      return await run((partial) => {
        if (gen !== this.gen || partial.length === 0) return;
        // Better options come in above the ones showing: stay at the top unless the user scrolled down.
        const atTop = this.loading || this.atTop();
        this.raw = partial;
        this.itineraries = this.ranked(partial);
        this.loading = false;
        this.changed();
        if (atTop) setTimeout(() => this.scrollToTop(), 150);
      });
    } finally {
      if (gen === this.gen) {
        this.refining = false;
        this.changed();
      }
    }
  }

  /** Where the trip you're on goes next, as the starting point (and named on the From field). */
  private async boardFrom(tripId: string): Promise<GeoPoint | null> {
    const here = (await location.current().catch(() => null)) ?? location.last;
    const start = await repo.onBoardStart(tripId, here).catch(() => null);
    if (start == null) return null;
    this.boardStart = start;
    this.from = { ...this.from, subtitle: `Next stop: ${start.next.name}` };
    return { lat: start.next.lat, lon: start.next.lon };
  }

  useRide = (r: RideOffer | null) => {
    this.ride = r;
    this.search();
  };

  /** Asks where the driver is heading, then plans the lift along their way. */
  pickDriverDestination = () =>
    nav.push('Search', {
      from: null,
      to: null,
      editing: 'TO',
      single: true,
      title: "Where's the driver going?",
      onDone: (p) => {
        nav.pop();
        this.useRide({ kind: 'toPlace', dest: p });
      },
    });

  /** Searches again only if the options sheet changed something: closing it untouched keeps the routes. */
  optionsClosed = (before: Settings) => {
    if (!sameSettings(store.value.settings, before)) this.search();
  };

  refreshIfStale = () => {
    if (this.timeMode === 'NOW' && !this.loading && nowSec() > this.searchedAt + 150) this.search();
  };

  edit = (field: SearchField) =>
    nav.push('Search', {
      from: this.from,
      to: this.to,
      editing: field,
      onDone: (f, t) => {
        nav.pop();
        this.from = f;
        this.to = t!;
        this.search();
      },
    });

  swap = () => {
    if (this.onBoardTripId != null) return;
    const f = this.from;
    this.from = this.to;
    this.to = f;
    this.search();
  };

  setTime = (mode: TimeMode, t: Instant | null) => {
    this.timeMode = mode;
    this.time = t;
    this.search();
  };

  toggleSaved = () => store.toggleSavedTrip({ from: this.from, to: this.to });

  open = (itin: Itinerary) => nav.push('RouteDetail', { itinerary: itin, from: this.from, to: this.to });

  /** Shows the first vehicle's live location: its trip, with the map following it. */
  openLive = (itin: Itinerary) => {
    const leg = firstTransit(itin);
    if (leg?.tripId == null) return;
    nav.push('Trip', { tripId: leg.tripId, boardStopId: leg.from.stopId, alightStopId: leg.to.stopId, focusVehicle: true });
  };
}
