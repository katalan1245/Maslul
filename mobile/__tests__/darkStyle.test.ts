import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { brightenDark } from '../src/ui/map/darkStyle';

// The layers of OpenFreeMap's dark style that brightenDark touches, one of each kind.
const style = {
  version: 8,
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#000' } },
    { id: 'water', type: 'fill', source: 'x', paint: { 'fill-color': '#000' } },
    { id: 'highway_name_other', type: 'symbol', source: 'x', paint: { 'text-color': 'rgba(80, 78, 78, 1)', 'text-halo-color': '#000' } },
    { id: 'place_city', type: 'symbol', source: 'x', paint: { 'text-color': 'rgb(101,101,101)' } },
  ],
} as unknown as StyleSpecification;

test('brightens the land and the labels', () => {
  const paint = Object.fromEntries(brightenDark(style).layers.map((l) => [l.id, (l as { paint?: Record<string, unknown> }).paint]));
  expect(paint.background).toEqual({ 'background-color': '#1E232B' });
  expect(paint.water).toEqual({ 'fill-color': '#13283D' });
  // Street names and place names: light text on a slate halo (they stayed near-black before).
  expect(paint.highway_name_other).toEqual({ 'text-color': '#AEB5BF', 'text-halo-color': '#1E232B' });
  expect(paint.place_city).toEqual({ 'text-color': '#D5DAE0', 'text-halo-color': '#1E232B' });
});
