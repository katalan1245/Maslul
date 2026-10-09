import { type Place, placeKey } from '../src/data/models';
import {
  EMPTY_USER_DATA, favoriteFor, migrated, readUserData, withFavorite, withFavoriteMoved, withoutFavorite,
} from '../src/data/userStore';

const gym: Place = { name: 'Holmes Place', lat: 32.08, lon: 34.78, subtitle: 'Tel Aviv', kind: 'POI' };
const mom: Place = { name: 'Herzl 10', lat: 31.25, lon: 34.79, kind: 'POI' };
const uni: Place = { name: 'Tel Aviv University', lat: 32.11, lon: 34.8, kind: 'POI' };
const labels = (d: typeof EMPTY_USER_DATA) => d.favoritePlaces.map((f) => f.label);

test('legacy JSON with unlabeled favorites migrates with place name as label', () => {
  const legacy = `{"home":{"name":"Home st","lat":32.0,"lon":34.8,"kind":"HOME"},
    "favorites":[{"name":"Holmes Place","lat":32.08,"lon":34.78,"subtitle":"Tel Aviv"},
                 {"name":"Herzl 10","lat":31.25,"lon":34.79}],
    "recents":[],"settings":{"reminderMinutes":10}}`;
  const d = migrated(readUserData(legacy)!);
  expect(d.home?.name).toBe('Home st');
  expect(d.settings.reminderMinutes).toBe(10);
  expect(d.favorites).toEqual([]);
  expect(labels(d)).toEqual(['Holmes Place', 'Herzl 10']);
  expect(d.favoritePlaces[0].icon).toBe('STAR');
  expect(d.favoritePlaces[0].place.subtitle).toBe('Tel Aviv');
});

test('migration is idempotent and skips duplicates', () => {
  const d = migrated(withFavorite({ ...EMPTY_USER_DATA, favorites: [gym, gym] }, gym, 'Gym', 'GYM'));
  expect(d.favoritePlaces).toHaveLength(1);
  expect(d.favoritePlaces[0].label).toBe('Gym');
  expect(migrated(d)).toEqual(d);
});

test('labelled favorites round-trip through JSON', () => {
  const d = withFavorite(withFavorite(EMPTY_USER_DATA, gym, 'Gym', 'GYM'), mom, 'Mom', 'HEART');
  const back = migrated(readUserData(JSON.stringify(d))!);
  expect(back.favoritePlaces).toEqual(d.favoritePlaces);
});

test('saving again updates label in place and blank label falls back to name', () => {
  let d = withFavorite(withFavorite(EMPTY_USER_DATA, gym, 'Gym', 'GYM'), mom, 'Mom', 'HEART');
  d = withFavorite(d, gym, '  ', 'STAR');
  expect(labels(d)).toEqual(['Holmes Place', 'Mom']);
  expect(d.favoritePlaces[0].icon).toBe('STAR');
  expect(favoriteFor(d, { ...gym })).not.toBeNull();
  d = withoutFavorite(d, placeKey(gym));
  expect(favoriteFor(d, gym)).toBeNull();
  expect(d.favoritePlaces).toHaveLength(1);
});

test('reorder clamps to bounds', () => {
  let d = withFavorite(withFavorite(withFavorite(EMPTY_USER_DATA, gym, 'Gym', 'GYM'), mom, 'Mom', 'HEART'), uni, 'Uni', 'SCHOOL');
  d = withFavoriteMoved(d, placeKey(uni), -1);
  expect(labels(d)).toEqual(['Gym', 'Uni', 'Mom']);
  d = withFavoriteMoved(d, placeKey(gym), -1);
  expect(labels(d)).toEqual(['Gym', 'Uni', 'Mom']);
  d = withFavoriteMoved(d, placeKey(gym), 5);
  expect(labels(d)).toEqual(['Uni', 'Mom', 'Gym']);
});
