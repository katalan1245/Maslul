import { Polyline, TripIds, tripNumberOf } from '../src/data/geo';
import { forTrip, parseSnapshotJson } from '../src/data/liveRepository';
import { LongName, type Place, legDurationSec, modeFromGtfsRouteType, modeFromMotis } from '../src/data/models';
import { TransitRepository } from '../src/data/transitRepository';
import { TransitousApi, cityFromDescription, cleanHeadsign, headsignOf, itineraryToDomain, legToDomain, motisModes } from '../src/data/transitousApi';
import { instant } from './helpers';

const close = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);

test('decodes Google polyline at precision 5', () => {
  const pts = Polyline.decode('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
  expect(pts).toHaveLength(3);
  close(pts[0].lat, 38.5);
  close(pts[0].lon, -120.2);
  close(pts[2].lat, 43.252);
  close(pts[2].lon, -126.453);
});

test('parses Transitous trip ids', () => {
  const p = TripIds.parse('20260927_21:20_il-Israel-MOT_585026147_270926')!;
  expect(p.serviceDate).toBe('2026-09-27');
  expect(p.originDeparture).toBe(instant('2026-09-27T18:20:00Z')); // IDT = UTC+3
  expect(tripNumberOf(p)).toBe('585026147');
  expect(p.gtfsTripId).toBe('585026147_270926');
});

test('parses trip ids past midnight', () => {
  expect(TripIds.parse('20260927_25:10_il-Israel-MOT_1_270926')!.originDeparture).toBe(instant('2026-09-27T22:10:00Z'));
});

test('builds trip ids round trip', () => {
  expect(TripIds.build('2026-09-27', instant('2026-09-27T20:50:00Z'), '25271287_270926')).toBe('20260927_23:50_il-Israel-MOT_25271287_270926');
  // After midnight, the hour keeps counting (GTFS style).
  const late = TripIds.build('2026-09-27', instant('2026-09-27T22:05:00Z'), '9_270926');
  expect(late).toBe('20260927_25:05_il-Israel-MOT_9_270926');
  expect(TripIds.parse(late)!.originDeparture).toBe(instant('2026-09-27T22:05:00Z'));
});

test('builds trip ids from Stride journey refs', () => {
  // An after-midnight ride listed under the 27th belongs to the 26th's service day.
  expect(TripIds.fromJourney('1401323_260926', instant('2026-09-26T21:10:00Z'), '2026-09-27')).toBe('20260926_24:10_il-Israel-MOT_1401323_260926');
});

test('rejects foreign trip ids', () => {
  expect(TripIds.parse('20260927_21:20_de-DELFI_123')).toBeNull();
  expect(TripIds.parse(null)).toBeNull();
  expect(TripIds.lineRef('il-Israel-MOT_7020')).toBe('7020');
  expect(TripIds.lineRef('de-x_1')).toBeNull();
});

test('parses Stride long names', () => {
  const [o, d] = LongName.parse('ת.רכבת תל אביב - סבידור/רציפים B-תל אביב יפו<->ת. מרכזית ירושלים/הורדה-ירושלים-1#');
  expect(o).toBe('ת.רכבת תל אביב - סבידור/רציפים B, תל אביב יפו');
  expect(d).toBe('ת. מרכזית ירושלים/הורדה');
  expect(LongName.parse('הדסה עין כרם-ירושלים<->נווה יעקב - צפון-ירושלים-10')[1]).toBe('נווה יעקב - צפון, ירושלים');
  const [o3, d3] = LongName.parse("נתב''ג-נמל תעופה בן גוריון<->נהריה-נהריה");
  expect(o3).toBe("נתב''ג, נמל תעופה בן גוריון");
  expect(d3).toBe('נהריה');
});

test('cleans headsigns', () => {
  expect(cleanHeadsign('תל אביב יפו_אוניברסיטת ת"א')).toBe('אוניברסיטת ת"א, תל אביב יפו');
  expect(cleanHeadsign('ירושלים_ת. מרכזית ירושלים')).toBe('ת. מרכזית ירושלים');
  expect(cleanHeadsign('Haifa')).toBe('Haifa');
});

test('maps modes', () => {
  expect(modeFromMotis('TRAM')).toBe('LIGHT_RAIL');
  expect(modeFromMotis('REGIONAL_RAIL')).toBe('TRAIN');
  expect(modeFromMotis('AERIAL_LIFT')).toBe('CABLE_CAR');
  expect(modeFromGtfsRouteType('2')).toBe('TRAIN');
  expect(motisModes(['BUS', 'TRAIN', 'LIGHT_RAIL', 'METRO', 'CABLE_CAR', 'FERRY'])).toBeNull();
  expect(motisModes(['BUS'])).toBe('BUS,COACH');
});

test('parses city from MOT description', () => {
  expect(cityFromDescription('רחוב: דרך נמיר 25 עיר: תל אביב יפו רציף:  קומה:')).toBe('תל אביב יפו');
  expect(cityFromDescription(null)).toBeNull();
});

test('merges places without duplicates', () => {
  const pl = (name: string, lat: number, lon: number, rest: Partial<Place> = {}): Place => ({ name, lat, lon, kind: 'POI', ...rest });
  const a = [pl('דיזנגוף סנטר', 32.0754, 34.7749), pl('Stop A', 32.0, 34.0, { kind: 'STOP' })];
  const b = [pl('דיזנגוף סנטר', 32.0756, 34.7751), pl('Other', 31.0, 35.0)];
  expect(TransitRepository.mergePlaces(a, b).map((p) => p.name)).toEqual(['דיזנגוף סנטר', 'Stop A', 'Other']);
  // One campus, entries 1 km apart that read the same: shown once; a different subtitle stays.
  const campus = [
    pl('Tel Aviv University', 32.1133, 34.8044, { subtitle: 'תל אביב' }),
    pl('Tel Aviv University', 32.122, 34.805, { subtitle: 'תל אביב' }),
    pl('Tel Aviv University', 32.118, 34.804, { subtitle: 'Dormitories' }),
  ];
  expect(TransitRepository.mergePlaces(campus, []).map((p) => p.subtitle)).toEqual(['תל אביב', 'Dormitories']);
});

test('parses SIRI snapshot', () => {
  const json = `
  {"Siri":{"ServiceDelivery":{"ResponseTimestamp":"2026-09-27T21:42:00+03:00",
    "StopMonitoringDelivery":{"MonitoredStopVisit":[
      {"RecordedAtTime":"2026-09-27T21:41:24+03:00","MonitoredVehicleJourney":{"LineRef":"17903",
        "FramedVehicleJourneyRef":{"DataFrameRef":"2026-09-27","DatedVehicleJourneyRef":"586166398"},
        "OperatorRef":"25","OriginAimedDepartureTime":"2026-09-27T21:25:00+03:00",
        "VehicleLocation":{"Longitude":"34.901882","Latitude":"32.095497"},"Bearing":"355","Velocity":"4",
        "VehicleRef":"40224003","MonitoredCall":{"StopPointRef":"32226","Order":"18","DistanceFromStop":"5497"}}},
      {"RecordedAtTime":"2026-09-27T21:10:00+03:00","MonitoredVehicleJourney":{"LineRef":"1",
        "OriginAimedDepartureTime":"2026-09-27T21:00:00+03:00","VehicleLocation":{"Longitude":"34.8","Latitude":"32.1"}}},
      {"RecordedAtTime":"2026-09-27T21:41:00+03:00","MonitoredVehicleJourney":{"LineRef":"2",
        "OriginAimedDepartureTime":"2026-09-27T21:30:00+03:00","VehicleLocation":{"Longitude":"34.8","Latitude":"32.1"},
        "MonitoredCall":{"Order":"5","DistanceFromStop":"0"}}}
    ]}}}}`;
  const vs = parseSnapshotJson(json, instant('2026-09-27T18:42:00Z'));
  // The 32-minute-old "ghost" on line 1 is dropped.
  expect(vs.map((v) => v.lineRef)).toEqual(['17903', '2']);
  const v = vs[0];
  expect(v.journeyRef).toBe('586166398');
  expect(v.originDeparture).toBe(instant('2026-09-27T18:25:00Z'));
  close(v.lat, 32.095497, 1e-9);
  expect(v.bearing).toBe(355);
  expect(v.distanceFromStart).toBe(5497);
  // "0" past the first stop means "unknown".
  expect(vs[1].distanceFromStart).toBeNull();
  expect(forTrip(vs, '586166398', null)).toBe(v);
  expect(forTrip(vs, null, instant('2026-09-27T18:30:20Z'))).toBe(vs[1]);
});

test('a car drop-off ends when its padding is taken back', () => {
  // MOTIS: a 12-minute drive, then a walk of -2 minutes; within a 10-minute limit.
  const itin = itineraryToDomain(
    JSON.parse(`{"legs":[
      {"mode":"CAR","startTime":"2026-10-05T20:00:00Z","endTime":"2026-10-05T20:12:00Z","from":{"name":"START"},"to":{"name":""}},
      {"mode":"WALK","startTime":"2026-10-05T20:12:00Z","endTime":"2026-10-05T20:10:00Z","from":{"name":""},"to":{"name":"Stop"}},
      {"mode":"BUS","startTime":"2026-10-05T20:12:00Z","endTime":"2026-10-05T20:40:00Z","from":{"name":"Stop"},"to":{"name":"END"},"tripId":"t"}
    ]}`),
  );
  expect(itin.legs[0].mode).toBe('CAR');
  expect(legDurationSec(itin.legs[0])).toBe(600);
  expect(legDurationSec(itin.legs[1])).toBe(0);
  expect(itin.legs[0].end).toBe(itin.legs[1].start);
});

test("a train's number isn't taken for where it goes", () => {
  const itin = itineraryToDomain(
    JSON.parse(`{"legs":[
      {"mode":"RAIL","startTime":"2026-10-11T09:56:00Z","endTime":"2026-10-11T11:00:00Z","from":{"name":"A"},"to":{"name":"B"},"tripId":"t","headsign":"114"},
      {"mode":"BUS","startTime":"2026-10-11T11:05:00Z","endTime":"2026-10-11T11:20:00Z","from":{"name":"B"},"to":{"name":"C"},"tripId":"u","headsign":"חיפה_בת גלים"}
    ]}`),
  );
  expect(itin.legs.map((l) => l.headsign)).toEqual([null, 'בת גלים, חיפה']);
});

test('trains go where their trip ends, not by number', () => {
  // Israel Railways' headsign is the train number.
  expect(headsignOf('108', 'נהריה')).toBe('נהריה');
  // Upstream shows the bare number; the port showed nothing for it already, and still does.
  expect(headsignOf('108', null)).toBeNull();
  expect(headsignOf('חיפה_גרנד קניון', 'גרנד קניון/שמחה גולן')).toBe('גרנד קניון, חיפה');
});

test("reads a train's destination from the plan", () => {
  const leg = legToDomain({
    mode: 'REGIONAL_RAIL', from: { name: 'A', lat: 31.7, lon: 35.2 }, to: { name: 'B', lat: 32.1, lon: 34.8 },
    startTime: '2026-10-12T06:09:00Z', endTime: '2026-10-12T06:55:00Z', headsign: '726', tripTo: { name: 'הרצליה', lat: 32.16, lon: 34.8 },
    routeShortName: '', tripId: 't',
  });
  expect(leg.headsign).toBe('הרצליה');
});

test('a lift is one drive: a car again after walking is dropped', async () => {
  const car = (from: string, to: string) => ({ mode: 'CAR', startTime: from, endTime: to, from: { name: 'A', lat: 32, lon: 34.8 }, to: { name: 'B', lat: 32, lon: 34.8 } });
  const bus = { ...car('2026-10-12T06:20:00Z', '2026-10-12T06:40:00Z'), mode: 'BUS', tripId: 't', routeShortName: '18' };
  const walk = { ...car('2026-10-12T06:10:00Z', '2026-10-12T06:20:00Z'), mode: 'WALK' };
  const body = {
    itineraries: [
      { legs: [car('2026-10-12T06:00:00Z', '2026-10-12T06:10:00Z'), walk, bus] },
      { legs: [car('2026-10-12T06:00:00Z', '2026-10-12T06:05:00Z'), { ...walk, startTime: '2026-10-12T06:05:00Z', endTime: '2026-10-12T06:08:00Z' }, car('2026-10-12T06:08:00Z', '2026-10-12T06:20:00Z'), bus] },
    ],
  };
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));
  const r = await new TransitousApi().plan({ from: { lat: 32, lon: 34.8 }, to: { lat: 32.1, lon: 34.8 } });
  fetch.mockRestore();
  expect(r.itineraries).toHaveLength(1);
  expect(r.itineraries[0].legs.filter((l) => l.mode === 'CAR')).toHaveLength(1);
});

test("a stop's departures are its own, not those of a same-name stop across the road (L3)", async () => {
  const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ stopTimes: [] }), { status: 200 }));
  await new TransitousApi().stopTimes('il-Israel-MOT_45039');
  const url = String(fetch.mock.calls[0][0]);
  fetch.mockRestore();
  expect(url).toContain('exactRadius=true');
});
