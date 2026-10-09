import { TripTimeline } from '../../src/data/eta';
import { type Itinerary, type LineRoute, type Place, type PlanResult, makeLeg } from '../../src/data/models';
import type { LineDetail } from '../../src/data/transitRepository';
import { localDate, nowSec } from '../../src/data/time';
import { call, itinOf } from '../helpers';

const place = (name: string, lat: number, lon: number, kind: Place['kind'] = 'POI'): Place => ({ name, lat, lon, kind, subtitle: 'Tel Aviv-Yafo' });

export const DIZENGOFF = place('Dizengoff Center', 32.0753, 34.7748);
export const AZRIELI = place('Azrieli Center', 32.0743, 34.7922);
const HOME = { lat: 32.0853, lon: 34.7818 };

/** A bus ride [inMin] minutes from now, with walks on either side. */
function busTrip(id: string, inMin: number, line: string): Itinerary {
  const t = nowSec() + inMin * 60;
  const a = call('s1', 'Arlozorov/Ibn Gabirol', 32.0866, 34.7818, t, t);
  const b = call('s2', 'Dizengoff Center', 32.0756, 34.775, t + 600, t + 600);
  return itinOf(
    id,
    makeLeg({ mode: 'WALK', from: call(null, 'Start', HOME.lat, HOME.lon), to: a, start: t - 240, end: t, distanceM: 300 }),
    makeLeg({ mode: 'BUS', from: a, to: b, start: t, end: t + 600, routeShortName: line, headsign: 'Bat Yam', tripId: `trip-${id}`, agencyName: 'Dan' }),
    makeLeg({ mode: 'WALK', from: b, to: call(null, 'Dizengoff Center', DIZENGOFF.lat, DIZENGOFF.lon), start: t + 600, end: t + 720, distanceM: 100 }),
  );
}

export const ROUTE_480: LineRoute = {
  gtfsRouteId: 1,
  lineRef: 480,
  operatorRef: 3,
  shortName: '480',
  longName: 'ת. מרכזית ירושלים-ירושלים<->ת. רכבת סבידור-תל אביב יפו-1#',
  mkt: '10480',
  direction: '1',
  alternative: '#',
  agency: 'Egged',
  mode: 'BUS',
  date: localDate(nowSec()),
};

/** Calls the screens make, answered from canned data; anything else resolves empty. */
export function makeFakeRepo() {
  const planCalls: unknown[] = [];
  const known = {
    planCalls,
    searchPlaces: async (text: string) => [DIZENGOFF, AZRIELI].filter((p) => p.name.toLowerCase().includes(text.toLowerCase().split(' ')[0])),
    searchStops: async () => [],
    reverseGeocode: async () => null,
    nearbyStops: async () => [],
    plan: async (req: unknown): Promise<PlanResult> => {
      planCalls.push(req);
      return { itineraries: [busTrip('a', 12, '5'), busTrip('b', 30, '61')], walkOnly: null, nextCursor: null, previousCursor: null };
    },
    worthLive: async () => false,
    legLive: async () => null,
    shuttleOptions: async () => [],
    boardCandidates: async () => [],
    searchLines: async (q: string) => (q.includes('480') ? [{ routes: [ROUTE_480] }] : []),
    currentRoute: async (r: LineRoute) => r,
    lineVariants: async (r: LineRoute) => [r],
    lineDetail: async (route: LineRoute): Promise<LineDetail> => {
      const stops = [
        { gtfsStopId: 1, code: '1', name: 'Jerusalem Central Station', city: 'Jerusalem', lat: 31.789, lon: 35.203, sequence: 1, offsetSec: 0 },
        { gtfsStopId: 2, code: '2', name: 'Savidor Center', city: 'Tel Aviv', lat: 32.084, lon: 34.798, sequence: 2, offsetSec: 3600 },
      ];
      return { route, stops, shape: [], rides: [], timeline: new TripTimeline(stops, [0, 3600], []), firstStopId: null };
    },
    lineVehicles: async () => [],
    arrivalsAt: () => [],
    nearbyLines: async () => [],
  };
  return new Proxy(known as Record<string, unknown>, {
    get: (target, k: string) => (k in target ? target[k] : async () => null),
  }) as typeof known;
}
