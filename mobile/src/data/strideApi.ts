import { Http, buildUrl } from './http';
import { type GeoPoint, type Line, type LineRoute, type LineStop, type Ride, type TransitMode, modeFromGtfsRouteType } from './models';
import { type LocalDate, isoUtc, startOfDay } from './time';
import { instant } from './transitousApi';
import { distinctBy, groupBy, sortedBy } from './util';

export interface RouteDto {
  id: number;
  date?: string;
  line_ref?: number;
  operator_ref?: number;
  route_short_name?: string | null;
  route_long_name?: string | null;
  route_mkt?: string | null;
  route_direction?: string | null;
  route_alternative?: string | null;
  agency_name?: string | null;
  route_type?: string | null;
}

export interface RideDto {
  id: number;
  gtfs_route_id?: number;
  journey_ref?: string | null;
}

export interface RideStopDto {
  gtfs_stop_id?: number;
  gtfs_ride_id?: number;
  arrival_time?: string | null;
  departure_time?: string | null;
  stop_sequence?: number;
  gtfs_ride__journey_ref?: string | null;
  gtfs_stop__code?: number | null;
  gtfs_stop__lat?: number | null;
  gtfs_stop__lon?: number | null;
  gtfs_stop__name?: string | null;
  gtfs_stop__city?: string | null;
  gtfs_route__line_ref?: number | null;
}

export function routeToDomain(r: RouteDto): LineRoute {
  return {
    gtfsRouteId: r.id,
    lineRef: r.line_ref ?? 0,
    operatorRef: r.operator_ref ?? 0,
    shortName: r.route_short_name ?? '',
    longName: r.route_long_name ?? '',
    mkt: r.route_mkt ?? '',
    direction: r.route_direction ?? '',
    alternative: r.route_alternative ?? '',
    agency: r.agency_name ?? '',
    mode: modeFromGtfsRouteType(r.route_type),
    date: r.date ?? '',
  };
}

const HEBREW_LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';

export function gtfsRouteType(m: TransitMode): string | null {
  switch (m) {
    case 'BUS':
      return '3';
    case 'TRAIN':
      return '2';
    case 'LIGHT_RAIL':
      return '0';
    case 'CABLE_CAR':
      return '6';
    default:
      return null;
  }
}

/** Ride-stop rows (any order) → the ride's ordered stops with offsets from its first departure. */
export function lineStops(rows: RideStopDto[]): LineStop[] {
  const sorted = sortedBy(distinctBy(rows, (r) => r.stop_sequence ?? 0), (r) => r.stop_sequence ?? 0);
  const head = sorted[0];
  const first = head ? instant(head.departure_time ?? head.arrival_time) : null;
  if (first == null) return [];
  return sorted.map((r) => {
    const t = instant(r.arrival_time ?? r.departure_time) ?? first;
    return {
      gtfsStopId: r.gtfs_stop_id ?? 0,
      code: r.gtfs_stop__code != null ? String(r.gtfs_stop__code) : '',
      name: r.gtfs_stop__name ?? '',
      city: r.gtfs_stop__city ?? null,
      lat: r.gtfs_stop__lat ?? 0,
      lon: r.gtfs_stop__lon ?? 0,
      sequence: r.stop_sequence ?? 0,
      offsetSec: t - first,
    };
  });
}

/** Service day in Israel runs past midnight (GTFS times > 24:00). */
function dayWindow(date: LocalDate): [string, string] {
  const start = startOfDay(date);
  return [isoUtc(start), isoUtc(start + 30 * 3600)];
}

const digitsOf = (s: string) => s.replace(/\D/g, '');

/** Groups directions/alternatives into lines and orders them sensibly. */
export function groupLines(routes: LineRoute[]): Line[] {
  const lines = [...groupBy(routes, (r) => `${r.operatorRef}|${r.mkt}`).values()].map(
    (rs): Line => ({
      routes: sortedBy(
        rs,
        (r) => r.direction,
        (r) => r.alternative !== '#' && r.alternative !== '0',
        (r) => r.alternative,
      ),
    }),
  );
  const num = (l: Line) => {
    const d = digitsOf(l.routes[0].shortName);
    // Kotlin's toIntOrNull: digits that overflow an Int don't count.
    return d !== '' && Number(d) <= 2147483647 ? Number(d) : Number.MAX_SAFE_INTEGER;
  };
  return sortedBy(lines, num, (l) => l.routes[0].shortName, (l) => l.routes[0].agency);
}

/**
 * Open Bus Stride API (Hasadna / The Public Knowledge Workshop): a free mirror of the MOT
 * GTFS feed, used here for line search and daily line schedules.
 */
export class StrideApi {
  constructor(private readonly base = 'https://open-bus-stride-api.hasadna.org.il') {}

  async searchRoutes(query: string, date: LocalDate, mode: TransitMode | null = null): Promise<LineRoute[]> {
    const q = query.trim();
    const params: [string, string][] = [
      ['date_from', date],
      ['date_to', date],
      ['limit', '200'],
    ];
    if (q === '' && mode === 'TRAIN') params.push(['route_type', '2']);
    else if (q === '' && mode === 'LIGHT_RAIL') params.push(['route_type', '0']);
    else if (q === '') return [];
    else if ([...q].every((c) => /[0-9]/.test(c) || HEBREW_LETTERS.includes(c)) && /[0-9]/.test(q)) {
      params.push(['route_short_name', q]);
    } else params.push(['route_long_name_contains', q]);
    if (mode != null && q !== '') {
      const t = gtfsRouteType(mode);
      if (t != null) params.push(['route_type', t]);
    }
    return (await Http.getJson<RouteDto[]>(buildUrl(this.base, 'gtfs_routes/list', params))).map(routeToDomain);
  }

  /** Where the stop with this code (the number on its sign) is, from the newest feed. */
  async stopByCode(code: string): Promise<GeoPoint | null> {
    const rows = await Http.getJson<{ lat?: number; lon?: number }[]>(
      buildUrl(this.base, 'gtfs_stops/list', [['code', code], ['limit', '1'], ['order_by', 'date desc']]),
    );
    const r = rows[0];
    return r?.lat != null && r.lon != null ? { lat: r.lat, lon: r.lon } : null;
  }

  /** The newest day Stride has a feed for: over a weekend it can be days behind (Thursday's on Saturday). */
  async latestDate(): Promise<LocalDate | null> {
    const rows = await Http.getJson<RouteDto[]>(buildUrl(this.base, 'gtfs_routes/list', [['limit', '1'], ['order_by', 'date desc']]));
    return rows[0]?.date ?? null;
  }

  async routesByLineRef(lineRefs: number[], date: LocalDate): Promise<LineRoute[]> {
    if (lineRefs.length === 0) return [];
    const url = buildUrl(this.base, 'gtfs_routes/list', [
      ['date_from', date],
      ['date_to', date],
      ['line_refs', lineRefs.join(',')],
      ['limit', '50'],
    ]);
    return (await Http.getJson<RouteDto[]>(url)).map(routeToDomain);
  }

  /** All directions / alternatives of a line on the given day. */
  async lineVariants(operatorRef: number, mkt: string, date: LocalDate): Promise<LineRoute[]> {
    const url = buildUrl(this.base, 'gtfs_routes/list', [
      ['date_from', date],
      ['date_to', date],
      ['operator_refs', String(operatorRef)],
      ['route_mkt', mkt],
      ['limit', '50'],
    ]);
    return (await Http.getJson<RouteDto[]>(url)).map(routeToDomain);
  }

  async rides(gtfsRouteId: number): Promise<RideDto[]> {
    const url = buildUrl(this.base, 'gtfs_rides/list', [
      ['gtfs_route_id', String(gtfsRouteId)],
      ['limit', '5'],
    ]);
    return Http.getJson<RideDto[]>(url);
  }

  /** Ordered stops of one ride, with offsets from its first departure. */
  async rideStops(rideId: number, date: LocalDate): Promise<LineStop[]> {
    const [from, to] = dayWindow(date);
    const url = buildUrl(this.base, 'gtfs_ride_stops/list', [
      ['gtfs_ride_ids', String(rideId)],
      ['arrival_time_from', from],
      ['arrival_time_to', to],
      ['limit', '300'],
    ]);
    return lineStops(await Http.getJson<RideStopDto[]>(url));
  }

  /** Every departure of the route from its first stop during the service day. */
  async departures(gtfsRouteId: number, firstStopId: number, date: LocalDate): Promise<Ride[]> {
    const [from, to] = dayWindow(date);
    const url = buildUrl(this.base, 'gtfs_ride_stops/list', [
      ['gtfs_ride__gtfs_route_id', String(gtfsRouteId)],
      ['gtfs_stop_ids', String(firstStopId)],
      ['arrival_time_from', from],
      ['arrival_time_to', to],
      ['limit', '1000'],
    ]);
    const rides = (await Http.getJson<RideStopDto[]>(url)).flatMap((r): Ride[] => {
      const t = instant(r.departure_time ?? r.arrival_time);
      const ref = r.gtfs_ride__journey_ref;
      return t != null && ref != null ? [{ journeyRef: ref, departure: t }] : [];
    });
    return sortedBy(distinctBy(rides, (r) => r.journeyRef), (r) => r.departure);
  }
}
