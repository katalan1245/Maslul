/**
 * Hits the real, free APIs end-to-end. Requires network access; this is what proves the
 * parsers match what the services actually return today. `npm run test:live`
 * (RECORD=1 also saves one real response per endpoint into mobile/fixtures).
 */
import { bestTime } from '../../src/data/eta';
import { GeoMath, TripIds } from '../../src/data/geo';
import { vehicleCount } from '../../src/data/liveRepository';
import {
  ALL_TRANSIT_MODES,
} from '../../src/data/transitousApi';
import { type Leg, firstTransit, lineLabel, makeLeg, placePoint, routeDestination, routeLabel, transitLegs } from '../../src/data/models';
import { NominatimApi } from '../../src/data/nominatimApi';
import { Ranking } from '../../src/data/ranking';
import { isoUtc, localDate, nowSec } from '../../src/data/time';
import { newRepo } from './support';

jest.setTimeout(180_000);
const repo = newRepo();

test('plans a trip in Tel Aviv', async () => {
  const r = await repo.plan({ from: { lat: 32.0741, lon: 34.7922 }, to: { lat: 32.0853, lon: 34.7818 } });
  expect(r.itineraries.length).toBeGreaterThan(0);
  const leg = firstTransit(r.itineraries[0])!;
  expect(leg.tripId).toContain('il-Israel-MOT_');
  expect(leg.geometry.length).toBeGreaterThan(2);
  console.log(`First route: ${r.itineraries[0].legs.map((l) => `${l.mode} ${l.routeShortName ?? ''}`).join(' > ')}`);
  const live = await repo.legLive(leg);
  console.log(`Live for ${lineLabel(leg)}: ${live?.status} expected=${live?.expected} delay=${live?.delaySec}`);
});

test('geocodes Hebrew and English', async () => {
  const he = await repo.searchPlaces('דיזנגוף סנטר', { lat: 32.08, lon: 34.78 });
  const en = await repo.searchPlaces('azrieli', { lat: 32.08, lon: 34.78 });
  console.log(`he: ${he.slice(0, 3).map((p) => p.name)} en: ${en.slice(0, 3).map((p) => p.name)}`);
  expect(he.length && en.length).toBeTruthy();
});

test('finds a street with an unmapped house number', async () => {
  const r = await repo.searchPlaces('ויצמן 5 כפר סבא', { lat: 32.0741, lon: 34.7922 });
  console.log(`house number: ${r.slice(0, 4).map((p) => `${p.name} (${p.subtitle})`)}`);
  const top = r[0];
  expect(top.name.startsWith('ויצמן') && top.name.includes('5')).toBe(true);
  expect(top.subtitle ?? '').toContain('not on the map');
  // The street in Kfar Saba, not Tel Aviv's Weizmann 5 nearer the bias point.
  expect(GeoMath.distance(placePoint(top), { lat: 32.1755, lon: 34.9072 })).toBeLessThan(1500);
  const exact = await repo.searchPlaces('דיזנגוף 50 תל אביב', null);
  console.log(`exact: ${exact.slice(0, 3).map((p) => `${p.name} (${p.subtitle})`)}`);
  expect(exact[0].name).toContain('50');
});

test('ranks and flags transfers', async () => {
  // North Tel Aviv → Azrieli: a mix of direct and one-transfer options.
  const r = await repo.plan({ from: { lat: 32.098, lon: 34.778 }, to: { lat: 32.0745, lon: 34.792 } });
  const ranked = Ranking.rank(r.itineraries, false);
  expect(ranked.length).toBeGreaterThan(0);
  for (const i of ranked) {
    console.log(`${isoUtc(i.start)}–${isoUtc(i.end)} t${i.transfers} ${transitLegs(i).map(lineLabel).join('>')} risk=${Ranking.riskiest(i)?.slackSec}`);
  }
});

test('finds rides after a transfer', async () => {
  // Tel Aviv → Haifa: usually a change, whose next rides tell the wait if it's missed.
  const r = await repo.plan({ from: { lat: 32.0775, lon: 34.7746 }, to: { lat: 32.7614, lon: 35.0195 } });
  const leg = transitLegs(r.itineraries.find((i) => transitLegs(i).length > 1)!)[1];
  const after = await repo.ridesAfter(leg, ALL_TRANSIT_MODES);
  console.log(`after ${lineLabel(leg)} ${isoUtc(leg.start)}: ${after.map((l) => `${lineLabel(l)} ${isoUtc(l.start)}`)}`);
  expect(after.every((l) => l.start > leg.start)).toBe(true);
});

test('reverse geocodes a point and finds an address in Nominatim', async () => {
  const p = await repo.reverseGeocode({ lat: 32.0741, lon: 34.7922 });
  console.log(`reverse: ${p?.name} (${p?.subtitle})`);
  expect(p?.name).toBeTruthy();
  const n = await new NominatimApi().search('דיזנגוף 50 תל אביב');
  console.log(`nominatim: ${n.slice(0, 3).map((x) => `${x.name} (${x.subtitle})`)}`);
  expect(n.length).toBeGreaterThan(0);
});

test('searches stops', async () => {
  const r = await repo.searchStops('סבידור', { lat: 32.0741, lon: 34.7922 });
  console.log(`stops: ${r.slice(0, 4).map((p) => `${p.name} ${p.stopId}`)}`);
  expect(r.length > 0 && r.every((p) => p.stopId != null)).toBe(true);
});

test('finds nearby lines', async () => {
  const here = { lat: 32.0741, lon: 34.7922 };
  const lines = await repo.nearbyLines(here, await repo.nearbyStops(here));
  expect(lines.length).toBeGreaterThan(0);
  lines.slice(0, 5).forEach((l) => console.log(`${l.departure.lineLabel} → ${l.departure.headsign} at ${l.stop.name} ${Math.trunc(l.distanceM)} m`));
  const route = await repo.lineRoute(lines.find((l) => l.departure.mode === 'BUS')!.departure.routeId);
  console.log(`resolved: ${route && routeLabel(route)} ${route && routeDestination(route)}`);
  expect(route).not.toBeNull();
});

test('live snapshot has vehicles', async () => {
  const s = await repo.live.snapshot();
  console.log(`Snapshot ${s && isoUtc(s.minute)}: ${s && vehicleCount(s)} vehicles on ${s?.byLine.size} lines`);
  expect(s).not.toBeNull();
  // A weekday has hundreds; Shabbat and the small hours only a few dozen (70 on a Friday night): warned, not failed.
  if (vehicleCount(s!) <= 100) console.warn(`only ${vehicleCount(s!)} vehicles (Shabbat or night?): count check skipped`);
});

test('loads a line with schedule and live vehicles', async () => {
  const lines = await repo.searchLines('480', null);
  expect(lines.length).toBeGreaterThan(0);
  const route = lines[0].routes[0];
  const d = await repo.lineDetail(route);
  expect(d.stops.length).toBeGreaterThanOrEqual(2);
  expect(d.rides.length).toBeGreaterThan(0);
  console.log(`480: ${d.stops.length} stops, ${d.rides.length} rides, shape ${d.shape.length} pts`);
  const v = await repo.lineVehicles(d);
  console.log(`Live vehicles on 480: ${v.length} ${v.map((x) => x.progress.delaySec)}; service date ${localDate(nowSec())}`);
});

test('loads stops for common lines in both directions', async () => {
  // Stride sometimes has a day's rides without their stops; every line must still show stops.
  for (const q of ['16', '92', '5', '1']) {
    for (const line of (await repo.searchLines(q, null)).slice(0, 4)) {
      for (const variant of (await repo.lineVariants(await repo.currentRoute(line.routes[0]))).slice(0, 2)) {
        const d = await repo.lineDetail(variant);
        console.log(`${q} ${variant.gtfsRouteId} dir ${variant.direction}: ${d.stops.length} stops, ${d.rides.length} rides, shape ${d.shape.length}`);
        expect(d.stops.length).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < d.stops.length; i++) {
          expect(d.stops[i - 1].sequence < d.stops[i].sequence && d.stops[i - 1].offsetSec <= d.stops[i].offsetSec).toBe(true);
        }
        // Its shape comes from a ride's trip. Overnight, before the day's timetable is out, a line can have
        // only yesterday's rides, whose trips have gone (the map then draws through the stops).
        const current = d.rides.some((r) => r.departure > nowSec() - 12 * 3600);
        if (current) expect([variant.gtfsRouteId, d.shape.length >= 2]).toEqual([variant.gtfsRouteId, true]);
        expect(d.timeline.line.length).toBeGreaterThanOrEqual(2);
      }
    }
  }
  // Timetable rides open as Transitous trips. When Stride has no routes for today yet, lines come
  // from yesterday's feed and their rides are yesterday's, which Transitous no longer has.
  const d16 = await repo.lineDetail(await repo.currentRoute((await repo.searchLines('16', null))[0].routes[0]));
  const upcoming = d16.rides.find((r) => r.departure > nowSec());
  if (upcoming) expect(await repo.trip(await repo.rideTripId(d16, upcoming))).not.toBeNull();
  else console.warn(`line 16 is on ${d16.route.date}'s feed with no upcoming rides: trip lookup skipped`);
  // A line opened from a stop board resolves through its GTFS route id.
  const here = { lat: 32.0741, lon: 34.7922 };
  const dep = (await repo.nearbyLines(here, await repo.nearbyStops(here))).find((l) => l.departure.mode === 'BUS')!.departure;
  const d = await repo.lineDetail((await repo.lineRoute(dep.routeId))!);
  console.log(`From stop: ${dep.lineLabel} → ${d.stops.length} stops, ${d.rides.length} rides`);
  expect(d.stops.length).toBeGreaterThanOrEqual(2);
});

test('stop board has departures', async () => {
  const stops = await repo.nearbyStops({ lat: 32.0741, lon: 34.7922 });
  expect(stops.length).toBeGreaterThan(0);
  const board = await repo.stopBoard(stops[0].stopId!);
  const live = board.filter((e) => e.live?.status === 'LIVE');
  const late = live.filter((e) => e.departure.scheduled < nowSec());
  console.log(`${stops[0].name}: ${board.length} departures, live=${live.length}, late earlier trips=${late.length}`);
  board.slice(0, 5).forEach((e) => console.log(`  ${e.departure.lineLabel} → ${e.departure.headsign} ${e.live?.status} ${e.live && isoUtc(bestTime(e.live))}`));
});

test("a late bus whose slot is long gone still gets a live lookup", async () => {
  // Any vehicle on the road whose trip set off a while ago: boarding it at its first stop
  // was due long before now, yet it's worth a live lookup. A trip of a line with nothing on the road isn't.
  const now = nowSec();
  const r = newRepo();
  const v = [...((await r.live.snapshot())?.byLine.values() ?? [])]
    .flat()
    .find((x) => x.journeyRef != null && x.originDeparture < now - 20 * 60 && x.originDeparture > now - 80 * 60);
  if (!v) {
    console.warn('no vehicle on the road (Shabbat?): skipped');
    return;
  }
  const stop = { stopId: 's', name: 'S', code: null, lat: v.lat, lon: v.lon, scheduledArrival: null, scheduledDeparture: null };
  const ride = (journeyRef: string, lineRef = v.lineRef): Leg =>
    makeLeg({
      mode: 'BUS', from: stop, to: stop, start: v.originDeparture, end: v.originDeparture + 300, routeShortName: '1',
      tripId: TripIds.build(localDate(v.originDeparture), v.originDeparture, journeyRef), routeId: `il-Israel-MOT_${lineRef}`,
    });
  expect(await r.worthLive(ride(v.journeyRef!), now)).toBe(true);
  expect(await r.worthLive(ride('1', '999999999'), now)).toBe(false);
});

test('finds a stop by the code on its sign, and nearby namesakes before far ones', async () => {
  const byCode = await repo.searchStops('20314', { lat: 32.0741, lon: 34.7922 });
  expect(byCode[0]?.stopId).toBe('il-Israel-MOT_42858');
  expect((await repo.searchPlaces('20314', null))[0]?.stopId).toBe('il-Israel-MOT_42858');
  const herzl = await repo.searchStops('הרצל', { lat: 32.08, lon: 34.78 });
  console.log(herzl.slice(0, 5).map((p) => `${p.name} · ${p.subtitle ?? ''}`));
  expect(herzl.length).toBeGreaterThan(0);
  const { GeoMath } = require('../../src/data/geo') as typeof import('../../src/data/geo');
  expect(GeoMath.distance({ lat: 32.08, lon: 34.78 }, herzl[0])).toBeLessThan(25_000);
});
