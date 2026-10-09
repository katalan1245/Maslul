/** Rides, shuttles and planning from on board, against the real services (needs network access). */
import { type GeoPoint, type Itinerary, type Place, callPoint, firstTransit, legDurationSec, placePoint, transitLegs } from '../../src/data/models';
import { Ranking } from '../../src/data/ranking';
import { RidePlanner } from '../../src/data/rides';
import type { Shuttle } from '../../src/data/userStore';
import { newRepo } from './support';

jest.setTimeout(240_000);
const repo = newRepo();
const telAviv: GeoPoint = { lat: 32.0853, lon: 34.7818 };
const haifa: GeoPoint = { lat: 32.794, lon: 34.9896 };
const describe_ = (i: Itinerary) =>
  i.legs.map((l) => `${l.mode} ${l.routeShortName ?? ''} ${l.to.name.slice(0, 16)} ${Math.trunc(legDurationSec(l) / 60)}m`).join(' > ');
const score = (i: Itinerary) => Ranking.score(i, false);

test('drives with geometry', async () => {
  const car = (await repo.carRoute(telAviv, haifa))!;
  expect(car.mode).toBe('CAR');
  expect(car.geometry.length).toBeGreaterThan(50);
  expect(legDurationSec(car)).toBeGreaterThanOrEqual(40 * 60);
  expect(legDurationSec(car)).toBeLessThanOrEqual(150 * 60);
});

test("finds where to get out along the driver's way", async () => {
  // Driver heads to Haifa; you're going to Kfar Yona, inland from Netanya.
  const options = await repo.rideAlong({ from: telAviv, to: { lat: 32.317, lon: 34.9354 } }, haifa, score);
  options.slice(0, 4).forEach((o) => console.log(`ride: drop ${RidePlanner.dropOffName(o)} · ${describe_(o)}`));
  expect(options.length).toBeGreaterThan(0);
  expect(options.every((o) => o.legs[0].mode === 'CAR')).toBe(true);
  expect(options.every((o) => o.legs.every((l, i) => i === 0 || !(l.start < o.legs[i - 1].start)))).toBe(true);
});

test('plans a lift within a few minutes', async () => {
  const r = await repo.plan({
    from: telAviv, to: { lat: 31.2518, lon: 34.7913 }, preTransitModes: 'CAR_DROPOFF', maxPreTransitMinutes: 15, directModes: 'WALK,CAR', maxDirectMinutes: 15,
  });
  r.itineraries.slice(0, 3).forEach((i) => console.log(`within 15: ${describe_(i)}`));
  expect(r.itineraries.length).toBeGreaterThan(0);
  const car = r.itineraries[0].legs[0];
  expect(car.mode).toBe('CAR');
  expect(legDurationSec(car)).toBeLessThanOrEqual(16 * 60);
  expect(r.itineraries.every((i) => i.legs.every((l) => !(l.end < l.start)))).toBe(true);
});

test('combines a shuttle with the train', async () => {
  // An office shuttle from Ramat HaHayal to Tel Aviv University station, every 20 minutes all day.
  const office: Place = { name: 'Office', lat: 32.1093, lon: 34.8396, kind: 'POI' };
  const station: Place = { name: 'University station', lat: 32.1037, lon: 34.8047, kind: 'POI' };
  const times: number[] = [];
  for (let m = 0; m < 24 * 60; m += 20) times.push(m);
  const shuttle: Shuttle = { id: 's', name: 'Office', from: office, to: station, times, rideMinutes: 12, days: [1, 2, 3, 4, 5, 6, 7] };
  const options = await repo.shuttleOptions({ from: placePoint(office), to: haifa }, [shuttle]);
  options.forEach((o) => console.log(`shuttle: ${describe_(o)}`));
  expect(options.length).toBeGreaterThan(0);
  const ride = options[0].legs.find((l) => l.shuttleId === 's')!;
  expect(ride.geometry.length).toBeGreaterThan(2);
  expect(transitLegs(options[0]).length).toBeGreaterThanOrEqual(2);
});

test('finds rides around you and plans from the next stop', async () => {
  // Arlozorov terminal by Tel Aviv Savidor station: always something around.
  const here = { lat: 32.0838, lon: 34.798 };
  const candidates = await repo.boardCandidates(here);
  candidates.slice(0, 6).forEach((c) => console.log(`candidate: ${c.mode} ${c.lineLabel} to ${c.headsign} live=${c.vehicle != null} ${Math.trunc(c.distanceM)} m`));
  // Nothing runs here on Shabbat or in the small hours: skipped (not failed) then, like the night case below.
  if (candidates.length === 0) {
    console.warn('no rides around at all (Shabbat or night?): skipped');
    return;
  }
  // One with a few stops still to go (some end right here).
  let found: { tripId: string; start: NonNullable<Awaited<ReturnType<typeof repo.onBoardStart>>> } | null = null;
  for (const c of candidates.filter((x) => x.tripId != null)) {
    const s = await repo.onBoardStart(c.tripId!, here);
    if (s && s.nextIndex + 4 <= s.trip.intermediateStops.length + 1) {
      found = { tripId: c.tripId!, start: s };
      break;
    }
  }
  // In the small hours there may be none: skipped (not failed) then.
  if (!found) {
    console.warn('no ride around with stops still to go (night?): skipped');
    return;
  }
  const { tripId, start } = found;
  console.log(`next stop: ${start.next.name} #${start.nextIndex}`);
  expect(start.next.stopId?.trim()).toBeTruthy();
  // Going somewhere further down its own route: staying on is among the options.
  const calls = [start.trip.from, ...start.trip.intermediateStops, start.trip.to];
  const ahead = calls[start.nextIndex + 4];
  const req = { from: callPoint(start.next), to: callPoint(ahead), fromStopId: start.next.stopId };
  const near = await repo.planOnBoard(req, start, score);
  near.slice(0, 3).forEach((i) => console.log(`from on board to ${ahead.name}: ${describe_(i)} stays=${firstTransit(i)?.tripId === tripId}`));
  expect(near.some((i) => firstTransit(i)?.tripId === tripId)).toBe(true);
  const far = await repo.planOnBoard({ ...req, to: haifa }, start, score);
  far.slice(0, 3).forEach((i) => console.log(`from on board to Haifa: ${describe_(i)} stays=${firstTransit(i)?.tripId === tripId}`));
  expect(far.length).toBeGreaterThan(0);
});
