import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import type { Lang } from '../src/i18n';
import { brightenDark, labelLanguage } from '../src/ui/map/darkStyle';

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

test('labels show one name, in the app language', () => {
  const bilingual = ['case', ['has', 'name:nonlatin'], ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']], ['get', 'name']];
  const labelled = {
    version: 8,
    sources: {},
    layers: [
      { id: 'place_city', type: 'symbol', source: 'x', layout: { 'text-field': bilingual, 'text-size': 14 } },
      { id: 'highway_shield', type: 'symbol', source: 'x', layout: { 'text-field': ['to-string', ['get', 'ref']] } },
    ],
  } as unknown as StyleSpecification;
  const layout = (l: Lang) => labelLanguage(labelled, l).layers.map((x) => (x as { layout: Record<string, unknown> }).layout);
  expect(layout('he')[0]).toEqual({ 'text-field': ['coalesce', ['get', 'name:he'], ['get', 'name']], 'text-size': 14 });
  expect(layout('en')[0]['text-field']).toEqual(['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]);
  // Road numbers aren't names: untouched.
  expect(layout('he')[1]['text-field']).toEqual(['to-string', ['get', 'ref']]);
});

test('the fetched style is labelled in the language of the moment, not the one it was fetched in (X3)', async () => {
  const { mapStyle } = require('../src/ui/map/darkStyle') as typeof import('../src/ui/map/darkStyle');
  const { setLanguage } = require('../src/i18n') as typeof import('../src/i18n');
  const style = { version: 8, sources: {}, layers: [{ id: 'city', type: 'symbol', source: 's', layout: { 'text-field': ['get', 'name'] } }] };
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => style });
  const field = async () => JSON.stringify(((await mapStyle(false))!.layers[0] as { layout: object }).layout);
  try {
    setLanguage('ru');
    expect(await field()).toContain('name:ru');
    setLanguage('en');
    expect(await field()).toContain('name:en');
  } finally {
    setLanguage('en');
  }
});
