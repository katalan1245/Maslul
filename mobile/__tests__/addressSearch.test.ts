import { AddressSearch } from '../src/data/addressSearch';
import type { Place, PlaceKind } from '../src/data/models';

const q = AddressSearch.parse('המגינים 14 פתח תקווה');
const place = (name: string, lat: number, lon: number, subtitle: string, kind: PlaceKind): Place => ({ name, lat, lon, subtitle, kind });

test('splits house number', () => {
  expect(q.number).toBe('14');
  expect(q.rest).toBe('המגינים פתח תקווה');
  expect(AddressSearch.parse('הרצל 14א, ראשון לציון').number).toBe('14א');
  expect(AddressSearch.parse('עזריאלי').number).toBeNull();
  expect(AddressSearch.parse('480').number).toBeNull();
  expect(AddressSearch.norm('פתח תקווה')).toBe(AddressSearch.norm('פתח-תקוה'));
});

// What the geocoders actually return for this query: other streets' no. 14, and the street.
const results = [
  place('גן המגינים', 32.17, 34.9, 'כפר סבא', 'POI'),
  place('האורנים 14', 32.09, 34.88, 'פתח תקווה', 'ADDRESS'),
  place('המגינים 14', 32.79, 35.53, 'טבריה', 'ADDRESS'),
  place('המגינים', 32.18, 34.87, 'רעננה', 'POI'),
  place('המגינים', 32.0884, 34.8964, 'פתח תקווה', 'POI'),
];

test('falls back to the street in the right city', () => {
  const top = AddressSearch.resolve(q, results)![0];
  expect(top.name).toBe('המגינים 14');
  expect(Math.abs(top.lat - 32.0884)).toBeLessThan(1e-6);
  expect(top.subtitle).toContain('not on the map');
});

test('prefers exact address', () => {
  const exact = place('המגינים 14', 32.088, 34.896, 'פתח תקוה', 'ADDRESS');
  expect(AddressSearch.resolve(q, [...results, exact])![0]).toEqual(exact);
});

test('no match returns null', () => {
  expect(AddressSearch.resolve(q, results.filter((p) => p.subtitle !== 'פתח תקווה' || p.kind === 'ADDRESS'))).toBeNull();
});
