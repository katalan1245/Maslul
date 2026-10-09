import type { LiveCall } from '../src/data/eta';
import { type GeoPoint, type Itinerary, type StopCall, makeLeg } from '../src/data/models';
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
