/**
 * The route search's fallback to saved routes (see savedRoutes.test.ts for the storage): what a
 * search saves, and what a failed one shows, driven through RoutesModel against a fake repository.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitFor } from '@testing-library/react-native';
import type { Place } from '../src/data/models';
import { S } from '../src/i18n';
import { RoutesModel } from '../src/ui/screens/routesModel';
import { AZRIELI, DIZENGOFF, makeFakeRepo } from './support/fakeRepo';

jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

const fake = (require('../src/state/services') as { repo: ReturnType<typeof makeFakeRepo> & Record<string, unknown> }).repo;
const realPlan = fake.plan;
const offline = async (): Promise<never> => {
  throw new TypeError('Network request failed');
};

let model: RoutesModel | null = null;

beforeEach(async () => {
  await AsyncStorage.clear();
  fake.plan = realPlan;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  model?.dispose();
  model = null;
  jest.restoreAllMocks();
});

/** Runs a search to the end, including the save it starts without waiting. */
async function searched(m: RoutesModel = model!) {
  await waitFor(() => expect(m.loading || m.refining).toBe(false));
  await new Promise((r) => setTimeout(r, 0));
  return m;
}

const plan = async (from: Place = AZRIELI, to: Place = DIZENGOFF) => searched((model = new RoutesModel(from, to)));
const savedIndex = () => AsyncStorage.getItem('saved_routes_v1');

it('a fresh search after the connection comes back replaces the saved routes', async () => {
  const m = await plan();
  const fresh = m.itineraries.map((i) => i.id);
  expect(fresh.length).toBeGreaterThan(0);
  fake.plan = offline;
  m.search();
  await searched();
  expect(m.savedAt).not.toBeNull();
  expect(m.itineraries.map((i) => i.id)).toEqual(fresh);

  fake.plan = realPlan;
  m.search();
  await searched();
  expect(m.savedAt).toBeNull();
  expect(m.error).toBeNull();
  // Not the saved copy plus the fresh one.
  expect(m.itineraries.map((i) => i.id)).toEqual(fresh);
});

it('a failed search with nothing saved shows the plain error', async () => {
  fake.plan = offline;
  const m = await plan();
  expect(m.error).toBe(S.routes.loadFailed);
  expect(m.savedAt).toBeNull();
  expect(m.itineraries).toEqual([]);
});

it('saves nothing for a search with no results', async () => {
  fake.plan = async () => ({ itineraries: [], walkOnly: null, nextCursor: null, previousCursor: null });
  const m = await plan();
  expect(m.error).toBe(S.routes.noneFound);
  expect(await savedIndex()).toBeNull();
});

it('saves nothing for a lift, and shows no saved routes when one fails', async () => {
  const m = await plan();
  await AsyncStorage.clear();
  m.useRide({ kind: 'within', minutes: 10 });
  await searched();
  expect(m.itineraries.length).toBeGreaterThan(0);
  expect(await savedIndex()).toBeNull();

  fake.rideAlong = async () => [];
  m.useRide({ kind: 'toPlace', dest: AZRIELI });
  await searched();
  expect(await savedIndex()).toBeNull();

  // Saved routes are for the plain trip, not this lift.
  m.useRide(null);
  await searched();
  expect(await savedIndex()).not.toBeNull();
  fake.plan = offline;
  m.useRide({ kind: 'within', minutes: 10 });
  await searched();
  expect(m.savedAt).toBeNull();
  expect(m.error).toBe(S.routes.loadFailed);
});

it('saves nothing for an on-board search', async () => {
  const [, bus] = (await realPlan({})).itineraries[0].legs;
  fake.onBoardStart = async () => ({ trip: bus, nextIndex: 1, next: bus.to });
  fake.planOnBoard = async () => (await realPlan({})).itineraries;
  const m = await plan({ name: 'Line 5', lat: bus.from.lat, lon: bus.from.lon, kind: 'ON_BOARD', tripId: bus.tripId! }, DIZENGOFF);
  expect(m.itineraries.length).toBeGreaterThan(0);
  expect(await savedIndex()).toBeNull();
});
