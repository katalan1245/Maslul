import { type Progress, TripTimeline } from '../src/data/eta';
import { type Departure, type GeoPoint, type StopCall, type Vehicle, callPoint, makeLeg } from '../src/data/models';
import { OnBoard, isLiveCandidate } from '../src/data/onBoard';
import { instant } from './helpers';

const now = instant('2026-10-05T07:30:00Z');
const at = (min: number) => now + min * 60;
const p = (km: number): GeoPoint => ({ lat: 32.0 + km / 111.195, lon: 34.8 });

/** Stops every 1 km northward, one minute apart, starting at minute [first]. */
const calls = (first: number, n = 6): StopCall[] =>
  Array.from({ length: n }, (_, i) => ({
    stopId: `s${i}`, name: `Stop ${i}`, code: `${i}`, lat: p(i).lat, lon: 34.8, scheduledArrival: at(first + i), scheduledDeparture: at(first + i),
  }));

const timeline = (c: StopCall[]) => new TripTimeline(c.map(callPoint), c.map((_, i) => i * 60), c.map(callPoint));

test('next stop is the one ahead of where you are', () => {
  const c = calls(-3);
  // 2.4 km along: past stop 2, so stop 3 is next — whatever the timetable says.
  expect(OnBoard.nextStop(c, timeline(c), p(2.4), null, now)).toBe(3);
  // Pulling in to a stop counts as there: plan from the one after.
  expect(OnBoard.nextStop(c, timeline(c), p(1.99), null, now)).toBe(3);
  expect(OnBoard.nextStop(c, timeline(c), p(1.9), null, now)).toBe(2);
});

test('without a fix on the route it falls back to the timetable', () => {
  const c = calls(-3);
  // Far off the route (a bad fix): by time, stops 0–3 are due by now, so stop 4 is next.
  expect(OnBoard.nextStop(c, timeline(c), { lat: 31.0, lon: 35.5 }, null, now)).toBe(4);
  expect(OnBoard.nextStop(c, null, null, null, now)).toBe(4);
  // After the last stop's time, the last stop.
  expect(OnBoard.nextStop(c, null, null, null, at(30))).toBe(5);
});

const vehicle = (km: number, line = '100', journey = '1001', ageSec = 30): Vehicle => ({
  lineRef: line, journeyRef: journey, originDeparture: instant('2026-10-05T07:00:00Z'), lat: p(km).lat, lon: p(km).lon,
  bearing: null, velocityKmh: null, recordedAt: now - ageSec, distanceFromStart: null, nextStopCode: null, vehicleRef: `v${journey}`,
});

const departure = (trip: string, line: string, scheduled: number, stopKm = 0.2): Departure => ({
  tripId: trip, routeId: `il-Israel-MOT_${line}`, mode: 'BUS', lineLabel: line, headsign: 'Haifa', agency: null, routeColor: null,
  scheduled, stop: { stopId: 'x', name: 'Here', code: null, lat: p(stopKm).lat, lon: 34.8, scheduledArrival: null, scheduledDeparture: scheduled },
});

test("a ride tracked far away isn't yours", () => {
  const trip = '20261005_10:00_il-Israel-MOT_1001_051026';
  const far = new Map([['100', [vehicle(20)]]]);
  const near = new Map([['100', [vehicle(0.3)]]]);
  expect(OnBoard.fromDepartures(p(0), [[200, departure(trip, '100', at(-2))]], far, now)).toEqual([]);
  const out = OnBoard.fromDepartures(p(0), [[200, departure(trip, '100', at(-2))]], near, now);
  expect(out).toHaveLength(1);
  expect(isLiveCandidate(out[0])).toBe(true);
  expect(Math.abs(out[0].distanceM - 300)).toBeLessThanOrEqual(5);
});

test('timetable rides must be due around now', () => {
  const deps: [number, Departure][] = [
    [200, departure('20261005_10:00_il-Israel-MOT_1_051026', '7', at(-5))],
    [200, departure('20261005_10:00_il-Israel-MOT_2_051026', '8', at(-60))],
    [200, departure('20261005_10:00_il-Israel-MOT_3_051026', '9', at(40))],
    [1500, departure('20261005_10:00_il-Israel-MOT_4_051026', '10', at(0))],
  ];
  const out = OnBoard.fromDepartures(p(0), deps, new Map(), now);
  expect(out.map((c) => c.lineLabel)).toEqual(['7']);
  expect(out[0].vehicle).toBeNull();
});

test('live vehicles nearest first, then the timetable', () => {
  const deps: [number, Departure][] = [
    [100, departure('20261005_10:00_il-Israel-MOT_1_051026', '7', at(0))],
    [300, departure('20261005_10:00_il-Israel-MOT_1001_051026', '100', at(-1))],
  ];
  const ranked = OnBoard.rank(OnBoard.fromDepartures(p(0), deps, new Map([['100', [vehicle(0.4)]]]), now), now);
  expect(ranked.map((c) => c.lineLabel)).toEqual(['100', '7']);
});

test('old positions reach further', () => {
  // A position two minutes old may be a kilometre and a half behind the bus you're on.
  const fresh = vehicle(0, '100', '1001', 10);
  const old = vehicle(0, '100', '1001', 120);
  expect(OnBoard.reach(old, now) > OnBoard.reach(fresh, now) + 1000).toBe(true);
  const byLine = new Map([
    ['1', [vehicle(1.5, '1', 'a', 120)]],
    ['2', [vehicle(1.5, '2', 'b', 5)]],
  ]);
  expect(OnBoard.nearVehicles(p(0), byLine, now).map((v) => v.lineRef)).toEqual(['1']);
});

test('tries every stop left on a short ride and a spread on a long one', () => {
  expect(OnBoard.alightStops(calls(0, 8), 2, p(100))).toEqual([3, 4, 5, 6, 7]);
  const picks = OnBoard.alightStops(calls(0, 40), 1, p(23.2));
  expect(picks.length).toBeLessThanOrEqual(12);
  expect(picks).toContain(23);
  expect(picks[picks.length - 1]).toBe(39);
  expect(picks.every((i) => i > 1)).toBe(true);
});

test('staying on is the trip between two of its stops', () => {
  const c = calls(0, 6);
  const trip = makeLeg({
    mode: 'BUS', from: c[0], to: c[5], start: at(0), end: at(5), headsign: 'Haifa', routeShortName: '480', tripId: 'trip-480',
    intermediateStops: c.slice(1, 5), geometry: c.map(callPoint),
  });
  const ride = OnBoard.ride(trip, c, timeline(c), 2, 4);
  expect(ride.from.name).toBe('Stop 2');
  expect(ride.to.name).toBe('Stop 4');
  expect(ride.start).toBe(at(2));
  expect(ride.end).toBe(at(4));
  expect(ride.intermediateStops.map((s) => s.name)).toEqual(['Stop 3']);
  expect(ride.tripId).toBe('trip-480');
  const itin = OnBoard.compose(ride, null);
  expect(itin.transfers).toBe(0);
  expect(itin.end).toBe(at(4));
});

test('the bus is at least as far as its last report', () => {
  const c = calls(-3);
  const t = timeline(c);
  // Your fix matches just before stop 2; the bus last reported past stop 3.
  const progress: Progress = { vehicle: vehicle(3.5), alongM: 3500, delaySec: 0, lastPassed: 3, predicted: c.map(() => null), stale: false };
  expect(OnBoard.nextStop(c, t, p(1.5), progress, now)).toBe(4);
  // And when your fix is the further one, it wins.
  expect(OnBoard.nextStop(c, t, p(4.5), progress, now)).toBe(5);
});

test('a train signed with its number has no destination', () => {
  expect(OnBoard.placeName('785')).toBe('');
  expect(OnBoard.placeName('Haifa')).toBe('Haifa');
});
