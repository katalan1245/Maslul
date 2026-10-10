import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeLeg } from '../src/data/models';
import { MAX_ROUTES, MAX_SEARCHES, type SavedSearch, SavedRoutes } from '../src/state/savedRoutes';
import { call, itinOf } from './helpers';

const here = { lat: 32.0853, lon: 34.7818 };
const dizengoff = { lat: 32.0753, lon: 34.7748 };
const north = (p: { lat: number; lon: number }, m: number) => ({ lat: p.lat + m / 111_195, lon: p.lon });
const search = (id: string, to = dizengoff, from = here, fromHere = true): SavedSearch => ({ id, from, to, fromHere, savedAt: Number(id) });

/** Walk, then a bus at [busAt]. */
const route = (id: string, busAt: number) => {
  const a = call('s1', 'A', here.lat, here.lon, busAt, busAt);
  const b = call('s2', 'B', dizengoff.lat, dizengoff.lon, busAt + 600, busAt + 600);
  return itinOf(id, makeLeg({ mode: 'WALK', from: call(null, 'Start', here.lat, here.lon), to: a, start: busAt - 240, end: busAt }), makeLeg({ mode: 'BUS', from: a, to: b, start: busAt, end: busAt + 600 }));
};

beforeEach(() => AsyncStorage.clear());

test('the same trip replaces its earlier search; the oldest drop out past the limit', () => {
  let index: SavedSearch[] = [];
  for (let i = 0; i < MAX_SEARCHES; i++) index = SavedRoutes.add(index, search(String(i), north(dizengoff, 1000 * (i + 1)))).index;
  // Again to the first place: it moves to the front, nothing drops.
  const again = SavedRoutes.add(index, search('100', north(dizengoff, 1000)));
  expect(again.index.map((s) => s.id)).toEqual(['100', '4', '3', '2', '1']);
  expect(again.dropped).toEqual(['0']);
  const more = SavedRoutes.add(again.index, search('101', north(dizengoff, 9000)));
  expect(more.index).toHaveLength(MAX_SEARCHES);
  expect(more.dropped).toEqual(['1']);
});

test('current location matches within a kilometre; a fixed start and the destination must be close', () => {
  const index = [search('1')];
  expect(SavedRoutes.find(index, { from: north(here, 800), to: dizengoff, fromHere: true })?.id).toBe('1');
  expect(SavedRoutes.find(index, { from: north(here, 1500), to: dizengoff, fromHere: true })).toBeNull();
  expect(SavedRoutes.find(index, { from: here, to: north(dizengoff, 400), fromHere: true })).toBeNull();
  expect(SavedRoutes.find(index, { from: here, to: dizengoff, fromHere: false })).toBeNull();
  const fixed = [search('2', dizengoff, here, false)];
  expect(SavedRoutes.find(fixed, { from: north(here, 100), to: dizengoff, fromHere: false })?.id).toBe('2');
  expect(SavedRoutes.find(fixed, { from: north(here, 500), to: dizengoff, fromHere: false })).toBeNull();
});

test('only routes whose bus is still ahead are shown', () => {
  const now = 1_000_000;
  // The walk has started, but the bus is still to come: still catchable.
  const routes = [route('gone', now - 60), route('walking', now + 120), route('later', now + 900)];
  expect(SavedRoutes.stillAhead(routes, now).map((r) => r.id)).toEqual(['walking', 'later']);
});

test('saves and loads through storage, at most MAX_ROUTES routes, and removes dropped searches', async () => {
  const q = { from: here, to: dizengoff, fromHere: true };
  const routes = Array.from({ length: MAX_ROUTES + 3 }, (_, i) => route(`r${i}`, 2_000_000 + i * 60));
  await SavedRoutes.save(q, routes, 1000);
  const loaded = await SavedRoutes.load({ ...q, from: north(here, 300) });
  expect(loaded?.savedAt).toBe(1000);
  expect(loaded?.routes.map((r) => r.id)).toEqual(routes.slice(0, MAX_ROUTES).map((r) => r.id));
  for (let i = 1; i <= MAX_SEARCHES; i++) await SavedRoutes.save({ ...q, to: north(dizengoff, 1000 * i) }, routes, 1000 + i);
  expect(await SavedRoutes.load(q)).toBeNull();
  expect(await AsyncStorage.getItem('saved_routes_v1/1000')).toBeNull();
  expect(await SavedRoutes.load({ from: here, to: dizengoff, fromHere: false })).toBeNull();
});

test('an unreadable index is started over, not a crash', async () => {
  const q = { from: here, to: dizengoff, fromHere: true };
  await AsyncStorage.setItem('saved_routes_v1', '{not json');
  expect(await SavedRoutes.load(q)).toBeNull();
  await SavedRoutes.save(q, [route('a', 5)], 7);
  expect((await SavedRoutes.load(q))?.routes.map((r) => r.id)).toEqual(['a']);
});
