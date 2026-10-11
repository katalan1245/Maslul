import { nearestId } from '../src/ui/map/TransitMap';

const pt = (id: string | null, lon: number, lat: number): GeoJSON.Feature => ({
  type: 'Feature',
  properties: id == null ? {} : { id },
  geometry: { type: 'Point', coordinates: [lon, lat] },
});

test('a tap opens the nearest stop in the box, not the first one listed', () => {
  const tap: [number, number] = [34.78, 32.08];
  expect(nearestId([pt('far', 34.7803, 32.08), pt('near', 34.7801, 32.0801), pt(null, 34.78, 32.08)], tap)).toBe('near');
});

test('nothing with an id under the finger opens nothing', () => {
  expect(nearestId([pt(null, 34.78, 32.08)], [34.78, 32.08])).toBeNull();
  expect(nearestId([], [34.78, 32.08])).toBeNull();
});
