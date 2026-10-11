import { LiveCalls, TripTimeline, bestTime, stopsAway } from '../src/data/eta';
import { LiveRepository, forTrip, latestPerVehicle } from '../src/data/liveRepository';
import type { Departure, GeoPoint, Vehicle } from '../src/data/models';
import { LATE_WINDOW_SEC, TransitRepository } from '../src/data/transitRepository';
import { queryTime } from '../src/data/transitousApi';
import { instant, live } from './helpers';

// Five stops 1 km apart due north; 2 minutes between stops.
const kmLat = 1000 / 111_195;
const stops: GeoPoint[] = [0, 1, 2, 3, 4].map((i) => ({ lat: 32.0 + i * kmLat, lon: 34.8 }));
const timeline = new TripTimeline(stops, [0, 120, 240, 360, 480], stops);
const origin = instant('2026-09-27T18:00:00Z');

const vehicle = (kmAlong: number, recordedAt: number, dist: number | null = kmAlong * 1000): Vehicle => ({
  lineRef: '1',
  journeyRef: '42',
  originDeparture: origin,
  lat: 32.0 + kmAlong * kmLat,
  lon: 34.8,
  bearing: 0,
  velocityKmh: 30,
  recordedAt,
  distanceFromStart: dist,
  nextStopCode: null,
  vehicleRef: 'v',
});

/** Instants within a couple of seconds (projection vs. haversine rounding). */
const near = (expected: number, actual: number | null | undefined) => {
  expect(actual).not.toBeNull();
  expect(Math.abs(actual! - expected)).toBeLessThanOrEqual(3);
};

test('stops are located along the shape', () => {
  expect(Math.abs(timeline.stopAlong[0] - 0)).toBeLessThanOrEqual(1);
  expect(Math.abs(timeline.stopAlong[2] - 2000)).toBeLessThanOrEqual(5);
  expect(Math.abs(timeline.stopAlong[4] - 4000)).toBeLessThanOrEqual(10);
});

test('late vehicle shifts downstream predictions', () => {
  // At 1.5 km (scheduled +180 s) but reported at +240 s → one minute late.
  const t = origin + 240;
  const p = timeline.estimate(vehicle(1.5, t), origin, t)!;
  near(60, p.delaySec);
  expect(p.lastPassed).toBe(1);
  expect(p.predicted[1]).toBeNull();
  near(origin + 300, p.predicted[2]);
  near(origin + 540, p.predicted[4]);
  expect(stopsAway(p, 2)).toBe(1);
});

test('early vehicle is not predicted in the past', () => {
  // At 3 km (scheduled +360 s) at +300 s → one minute early.
  const t = origin + 300;
  const p = timeline.estimate(vehicle(3.0, t), origin, t)!;
  near(-60, p.delaySec);
  near(origin + 420, p.predicted[4]);
});

test("an old report doesn't make a bus several stops back arrive now (K2)", () => {
  // Last seen at the first stop 10 minutes ago; 3 stops (3 km) before stop 3.
  const now = origin + 900;
  const p = timeline.estimate(vehicle(0.1, origin + 300), origin, now)!;
  expect(p.predicted[3]!).toBeGreaterThan(now + 60);
});

test('waiting at terminal is on time until departure', () => {
  const t = origin - 120;
  const p = timeline.estimate(vehicle(0, t, 0), origin, t)!;
  expect(p.delaySec).toBe(0);
  expect(p.lastPassed).toBe(-1);
  expect(p.predicted[1]).toBe(origin + 120);
});

test('late departure from terminal', () => {
  const t = origin + 180;
  const p = timeline.estimate(vehicle(0, t, 0), origin, t)!;
  expect(p.delaySec).toBe(180);
  expect(p.predicted[1]).toBe(origin + 300);
});

test('uses reported distance when position is off route', () => {
  const t = origin + 240;
  const off = { ...vehicle(1.5, t), lon: 34.9 }; // ~9 km east
  const p = timeline.estimate(off, origin, t)!;
  expect(Math.abs(p.alongM - 1500)).toBeLessThanOrEqual(1);
});

test('live call statuses', () => {
  const t = origin + 240;
  const v = vehicle(1.5, t);
  const c = LiveCalls.compute(timeline, origin, 3, 4, v, t);
  expect(c.status).toBe('LIVE');
  near(origin + 420, c.expected);
  near(origin + 540, c.alightExpected);
  expect(c.stopsAway).toBe(2);

  expect(LiveCalls.compute(timeline, origin, 1, 4, v, t).status).toBe('PASSED');
  expect(LiveCalls.compute(timeline, origin + 600, 1, null, null, t).status).toBe('SCHEDULED');
  expect(LiveCalls.compute(timeline, origin, 1, null, null, t).status).toBe('UNTRACKED');
  expect(bestTime(c) > t).toBe(true);
});

// ---- Late earlier trips at a stop ------------------------------------------------

const departure = (trip: string, scheduled: number): Departure => ({
  tripId: trip,
  routeId: 'il-Israel-MOT_1',
  mode: 'BUS',
  lineLabel: '16',
  headsign: 'X',
  agency: null,
  routeColor: null,
  scheduled,
  stop: { stopId: 's3', name: 'Stop', code: null, lat: stops[3].lat, lon: stops[3].lon, scheduledArrival: scheduled, scheduledDeparture: scheduled },
});

test('late earlier trip is shown ahead of the next scheduled one', () => {
  // Trip A left at 18:00 and is due at stop 3 at 18:06, but it's 5 min late: at 18:08 it
  // is 1.5 km along. Trip B left at 18:10 and is still at the terminal, due at 18:16.
  const now = origin + 480;
  const originB = origin + 600;
  const a = { ...vehicle(1.5, now), journeyRef: '100' };
  const b = { ...vehicle(0, now, 0), journeyRef: '200', originDeparture: originB };
  const vehicles = [b, a];

  const depA = departure('A', origin + 360);
  const depB = departure('B', originB + 360);
  // The stop-times query starting "now" only returns B; the look-back query returns A.
  const deps = TransitRepository.mergeDepartures([depB], [depA, depB], now);
  expect(deps.map((d) => d.tripId)).toEqual(['A', 'B']);

  const liveA = LiveCalls.compute(timeline, origin, 3, null, forTrip(vehicles, '100', origin), now);
  const liveB = LiveCalls.compute(timeline, originB, 3, null, forTrip(vehicles, '200', originB), now);
  expect(liveA.status).toBe('LIVE');
  expect(liveA.vehicle).toEqual(a);
  expect(liveB.vehicle).toEqual(b);
  // A is ~1.5 km from the stop: arriving within a couple of minutes, not at B's 18:16.
  expect(bestTime(liveA) < now + 4 * 60).toBe(true);
  expect(bestTime(liveA) < bestTime(liveB)).toBe(true);

  const board = TransitRepository.arrangeBoard(
    [
      { departure: depB, live: liveB },
      { departure: depA, live: liveA },
    ],
    now,
  );
  expect(board.map((e) => e.departure.tripId)).toEqual(['A', 'B']);
});

test('ETA follows newer positions', () => {
  const now = origin + 480;
  const first = LiveCalls.compute(timeline, origin, 3, null, vehicle(1.5, now), now);
  const later = now + 60;
  const second = LiveCalls.compute(timeline, origin, 3, null, vehicle(2.5, later), later);
  expect(bestTime(second) < bestTime(first)).toBe(true);
  expect(second.stopsAway).toBe(1);
});

test('overdue untracked and passed trips leave the board', () => {
  const now = origin + 600;
  const gone = departure('gone', origin + 360);
  const passed = departure('passed', origin + 500);
  const next = departure('next', origin + 900);
  const board = TransitRepository.arrangeBoard(
    [
      { departure: next, live: live('SCHEDULED', next.scheduled, null) },
      { departure: gone, live: live('UNTRACKED', gone.scheduled, null) },
      { departure: passed, live: live('PASSED', passed.scheduled, null) },
    ],
    now,
  );
  expect(board.map((e) => e.departure.tripId)).toEqual(['next']);
  // Nothing older than the look-back window is kept.
  expect(TransitRepository.mergeDepartures([], [departure('old', now - (LATE_WINDOW_SEC + 60))], now)).toEqual([]);
});

test('forTrip prefers the newest report', () => {
  const t = origin + 300;
  const old = { ...vehicle(1.0, t - 120), vehicleRef: 'x' };
  const fresh = { ...vehicle(1.5, t), vehicleRef: 'y' };
  expect(forTrip([old, fresh], '42', origin)).toBe(fresh);
  expect(forTrip([old, fresh], null, origin)).toBe(fresh);
  const dup = { ...vehicle(1.5, t), vehicleRef: 'x' };
  expect(latestPerVehicle([old, dup])).toEqual([dup]);
  expect(LiveRepository).toBeDefined();
});

test('query time has whole seconds', () => {
  // MOTIS ignores fractional-second times and answers from the start of the day.
  expect(queryTime(instant('2026-09-28T16:00:00Z') + 0.123456)).toBe('2026-09-28T16:00:00Z');
});

test('a board keeps the next few of each line (upstream 1.2.2)', () => {
  const now = origin;
  const dep = (line: string, min: number): Departure => ({ ...departure(`t${line}-${min}`, now + min * 60), routeId: `il-Israel-MOT_${line}` });
  const deps = [dep('1', -5), ...[1, 2, 3, 4, 5, 6].map((i) => dep('1', i * 5)), dep('2', 4), dep('2', 50)];
  const kept = TransitRepository.perLine(deps, now);
  // Line 1: the one whose time passed (it may be late) and the next three; line 2 both.
  expect(new Set(kept.map((d) => d.tripId))).toEqual(new Set(['t1--5', 't1-5', 't1-10', 't1-15', 't2-4', 't2-50']));
  expect(kept).toHaveLength(6);
});
