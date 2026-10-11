/**
 * The parsers on real responses saved by `RECORD=1 npm run test:live` (see fixtures/*.url.txt
 * for where each came from and when). Offline, so they guard against regressions in CI.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { vehicleCount } from '../src/data/liveRepository';
import { parseSnapshotJson, latestPerVehicle } from '../src/data/liveRepository';
import { type Itinerary, isTransit, scheduledTime } from '../src/data/models';
import { nominatimToPlace } from '../src/data/nominatimApi';
import { featureToPlace } from '../src/data/photonApi';
import { lineStops, routeToDomain } from '../src/data/strideApi';
import { parseInstant } from '../src/data/time';
import { itineraryToDomain, legToDomain, matchToPlace, stopTimeToDomain } from '../src/data/transitousApi';
import { groupBy } from '../src/data/util';

const dir = join(__dirname, '..', 'fixtures');
const json = (name: string) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
const fetchedAt = (name: string) => parseInstant(readFileSync(join(dir, `${name}.url.txt`), 'utf8').split('\n')[1].replace('fetched ', '').replace(/\.\d+Z$/, 'Z'))!;

test('Transitous plan: itineraries with transit legs, shapes and MOT trip ids', () => {
  const dto = json('transitous-plan');
  const itins: Itinerary[] = dto.itineraries.map(itineraryToDomain);
  expect(itins.length).toBeGreaterThan(0);
  for (const it of itins) {
    expect(it.end).toBeGreaterThan(it.start);
    expect(it.legs.some((l) => isTransit(l.mode))).toBe(true);
    for (const l of it.legs.filter((x) => isTransit(x.mode))) {
      expect(l.tripId).toMatch(/il-Israel-MOT_/);
      expect(l.geometry.length).toBeGreaterThan(1);
      expect(l.from.name).not.toBe('');
    }
  }
});

test('Transitous plan by car: a CAR leg with geometry', () => {
  const dto = json('transitous-plan-car');
  const car = dto.direct.map(itineraryToDomain).flatMap((i: { legs: { mode: string }[] }) => i.legs).find((l: { mode: string }) => l.mode === 'CAR');
  expect(car).toBeTruthy();
  expect(car.geometry.length).toBeGreaterThan(50);
  expect(car.distanceM).toBeGreaterThan(1000);
});

test('Transitous trip: every stop has a scheduled time', () => {
  const leg = legToDomain(json('transitous-trip').legs.find((l: { mode: string }) => l.mode !== 'WALK'));
  const calls = [leg.from, ...leg.intermediateStops, leg.to];
  expect(calls.length).toBeGreaterThan(2);
  expect(calls.every((c) => scheduledTime(c) != null)).toBe(true);
  expect(leg.headsign).toBeTruthy();
});

test('Transitous stop times: departures with lines and platforms parsed', () => {
  const deps = json('transitous-stoptimes').stopTimes.map(stopTimeToDomain).filter(Boolean);
  expect(deps.length).toBeGreaterThan(5);
  expect(deps.every((d: { lineLabel: string; tripId: string }) => d.lineLabel !== '' && d.tripId.includes('il-Israel-MOT_'))).toBe(true);
});

test('Transitous geocoding, stop search, reverse geocoding and map stops', () => {
  const places = json('transitous-geocode').map(matchToPlace);
  expect(places.length).toBeGreaterThan(0);
  const stops = json('transitous-geocode-stops').map(matchToPlace);
  expect(stops.every((p: { kind: string; stopId?: string }) => p.kind === 'STOP' && p.stopId)).toBe(true);
  expect(matchToPlace(json('transitous-reverse-geocode')[0]).name).toBeTruthy();
  const mapStops = json('transitous-map-stops');
  expect(mapStops.some((s: { stopId?: string }) => s.stopId)).toBe(true);
});

test('Stride routes, rides and ride stops', () => {
  const routes = json('stride-gtfs-routes').map(routeToDomain);
  expect(routes.length).toBeGreaterThan(0);
  expect(routes.every((r: { mkt: string; date: string }) => r.mkt !== '' && /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true);
  expect(json('stride-gtfs-rides')[0].id).toBeGreaterThan(0);
  const stops = lineStops(json('stride-ride-stops'));
  expect(stops.length).toBeGreaterThan(1);
  for (let i = 1; i < stops.length; i++) expect(stops[i].offsetSec).toBeGreaterThanOrEqual(stops[i - 1].offsetSec);
  const deps = json('stride-departures');
  expect(deps.length).toBeGreaterThan(0);
  expect(deps[0].gtfs_ride__journey_ref).toMatch(/_\d{6}$/);
});

test('Photon and Nominatim results become places', () => {
  expect(json('photon-search').features.map(featureToPlace).filter(Boolean).length).toBeGreaterThan(0);
  expect(json('nominatim-search').map(nominatimToPlace).filter(Boolean).length).toBeGreaterThan(0);
});

test('a real SIRI snapshot decodes and parses', () => {
  const text = brotliDecompressSync(readFileSync(join(dir, 'siri-snapshot.json.br'))).toString('utf8');
  const minute = parseInstant(`${readFileSync(join(dir, 'siri-snapshot.url.txt'), 'utf8').match(/(\d{4})\/(\d{2})\/(\d{2})\/(\d{2})\/(\d{2})\.br/)!.slice(1, 6).reduce((s, p, i) => s + p + ['-', '-', 'T', ':', ':00Z'][i], '')}`)!;
  const t0 = Date.now();
  const vs = parseSnapshotJson(text, minute);
  const ms = Date.now() - t0;
  console.log(`SIRI snapshot: ${(text.length / 1e6).toFixed(1)} MB of JSON, ${vs.length} vehicles parsed in ${ms} ms (Node)`);
  expect(vs.length).toBeGreaterThan(1000);
  expect(vs.every((v) => v.lat !== 0 && minute - v.recordedAt <= 300)).toBe(true);
  const byLine = new Map([...groupBy(vs, (v) => v.lineRef)].map(([k, list]) => [k, latestPerVehicle(list)]));
  expect(vehicleCount({ minute, fetchedAt: minute, byLine })).toBeGreaterThan(1000);
  expect(fetchedAt('siri-snapshot')).toBeGreaterThan(minute);
});

test('a Photon railway station is a train place (I15.4)', () => {
  const station = featureToPlace({ geometry: { coordinates: [34.798, 32.084] }, properties: { name: 'תל אביב סבידור מרכז', osm_key: 'railway', osm_value: 'station' } });
  expect(station?.mode).toBe('TRAIN');
  expect(featureToPlace({ geometry: { coordinates: [34.798, 32.084] }, properties: { name: 'Azrieli', osm_key: 'shop', osm_value: 'mall' } })?.mode).toBeUndefined();
});

test('nearby stops listed several times over, identically, come once (W4)', async () => {
  const { TransitousApi } = require('../src/data/transitousApi') as typeof import('../src/data/transitousApi');
  const stop = { name: 'ת. רכבת תל אביב - סבידור/הורדה', stopId: 'il-Israel-MOT_1', stopCode: '27997', lat: 32.084, lon: 34.798 };
  (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200, text: async () => JSON.stringify([stop, { ...stop, stopId: 'x_2' }, { ...stop, stopId: 'x_3' }]), json: async () => [stop, { ...stop, stopId: 'x_2' }, { ...stop, stopId: 'x_3' }] });
  const stops = await new TransitousApi().nearbyStops({ lat: 32.084, lon: 34.798 });
  expect(stops).toHaveLength(1);
});
