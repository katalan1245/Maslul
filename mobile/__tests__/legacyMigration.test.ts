/**
 * Data written by the Kotlin app (kotlinx.serialization: defaults and nulls left out, enums by
 * name, sets as arrays) must come across intact, with every default applied.
 */
import { placeKey } from '../src/data/models';
import { DEFAULT_SETTINGS, EMPTY_USER_DATA, WORK_WEEK, loadUserData, readUserData } from '../src/data/userStore';
import { type KeyValue, MIGRATED_KEY, STORE_KEY, loadData, saveData } from '../src/state/persist';

/** A real-shaped store from the Kotlin app: only non-default fields are present. */
const KOTLIN_STORE = JSON.stringify({
  home: { name: 'הרצל 10', lat: 32.0853, lon: 34.7818, subtitle: 'תל אביב יפו', kind: 'HOME' },
  work: { name: 'עזריאלי', lat: 32.0741, lon: 34.7922, kind: 'WORK' },
  favoritePlaces: [
    { place: { name: 'Holmes Place', lat: 32.08, lon: 34.78, subtitle: 'Tel Aviv' }, label: 'Gym', icon: 'GYM' },
    // icon == STAR is the default: left out.
    { place: { name: 'Herzl 10', lat: 31.25, lon: 34.79 }, label: 'Mom' },
  ],
  recents: [
    { name: 'ת. רכבת תל אביב - סבידור', lat: 32.0838, lon: 34.7981, subtitle: '#21437 · תל אביב יפו', kind: 'STOP', stopId: 'il-Israel-MOT_21437' },
    // kind == POI is the default: left out.
    { name: 'דיזנגוף סנטר', lat: 32.0754, lon: 34.7749, subtitle: 'תל אביב יפו' },
  ],
  favoriteLines: [
    {
      gtfsRouteId: 1564771, lineRef: 1081, operatorRef: 5, shortName: '16', longName: 'מסוף יותם ויואב-פתח תקווה<->ת. מרכזית-תל אביב יפו-1#',
      mkt: '10016', direction: '1', alternative: '#', agency: 'דן', mode: 'BUS', date: '2026-09-28',
    },
  ],
  savedTrips: [
    {
      from: { name: 'Home st', lat: 32.0, lon: 34.8, kind: 'HOME' },
      to: { name: 'Office', lat: 32.1, lon: 34.85 },
      label: 'Commute',
    },
    { from: { name: 'A', lat: 31.0, lon: 34.0 }, to: { name: 'B', lat: 31.1, lon: 34.1 } },
  ],
  favoriteStops: [{ name: 'הרצל/בלפור', lat: 32.06, lon: 34.77, kind: 'STOP', stopId: 'il-Israel-MOT_25520' }],
  shuttles: [
    // rideMinutes 20 and days Sun–Thu are the defaults: left out.
    { id: '0d4c9a1e-3b1f-4a51-9f7e-1a2b3c4d5e6f', name: 'Office shuttle', from: { name: 'Office', lat: 32.1, lon: 34.85 },
      to: { name: 'Station', lat: 32.15, lon: 34.85 }, times: [450, 480, 1035] },
    { id: 'b', name: 'Weekend', from: { name: 'X', lat: 32.0, lon: 34.0 }, to: { name: 'Y', lat: 32.2, lon: 34.2 },
      times: [600], rideMinutes: 35, days: [5, 6] },
  ],
  // Only what differs from the defaults; modes as an array (a Set in Kotlin).
  settings: { theme: 'DARK', walkSpeed: 'FAST', modes: ['BUS', 'TRAIN', 'LIGHT_RAIL'], railPreference: 'STRONG', rides: true, onBoard: true },
});

test('reads every field of a Kotlin store and applies the defaults', () => {
  const d = loadUserData(KOTLIN_STORE);
  expect(d.home).toEqual({ name: 'הרצל 10', lat: 32.0853, lon: 34.7818, subtitle: 'תל אביב יפו', kind: 'HOME' });
  expect(d.work?.kind).toBe('WORK');
  expect(d.favoritePlaces.map((f) => [f.label, f.icon])).toEqual([
    ['Gym', 'GYM'],
    ['Mom', 'STAR'],
  ]);
  expect(d.favoritePlaces[1].place.kind).toBe('POI');
  expect(d.recents.map((p) => p.kind)).toEqual(['STOP', 'POI']);
  expect(d.recents[0].stopId).toBe('il-Israel-MOT_21437');
  expect(d.recents[1].stopId).toBeUndefined();
  expect(d.favoriteLines).toHaveLength(1);
  expect(d.favoriteLines[0]).toMatchObject({ gtfsRouteId: 1564771, lineRef: 1081, operatorRef: 5, mode: 'BUS', date: '2026-09-28' });
  expect(d.savedTrips.map((t) => t.label)).toEqual(['Commute', undefined]);
  expect(d.favoriteStops[0].stopId).toBe('il-Israel-MOT_25520');
  expect(d.shuttles[0]).toMatchObject({ rideMinutes: 20, days: WORK_WEEK, times: [450, 480, 1035] });
  expect(d.shuttles[1]).toMatchObject({ rideMinutes: 35, days: [5, 6] });
  expect(d.settings).toEqual({
    ...DEFAULT_SETTINGS,
    theme: 'DARK',
    walkSpeed: 'FAST',
    modes: ['BUS', 'TRAIN', 'LIGHT_RAIL'],
    railPreference: 'STRONG',
    rides: true,
    onBoard: true,
  });
  expect(d.favorites).toEqual([]);
});

test('an empty Kotlin store is all defaults', () => {
  expect(loadUserData('{}')).toEqual(EMPTY_USER_DATA);
  expect(readUserData('{"settings":{}}')!.settings).toEqual(DEFAULT_SETTINGS);
  expect(DEFAULT_SETTINGS).toEqual({
    // language is new (the Kotlin app was English only): upgraders follow the phone.
    theme: 'SYSTEM', language: 'SYSTEM', walkSpeed: 'NORMAL', maxWalkMinutes: 20, modes: ['BUS', 'TRAIN', 'LIGHT_RAIL', 'METRO', 'CABLE_CAR', 'FERRY'],
    wheelchair: false, railPreference: 'NONE', reminderMinutes: 5, rides: false, onBoard: false,
  });
});

test('nulls, unknown enums and unknown keys fall back like coerceInputValues', () => {
  const d = readUserData(
    JSON.stringify({
      home: null,
      futureField: { anything: 1 },
      recents: [{ name: 'X', lat: 32, lon: 34, kind: 'SPACESHIP', subtitle: null, newKey: true }],
      settings: { theme: 'SEPIA', walkSpeed: null, maxWalkMinutes: '15', reminderMinutes: null, wheelchair: 'true' },
    }),
  )!;
  expect(d.home).toBeNull();
  expect(d.recents[0]).toEqual({ name: 'X', lat: 32, lon: 34, kind: 'POI' });
  expect(d.settings.theme).toBe('SYSTEM');
  expect(d.settings.walkSpeed).toBe('NORMAL');
  // Lenient mode reads quoted numbers and booleans.
  expect(d.settings.maxWalkMinutes).toBe(15);
  expect(d.settings.wheelchair).toBe(true);
  expect(d.settings.reminderMinutes).toBe(5);
});

test('a broken entry is dropped without losing the rest', () => {
  const d = readUserData(
    JSON.stringify({
      recents: [{ name: 'ok', lat: 1, lon: 2 }, { lat: 1, lon: 2 }, 'junk'],
      favoriteLines: [{ gtfsRouteId: 1, lineRef: 2, operatorRef: 3, shortName: '1', longName: '', mkt: '1', direction: '1', alternative: '#', agency: 'x', mode: 'HOVERCRAFT', date: '2026-01-01' }],
      settings: { modes: ['BUS', 'BUS', 'ZEPPELIN', 'TRAIN'] },
    }),
  )!;
  expect(d.recents.map((p) => p.name)).toEqual(['ok']);
  expect(d.favoriteLines).toEqual([]);
  // A set: duplicates go, unknown modes are dropped.
  expect(d.settings.modes).toEqual(['BUS', 'TRAIN']);
});

test('unreadable stores give empty data, not a crash', () => {
  expect(readUserData('not json')).toBeNull();
  expect(readUserData('[1,2]')).toBeNull();
  expect(loadUserData('not json')).toEqual(EMPTY_USER_DATA);
  expect(loadUserData(null)).toEqual(EMPTY_USER_DATA);
});

test('legacy unlabeled favorites are migrated on load', () => {
  const d = loadUserData(
    JSON.stringify({
      favorites: [{ name: 'Holmes Place', lat: 32.08, lon: 34.78, subtitle: 'Tel Aviv' }, { name: 'Herzl 10', lat: 31.25, lon: 34.79 }],
      favoritePlaces: [{ place: { name: 'Herzl 10', lat: 31.25, lon: 34.79 }, label: 'Mom', icon: 'HEART' }],
    }),
  );
  expect(d.favorites).toEqual([]);
  // The labelled one stays as it was; the other is added with its name as label.
  expect(d.favoritePlaces.map((f) => [f.label, f.icon])).toEqual([
    ['Mom', 'HEART'],
    ['Holmes Place', 'STAR'],
  ]);
});

test("this app's own format round-trips", () => {
  const d = loadUserData(KOTLIN_STORE);
  expect(loadUserData(JSON.stringify(d))).toEqual(d);
  expect(d.recents.map(placeKey)).toEqual(['ת. רכבת תל אביב - סבידור|32.0838|34.7981', 'דיזנגוף סנטר|32.0754|34.7749']);
});

// ---- The one-time move from the Kotlin app ------------------------------------------

function memory(init: Record<string, string> = {}): KeyValue & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return { map, getItem: async (k) => map.get(k) ?? null, setItem: async (k, v) => void map.set(k, v) };
}

test('first launch moves the Kotlin store over once', async () => {
  const kv = memory();
  const reader = jest.fn(async () => KOTLIN_STORE);
  const first = await loadData(kv, reader);
  expect(first.source).toBe('legacy');
  expect(first.data.home?.name).toBe('הרצל 10');
  expect(kv.map.get(MIGRATED_KEY)).toBe('1');
  expect(JSON.parse(kv.map.get(STORE_KEY)!).settings.theme).toBe('DARK');
  // Later launches read this app's store and never the old one.
  const second = await loadData(kv, reader);
  expect(second.source).toBe('store');
  expect(second.data).toEqual(first.data);
  expect(reader).toHaveBeenCalledTimes(1);
});

test('a fresh install, or nothing readable, starts empty and stops looking', async () => {
  for (const legacy of [null, 'garbage']) {
    const kv = memory();
    const reader = jest.fn(async () => legacy);
    expect((await loadData(kv, reader)).source).toBe('empty');
    expect(kv.map.get(MIGRATED_KEY)).toBe('1');
    expect(kv.map.has(STORE_KEY)).toBe(false);
    await loadData(kv, reader);
    expect(reader).toHaveBeenCalledTimes(1);
  }
});

test("when the old store can't be read (no native module) it's tried again next launch", async () => {
  const kv = memory();
  const failing = jest.fn(async (): Promise<string | null> => {
    throw new Error('Cannot find native module');
  });
  expect((await loadData(kv, failing)).source).toBe('empty');
  expect(kv.map.has(MIGRATED_KEY)).toBe(false);
  expect((await loadData(kv, async () => KOTLIN_STORE)).source).toBe('legacy');
});

test('saved changes win over the old store', async () => {
  const kv = memory();
  await loadData(kv, async () => KOTLIN_STORE);
  await saveData(kv, { ...EMPTY_USER_DATA, settings: { ...DEFAULT_SETTINGS, theme: 'LIGHT' } });
  const again = await loadData(kv, async () => KOTLIN_STORE);
  expect(again.source).toBe('store');
  expect(again.data.settings.theme).toBe('LIGHT');
  expect(again.data.home).toBeNull();
});
