import type { LiveCall } from '../src/data/eta';
import { type GeoPoint, type Itinerary, type StopCall, makeLeg } from '../src/data/models';
import { setLanguage } from '../src/i18n';
import { TripGuide } from '../src/live/tripGuide';
import { instant } from './helpers';

const kmLat = 1000 / 111_195;
const pt = (km: number): GeoPoint => ({ lat: 32.0 + km * kmLat, lon: 34.8 });
const t0 = instant('2026-09-27T18:00:00Z');
const none = new Map<number, LiveCall>();

const call = (name: string, km: number, sec: number): StopCall => ({
  stopId: `s${name}`, name, code: null, lat: pt(km).lat, lon: pt(km).lon, scheduledArrival: t0 + sec, scheduledDeparture: t0 + sec,
});
const at = (km: number): StopCall => ({ stopId: null, name: '', code: null, lat: pt(km).lat, lon: pt(km).lon, scheduledArrival: null, scheduledDeparture: null });

// Walk 300 m to stop A, then a bus A → E with stops every km.
const walk = makeLeg({ mode: 'WALK', from: at(-0.3), to: call('A', 0, 240), start: t0, end: t0 + 240, distanceM: 300, geometry: [pt(-0.3), pt(0)] });
const bus = makeLeg({
  mode: 'BUS', from: call('A', 0, 300), to: call('E', 4, 780), start: t0 + 300, end: t0 + 780,
  headsign: 'E', routeShortName: '5', agencyName: 'Dan', tripId: 't', routeId: 'il-Israel-MOT_1',
  intermediateStops: [call('B', 1, 420), call('C', 2, 540), call('D', 3, 660)], geometry: [pt(0), pt(4)],
});
const itin: Itinerary = { id: 'x', start: t0, end: t0 + 780, transfers: 0, legs: [walk, bus] };

test('follows the trip', () => {
  const g = new TripGuide(itin, 'Home');
  const s0 = g.update(pt(-0.3), t0, none);
  expect(s0.legIndex).toBe(0);
  expect(s0.title).toBe('Walk to A');

  const s1 = g.update(pt(0.5), t0 + 360, none);
  expect(s1.legIndex).toBe(1);
  expect(s1.text.startsWith('4 stops')).toBe(true);

  expect(g.update(pt(2.5), t0 + 600, none).text.startsWith('2 stops')).toBe(true);

  const s2 = g.update(pt(3.2), t0 + 680, none);
  expect(s2.alert).toBe('GET_OFF_NEXT');
  expect(s2.text).toBe('E');

  const s3 = g.update(pt(3.995), t0 + 780, none);
  expect(s3.alert).toBe('ARRIVED');
  expect(s3.finished).toBe(true);
});

test('boarding alert when ride is close', () => {
  const s = new TripGuide(itin, 'Home').update(pt(-0.1), t0 + 150, none);
  expect(s.alert).toBe('BOARD_SOON');
  expect(s.alertKey).toBe('board-1');
});

test('a bus more than an hour away is given as a time, with its day if not today', () => {
  // The evening before (Sat 19:05 for Sun 21:05): after the last bus, the planner returns tomorrow's.
  const s = new TripGuide(itin, 'Home').update(pt(-0.3), t0 + 300 - 26 * 3600, none);
  expect(s.text).toBe('Bus 5 at Sun 21:05');
  expect(new TripGuide(itin, 'Home').update(pt(-0.3), t0 + 300 - 2 * 3600, none).text).toBe('Bus 5 at 21:05');
});

test('ignores GPS jumps backwards', () => {
  const g = new TripGuide(itin, 'Home');
  g.update(pt(3.2), t0 + 680, none);
  const s = g.update(pt(0.2), t0 + 690, none);
  expect(s.legIndex).toBe(1);
  expect(s.alert).toBe('GET_OFF_NEXT');
});

test('a lift reads as a ride, not a walk', () => {
  // A 3 km lift, then the bus from A.
  const car = { ...walk, mode: 'CAR' as const, from: at(-3), start: t0 - 300, distanceM: 3000, geometry: [pt(-3), pt(-0.3)], fixed: true };
  const g = new TripGuide({ id: 'c', start: car.start, end: bus.end, transfers: 0, legs: [car, walk, bus] }, 'Home');
  const s = g.update(pt(-2), t0 - 200, none);
  expect(s.legIndex).toBe(0);
  expect(s.title).toBe('Get dropped off near A');
  expect(g.update(pt(-0.2), t0 + 100, none).title).toBe('Walk to A');
});

// The bus to E, then a 1 km walk east to the destination.
const east = (km: number, kmEast: number): GeoPoint => ({ lat: pt(km).lat, lon: 34.8 + (kmEast * 1000) / (111_320 * Math.cos((pt(km).lat * Math.PI) / 180)) });
const walkOn = makeLeg({
  mode: 'WALK', from: call('E', 4, 780), to: { ...at(4), lon: east(4, 1).lon }, start: t0 + 780, end: t0 + 1500, distanceM: 1000,
  geometry: [pt(4), east(4, 1)],
});
const withWalk: Itinerary = { id: 'w', start: t0, end: t0 + 1500, transfers: 0, legs: [walk, bus, walkOn] };

test('leaves the bus step once away from the last stop, even off the walking path', () => {
  const g = new TripGuide(withWalk, 'Office');
  g.update(pt(3.2), t0 + 680, none);
  expect(g.update(pt(3.97), t0 + 780, none).title).toBe("Get off now");
  // Walked 500 m south of the stop: nowhere near the eastward walking path.
  const s = g.update(pt(3.5), t0 + 900, none);
  expect(s.legIndex).toBe(2);
  expect(s.title).toBe('Walk to Office');
  expect(s.alert).toBeNull();
});

test('stays arrived after walking away from the destination', () => {
  // The walk turns north for its last 80 m; arriving within 60 m of the door leaves us ~50 m short along the path.
  const door = east(4.08, 1);
  const lastWalk = makeLeg({ ...walkOn, to: { ...walkOn.to, lat: door.lat, lon: door.lon }, geometry: [pt(4), east(4, 1), door] });
  const g = new TripGuide({ ...withWalk, legs: [walk, bus, lastWalk] }, 'Office');
  g.update(pt(3.2), t0 + 680, none);
  g.update(east(4, 0.5), t0 + 1100, none);
  expect(g.update(east(4.03, 0.97), t0 + 1500, none).finished).toBe(true);
  // Back at the start: a big backwards jump, so the position along the trip doesn't move.
  const s = g.update(pt(-0.3), t0 + 1600, none);
  expect(s.finished).toBe(true);
  expect(s.title).toBe("You've arrived");
});

test('counts stops from where the bus really is on a finely drawn route', () => {
  // Real routes have a vertex every few metres; the position must not lag behind on them.
  const dense = (from: number, to: number) => Array.from({ length: Math.round((to - from) / 0.02) + 1 }, (_, i) => pt(from + i * 0.02));
  // Stops stand on the pavement, 15 m beside the drawn line, and that's where the phone reports.
  const side = (s: StopCall): StopCall => ({ ...s, lon: east((s.lat - 32.0) / kmLat, 0.015).lon });
  const kerbBus = { ...bus, from: side(bus.from), to: side(bus.to), intermediateStops: bus.intermediateStops.map(side), geometry: dense(0, 4) };
  const fine: Itinerary = { ...withWalk, legs: [{ ...walk, geometry: dense(-0.3, 0) }, kerbBus, walkOn] };
  const g = new TripGuide(fine, 'Office');
  // Waiting at A for the bus: the step counts down to it.
  expect(g.update(side(bus.from), t0 + 200, none).title).toBe('Walk to A');
  g.update(pt(1.5), t0 + 480, none);
  expect(g.update(east(3, 0.015), t0 + 660, none).title).toBe('Get off at the next stop');
  expect(g.update(east(4, 0.015), t0 + 780, none).title).toBe('Get off now');
  // Still at the stop a minute later: on to the walk (a transfer may mean waiting right there).
  expect(g.update(east(4, 0.015), t0 + 840, none).title).toBe('Walk to Office');
  // 150 m off to the side of the last stop, away from the walking path: walking on.
  expect(g.update(east(3.9, -0.1), t0 + 900, none).title).toBe('Walk to Office');
});

test('waiting for a live bus: stops away in the text, and the boarding alert two stops out', () => {
  const live = (stopsAway: number, expected: number) =>
    new Map<number, LiveCall>([[1, { status: 'LIVE', scheduled: t0 + 300, expected, delaySec: 0, stopsAway, vehicle: null, alightExpected: null, progress: null }]]);
  const far = new TripGuide(itin, 'Home').update(pt(-0.3), t0, live(5, t0 + 600));
  expect(far.text).toBe('Bus 5 in 10 min · 5 stops away (live)');
  expect(far.alert).toBeNull();
  // Stuck in traffic: still 8 min by the clock, but only two stops out.
  const close = new TripGuide(itin, 'Home').update(pt(-0.3), t0, live(2, t0 + 480));
  expect(close.text).toBe('Bus 5 in 8 min · 2 stops away (live)');
  expect(close.alert).toBe('BOARD_SOON');
  expect(close.alertKey).toBe('board-1');
});

test('no stops count or early alert without a live, near bus', () => {
  const at = (status: LiveCall['status'], stopsAway: number | null) =>
    new Map<number, LiveCall>([[1, { status, scheduled: t0 + 300, expected: status === 'LIVE' ? t0 + 600 : null, delaySec: 0, stopsAway, vehicle: null, alightExpected: null, progress: null }]]);
  // Timetable only, or a bus that stopped reporting: the time alone, and no alert 10 minutes out.
  for (const s of [at('SCHEDULED', null), at('UNTRACKED', null)]) {
    const g = new TripGuide(itin, 'Home').update(pt(-0.3), t0 - 300, s);
    expect(g.text).toBe('Bus 5 in 10 min');
    expect(g.alert).toBeNull();
  }
  // Three stops out isn't "soon" yet; more than 40 is a count nobody needs.
  expect(new TripGuide(itin, 'Home').update(pt(-0.3), t0, at('LIVE', 3)).alert).toBeNull();
  expect(new TripGuide(itin, 'Home').update(pt(-0.3), t0, at('LIVE', 41)).text).toBe('Bus 5 in 10 min (live)');
});

test('stops away in Hebrew', () => {
  setLanguage('he');
  try {
    const live = new Map<number, LiveCall>([[1, { status: 'LIVE', scheduled: t0 + 300, expected: t0 + 600, delaySec: 0, stopsAway: 1, vehicle: null, alightExpected: null, progress: null }]]);
    expect(new TripGuide(itin, 'Home').update(pt(-0.3), t0, live).text).toBe('אוטובוס 5 בעוד 10 דק׳ · עוד תחנה אחת (בזמן אמת)');
  } finally {
    setLanguage('en');
  }
});

test('the last walk counts down by the straight line when you take another street (T1)', () => {
  // Off the bus at E (km 4), then 400 m east along a path to the destination.
  const off = makeLeg({ mode: 'WALK', from: call('E', 4, 780), to: at(4), start: t0 + 780, end: t0 + 1080, distanceM: 400 });
  const east = (km: number): GeoPoint => ({ lat: pt(4).lat, lon: 34.8 + km / (111.32 * Math.cos((pt(4).lat * Math.PI) / 180)) });
  const dest = { ...at(4), lat: east(0.4).lat, lon: east(0.4).lon };
  const legs = [walk, bus, { ...off, to: dest, geometry: [pt(4), pt(4.2), { lat: pt(4.2).lat, lon: east(0.4).lon }, east(0.4)] }];
  const g = new TripGuide({ ...itin, end: t0 + 1080, legs }, 'Home');
  g.update(pt(4), t0 + 790, none);
  // Walking straight there instead of round by the path: 250 m to go, not the path's 600 m.
  const s = g.update({ lat: pt(4).lat, lon: east(0.145).lon }, t0 + 900, none);
  expect(s.text).toBe('250 m to go');
});

test("near the bus's path before the bus has come is still the walk, with no get-off alert (I6.2)", () => {
  // 20 min early, standing by the route at stop C: the bus to E hasn't left A yet.
  const g = new TripGuide(itin, 'Home');
  const s = g.update(pt(2), t0 - 1200, none);
  expect(s.legIndex).toBe(0);
  expect(s.title).toBe('Walk to A');
  expect(s.alert).toBeNull();
  // Once the bus has left, the same place is on board.
  expect(g.update(pt(2), t0 + 400, none).legIndex).toBe(1);
});

test('a train with no line number is "Train", not "Train Train"', () => {
  const train = makeLeg({ ...bus, mode: 'TRAIN', routeShortName: null });
  const s = new TripGuide({ ...itin, legs: [walk, train] }, 'Home').update(pt(-0.3), t0, none);
  expect(s.text).toBe('Train in 5 min');
});
