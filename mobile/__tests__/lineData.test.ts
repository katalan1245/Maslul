/** The line screen's stop pattern and timetable, as parsed from Stride and Transitous. */
import type { Departure, Ride } from '../src/data/models';
import { rideTripNumber } from '../src/data/models';
import { type RideStopDto, lineStops } from '../src/data/strideApi';
import { startOfDay } from '../src/data/time';
import { TransitRepository } from '../src/data/transitRepository';
import { instant } from './helpers';

test('parses Stride ride stops in order', () => {
  // Real Stride rows (trimmed), deliberately out of order and with a duplicated row.
  const json = `
  [{"id":5639903815,"gtfs_stop_id":48804300,"gtfs_ride_id":157928872,"arrival_time":"2026-09-28T04:04:10+00:00",
    "departure_time":"2026-09-28T04:04:10+00:00","stop_sequence":3,"gtfs_ride__journey_ref":"279000_270926",
    "gtfs_stop__code":32270,"gtfs_stop__lat":32.0901,"gtfs_stop__lon":34.8662,"gtfs_stop__name":"C","gtfs_stop__city":"פתח תקווה"},
   {"id":5639903813,"gtfs_stop_id":48819360,"gtfs_ride_id":157928872,"arrival_time":"2026-09-28T04:00:00+00:00",
    "departure_time":"2026-09-28T04:00:00+00:00","stop_sequence":1,"pickup_type":0,"drop_off_type":1,"shape_dist_traveled":null,
    "gtfs_ride__journey_ref":"279000_270926","gtfs_stop__date":"2026-09-28","gtfs_stop__code":31345,"gtfs_stop__lat":32.092044,
    "gtfs_stop__lon":34.865337,"gtfs_stop__name":"מסוף יותם ויואב/רציפים","gtfs_stop__city":"פתח תקווה","gtfs_route__line_ref":1081},
   {"id":5639903814,"gtfs_stop_id":48804282,"gtfs_ride_id":157928872,"arrival_time":"2026-09-28T04:01:59+00:00",
    "departure_time":"2026-09-28T04:01:59+00:00","stop_sequence":2,"gtfs_stop__code":32269,"gtfs_stop__lat":32.091161,
    "gtfs_stop__lon":34.8655,"gtfs_stop__name":"B"},
   {"id":5639903814,"gtfs_stop_id":48804282,"gtfs_ride_id":157928872,"arrival_time":"2026-09-28T04:01:59+00:00",
    "departure_time":"2026-09-28T04:01:59+00:00","stop_sequence":2,"gtfs_stop__code":32269,"gtfs_stop__lat":32.091161,
    "gtfs_stop__lon":34.8655,"gtfs_stop__name":"B"}]`;
  const stops = lineStops(JSON.parse(json) as RideStopDto[]);
  expect(stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
  expect(stops.map((s) => s.offsetSec)).toEqual([0, 119, 250]);
  expect(stops[0].code).toBe('31345');
  expect(stops[0].name).toBe('מסוף יותם ויואב/רציפים');
  expect(stops[0].gtfsStopId).toBe(48819360);
  expect(stops[1].city).toBeNull();
});

test('empty Stride day yields no stops', () => {
  // Stride lists a day's rides before loading their stops: gtfs_ride_stops returns [].
  expect(lineStops([])).toEqual([]);
});

const dep = (tripId: string, routeId: string | null, at: string, stopId: string, label: string): Departure => ({
  tripId, routeId, mode: 'BUS', lineLabel: label, headsign: '', agency: null, routeColor: null, scheduled: instant(at),
  stop: { stopId, name: '', code: null, lat: 0, lon: 0, scheduledArrival: null, scheduledDeparture: instant(at) },
});

test('builds timetable from Transitous departures', () => {
  const dayStart = startOfDay('2026-09-28');
  const d = (tripId: string, routeId: string | null, at: string) => dep(tripId, routeId, at, 'il-Israel-MOT_1', '5');
  const deps = [
    d('20260928_07:10_il-Israel-MOT_585694720_280926', 'il-Israel-MOT_4212', '2026-09-28T04:10:00Z'),
    d('20260928_06:40_il-Israel-MOT_585694713_280926', 'il-Israel-MOT_4212', '2026-09-28T03:40:00Z'),
    // Same trip listed twice (e.g. two platforms of one stop).
    d('20260928_06:40_il-Israel-MOT_585694713_280926', 'il-Israel-MOT_4212', '2026-09-28T03:40:00Z'),
    // Other direction / other line at the same stop.
    d('20260928_06:45_il-Israel-MOT_1_280926', 'il-Israel-MOT_4213', '2026-09-28T03:45:00Z'),
    // Next service day.
    d('20260929_06:40_il-Israel-MOT_585694799_290926', 'il-Israel-MOT_4212', '2026-09-29T03:40:00Z'),
    // Not an MOT trip.
    d('20260928_06:50_de-DELFI_1', 'il-Israel-MOT_4212', '2026-09-28T03:50:00Z'),
  ];
  const rides = TransitRepository.ridesFromDepartures(deps, 4212, dayStart);
  expect(rides.map((r) => r.journeyRef)).toEqual(['585694713_280926', '585694720_280926']);
  expect(rides[0].departure).toBe(instant('2026-09-28T03:40:00Z'));
  expect(rideTripNumber(rides[0])).toBe('585694713');
  expect(rides[0].tripId).toBe('20260928_06:40_il-Israel-MOT_585694713_280926');
  // Listed at the second stop (first is an operational stop), 2 min into the line.
  const second = TransitRepository.ridesFromDepartures(deps, 4212, dayStart, 120);
  expect(second[0].departure).toBe(instant('2026-09-28T03:38:00Z'));
});

test('matches Stride rides to Transitous trips across feeds', () => {
  const d = (tripId: string, routeId: string, at: string) => dep(tripId, routeId, at, 'il-Israel-MOT_44161', '16');
  const deps = [
    d('20260928_06:40_il-Israel-MOT_584685696_280926', 'il-Israel-MOT_1081', '2026-09-28T03:40:00Z'),
    d('20260928_07:00_il-Israel-MOT_279000_280926', 'il-Israel-MOT_1081', '2026-09-28T04:00:00Z'),
    d('20260928_07:00_il-Israel-MOT_1_280926', 'il-Israel-MOT_1082', '2026-09-28T04:00:00Z'),
  ];
  const ride = (ref: string, at: string): Ride => ({ journeyRef: ref, departure: instant(at) });
  // Stride's journey ref carries its own feed's suffix (27/09), Transitous's the next day's.
  expect(TransitRepository.matchTripId(deps, ride('279000_270926', '2026-09-28T04:00:00Z'), 1081)).toBe(
    '20260928_07:00_il-Israel-MOT_279000_280926',
  );
  // Renumbered trip: fall back to the same line at the same time.
  expect(TransitRepository.matchTripId(deps, ride('999_270926', '2026-09-28T03:40:00Z'), 1081)).toBe(
    '20260928_06:40_il-Israel-MOT_584685696_280926',
  );
  expect(TransitRepository.matchTripId(deps, ride('999_270926', '2026-09-28T05:00:00Z'), 1081)).toBeNull();
  // Matched at a later stop by the ride's departure plus the stop's offset.
  expect(TransitRepository.matchTripId(deps, ride('998_270926', '2026-09-28T03:35:00Z'), 1081, 300)).toBe(
    '20260928_06:40_il-Israel-MOT_584685696_280926',
  );
});
