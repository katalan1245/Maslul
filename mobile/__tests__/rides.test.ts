import { Combine } from '../src/data/combine';
import { type GeoPoint, type Itinerary, type Leg, type StopCall, type TransitMode, isTransit, legDurationSec, makeLeg, modeFromMotis, transitLegs } from '../src/data/models';
import { Ranking } from '../src/data/ranking';
import { RidePlanner } from '../src/data/rides';
import { instant } from './helpers';

const t0 = instant('2026-10-05T07:00:00Z');
const at = (min: number) => t0 + min * 60;
/** A point [km] north of the start. */
const p = (km: number): GeoPoint => ({ lat: 32.0 + km / 111.195, lon: 34.8 });
const stop = (name: string, km: number, id: string | null = null): StopCall => ({
  stopId: id, name, code: null, lat: p(km).lat, lon: p(km).lon, scheduledArrival: null, scheduledDeparture: null,
});

/** A drive due north, [km] long, taking [min] minutes. */
const drive = (km: number, min: number) =>
  makeLeg({ mode: 'CAR', from: stop('', 0), to: stop('Haifa', km), start: t0, end: at(min), distanceM: km * 1000,
    geometry: Array.from({ length: 11 }, (_, i) => p((km * i) / 10)) });

const leg = (mode: TransitMode, from: StopCall, to: StopCall, start: number, end: number, trip: string | null = null) =>
  makeLeg({ mode, from, to, start: at(start), end: at(end), routeShortName: trip, tripId: trip });

const itin = (id: string, ...legs: Leg[]): Itinerary => ({
  id, start: legs[0].start, end: legs[legs.length - 1].end, transfers: Math.max(legs.filter((l) => isTransit(l.mode)).length - 1, 0), legs,
});

test("drop-offs spread along the drive and end at the driver's destination", () => {
  const drops = RidePlanner.dropOffs(drive(80, 60), { lat: 40, lon: 40 });
  // Few enough to plan from without keeping the user waiting.
  expect(drops.length).toBeGreaterThanOrEqual(4);
  expect(drops.length).toBeLessThanOrEqual(6);
  expect([...drops].sort((a, b) => a.atSec - b.atSec)).toEqual(drops);
  // Evenly spaced, and the last is the end of the drive.
  for (let i = 1; i < drops.length; i++) expect(drops[i].atSec - drops[i - 1].atSec).toBeGreaterThanOrEqual(90);
  expect(drops[drops.length - 1].atSec).toBe(3600);
  expect(Math.abs(drops[drops.length - 1].alongM - 80_000)).toBeLessThanOrEqual(1);
});

test("a drop-off near where you're going is always tried", () => {
  // Going to a place 1 km off the road at km 31: the point by it is a candidate however the samples fall.
  const drops = RidePlanner.dropOffs(drive(80, 60), { lat: p(31).lat, lon: 34.81 });
  expect(drops.some((d) => Math.abs(d.alongM - 31_000) < 300)).toBe(true);
});

test('a short drive still has its end', () => {
  const drops = RidePlanner.dropOffs(drive(2, 3), p(5));
  expect(drops[drops.length - 1].atSec).toBe(180);
  expect(drops.every((d) => d.atSec >= 90)).toBe(true);
});

test('car leg ends at the drop-off', () => {
  const route = drive(40, 30);
  const drop = RidePlanner.dropOffs(route, p(100)).find((d) => d.atSec >= 600 && d.atSec <= 1200)!;
  const car = RidePlanner.carLeg(route, drop, at(5));
  expect(car.start).toBe(at(5));
  expect(car.end).toBe(at(5) + drop.atSec);
  expect(car.geometry[car.geometry.length - 1]).toEqual(drop.point);
  expect(Math.abs(car.to.lat - drop.point.lat)).toBeLessThan(1e-9);
  // Unnamed mid-way; the drive's end keeps the destination's name.
  expect(car.to.name).toBe('');
  const drops = RidePlanner.dropOffs(route, p(100));
  expect(RidePlanner.carLeg(route, drops[drops.length - 1], t0).to.name).toBe('Haifa');
});

test('composed trip starts with the lift', () => {
  const route = drive(40, 30);
  const car = RidePlanner.carLeg(route, RidePlanner.dropOffs(route, p(100))[2], t0);
  const rest = itin('r', leg('WALK', stop('', 20), stop('Central', 20.2), 16, 19), leg('BUS', stop('Central', 20.2, 'c'), stop('Far', 60, 'f'), 20, 70, '480'));
  const trip = RidePlanner.compose(car, rest);
  expect(trip.legs[0].mode).toBe('CAR');
  expect(trip.start).toBe(t0);
  expect(trip.end).toBe(at(70));
  expect(trip.transfers).toBe(0);
  expect(RidePlanner.dropOffName(trip)).toBe('Central');
});

test('keeps one drop-off per way on, preferring the longer lift on a tie', () => {
  const route = drive(40, 30);
  const drops = RidePlanner.dropOffs(route, p(100));
  const via = (i: number, board: number, trip: string, end: number) =>
    RidePlanner.compose(RidePlanner.carLeg(route, drops[i], t0), itin(`${i}${trip}`, leg('BUS', stop(`S${i}`, board, `s${i}`), stop('Far', 60, 'f'), 25, end, trip)));
  // The same bus boarded from two drop-offs, and a different, slower one.
  const out = RidePlanner.distinct([via(0, 5, '480', 70), via(2, 15, '480', 70), via(1, 10, '400', 80)], (i) => Ranking.score(i, false));
  expect(out).toHaveLength(2);
  expect(transitLegs(out[0])[0].tripId).toBe('480');
  expect(legDurationSec(out[0].legs[0])).toBe(drops[2].atSec);
});

test("walking from the drop-off isn't moved to the lift", () => {
  // The lift leaves when the driver does, even when the bus after it runs late.
  const car = { ...leg('CAR', stop('', 0), stop('', 10), 0, 10), fixed: true };
  const walk = leg('WALK', stop('', 10), stop('Central', 10.2), 18, 20);
  const bus = leg('BUS', stop('Central', 10.2, 'c'), stop('Far', 40, 'f'), 20, 50, '480');
  const trip = itin('t', car, walk, bus);
  const e = Combine.expected(trip, () => null);
  expect(e.legs[0].start).toBe(at(0));
  expect(e.legs[0].end).toBe(at(10));
  expect(e.legs[1].start).toBe(at(18));
  // Taking a later bus moves the walk, not the lift.
  const later = { ...bus, start: at(30), end: at(60), tripId: '480b', alternatives: [] };
  const chosen = Combine.choose({ ...trip, legs: [car, walk, { ...bus, alternatives: [later] }] }, 2, later);
  expect(chosen.legs[0].start).toBe(at(0));
  expect(chosen.legs[1].start).toBe(at(28));
  // A lift that can go any time ("up to 10 minutes") moves with the bus like a walk.
  const loose = itin('l', { ...car, fixed: false }, walk, bus);
  expect(Combine.expected(loose, () => null).legs[0].start).toBe(at(8));
});

test("a car isn't a ride to catch", () => {
  expect(isTransit('CAR')).toBe(false);
  expect(modeFromMotis('CAR')).toBe('CAR');
  expect(modeFromMotis('CAR_DROPOFF')).toBe('CAR');
  // A lift before the first bus isn't a transfer.
  const trip = itin('t', leg('CAR', stop('', 0), stop('', 10), 0, 10), leg('BUS', stop('A', 10, 'a'), stop('B', 20, 'b'), 12, 30, '1'));
  expect(Ranking.transfers(trip)).toEqual([]);
});

test('options arriving hours later are dropped', () => {
  const a = itin('a', leg('BUS', stop('A', 0, 'a'), stop('B', 10, 'b'), 0, 60, '1'));
  const b = itin('b', leg('BUS', stop('A', 0, 'a'), stop('B', 10, 'b'), 0, 85, '2'));
  const c = itin('c', leg('BUS', stop('A', 0, 'a'), stop('B', 10, 'b'), 0, 380, '3'));
  // Within half the soonest trip (30 min) stays; six hours later goes.
  expect(RidePlanner.inReach([a, b, c]).map((i) => i.id)).toEqual(['a', 'b']);
});
