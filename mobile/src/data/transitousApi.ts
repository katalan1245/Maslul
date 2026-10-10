import { GeoMath, Polyline } from './geo';
import { S } from '../i18n';
import { Http, buildUrl, type Query } from './http';
import {
  type Departure,
  type GeoPoint,
  type Itinerary,
  type Leg,
  type Place,
  type PlaceKind,
  type PlanResult,
  type StopCall,
  type TransitMode,
  TRANSIT_MODES,
  stopMode,
  isTransit,
  makeLeg,
  modeFromMotis,
} from './models';
import { type Instant, isoUtc, parseInstant } from './time';
import { sortedBy } from './util';

/** Longest walk to or from a stop that route planning allows by default. */
export const DEFAULT_MAX_WALK_MINUTES = 20;

export interface PlanRequest {
  from: GeoPoint;
  to: GeoPoint;
  time?: Instant | null;
  arriveBy?: boolean;
  modes?: readonly TransitMode[];
  walkSpeedMps?: number;
  maxWalkMinutes?: number;
  wheelchair?: boolean;
  maxTransfers?: number | null;
  pageCursor?: string | null;
  language?: string | null;
  /** Buffer for every change, so a slightly late bus doesn't break the connection. */
  minTransferMinutes?: number;
  additionalTransferMinutes?: number;
  numItineraries?: number;
  /** How far past [time] to look, in seconds (MOTIS default: 2 h). */
  searchWindowSec?: number | null;
  /** Route from/to these stops exactly instead of the coordinates. */
  fromStopId?: string | null;
  toStopId?: string | null;
  /** How to reach the first stop, e.g. "CAR_DROPOFF" for a lift (MOTIS default: walking). */
  preTransitModes?: string | null;
  /** Longest time to reach the first stop, when not [maxWalkMinutes] (e.g. how far a driver will go). */
  maxPreTransitMinutes?: number | null;
  /** Door-to-door modes without transit, e.g. "WALK,CAR" (MOTIS default: walking). */
  directModes?: string | null;
  maxDirectMinutes?: number | null;
  /** Only the direct ([directModes]) route: no transit is searched. */
  directOnly?: boolean;
}

export const ALL_TRANSIT_MODES: TransitMode[] = TRANSIT_MODES.filter(isTransit);

/** [r] with Kotlin's defaults filled in. */
export function planDefaults(r: PlanRequest): Required<PlanRequest> {
  return {
    time: null,
    arriveBy: false,
    modes: ALL_TRANSIT_MODES,
    walkSpeedMps: 1.3,
    maxWalkMinutes: DEFAULT_MAX_WALK_MINUTES,
    wheelchair: false,
    maxTransfers: null,
    pageCursor: null,
    language: null,
    minTransferMinutes: 2,
    additionalTransferMinutes: 1,
    numItineraries: 8,
    searchWindowSec: null,
    fromStopId: null,
    toStopId: null,
    preTransitModes: null,
    maxPreTransitMinutes: null,
    directModes: null,
    maxDirectMinutes: null,
    directOnly: false,
    ...stripUndefined(r),
  };
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

// Israel's GTFS has no platform_code; the platform and floor sit in stop_desc instead:
// "רחוב: יהושע חנקין עיר: באר שבע רציף: 13  קומה: " (empty when the stop has none).
const PLATFORM = /רציף:\s*([^\s:]+)(?=\s|$)/;
const FLOOR = /קומה:\s*([^\s:]+)(?=\s|$)/;

export function platformOf(description: string | null | undefined): string | null {
  return description != null ? (PLATFORM.exec(description)?.[1] ?? null) : null;
}

/** Floor of a multi-level station; ground level ("0") isn't worth mentioning. */
export function floorOf(description: string | null | undefined): string | null {
  const f = description != null ? (FLOOR.exec(description)?.[1] ?? null) : null;
  return f !== '0' ? f : null;
}

/**
 * MOTIS silently ignores a `time` with fractional seconds and answers from the start of
 * the service day instead, so always send whole seconds.
 */
export const queryTime = (t: Instant) => isoUtc(Math.floor(t));

export function motisModes(modes: readonly TransitMode[]): string | null {
  const set = new Set(modes);
  if (ALL_TRANSIT_MODES.filter((m) => m !== 'OTHER').every((m) => set.has(m))) return null;
  const out = modes.flatMap((m): string[] => {
    switch (m) {
      case 'BUS':
        return ['BUS', 'COACH'];
      case 'TRAIN':
        return ['RAIL'];
      case 'LIGHT_RAIL':
        return ['TRAM'];
      case 'METRO':
        return ['SUBWAY', 'FUNICULAR'];
      case 'CABLE_CAR':
        return ['AERIAL_LIFT'];
      case 'FERRY':
        return ['FERRY'];
      default:
        return [];
    }
  });
  return out.length ? out.join(',') : null;
}

/** MOT descriptions look like "רחוב: X עיר: Y רציף: ...". */
export function cityFromDescription(desc: string | null | undefined): string | null {
  if (desc == null) return null;
  const c = /עיר:\s*(.*?)\s*(רציף:|$)/.exec(desc)?.[1]?.trim();
  return c ? c : null;
}

/** "#00913F" → ARGB, or null. */
export function parseColor(hex: string | null | undefined): number | null {
  const h = hex?.trim().replace(/^#/, '');
  if (h == null || h.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return 0xff000000 + parseInt(h, 16);
}

export const instant = parseInstant;

/**
 * Where a ride is heading, as riders read it. Israel Railways puts the train number in the
 * headsign ("726"), so a train goes by where its trip ends ([tripTo]) instead, or by nothing.
 */
export function headsignOf(headsign: string, tripTo: string | null | undefined): string | null {
  if (!/^\d+$/.test(headsign.trim())) return cleanHeadsign(headsign);
  return tripTo?.trim() ? tripTo.trim() : null;
}

/** MOT headsigns are "City_Destination"; show "Destination, City". */
export function cleanHeadsign(h: string): string {
  const i = h.indexOf('_');
  if (i <= 0) return h;
  const city = h.substring(0, i);
  const dest = h.substring(i + 1);
  return dest.includes(city) ? dest : `${dest}, ${city}`;
}

// ---- DTOs -------------------------------------------------------------------------------

export interface PlaceDto {
  name?: string;
  stopId?: string | null;
  lat?: number;
  lon?: number;
  arrival?: string | null;
  departure?: string | null;
  scheduledArrival?: string | null;
  scheduledDeparture?: string | null;
  stopCode?: string | null;
  track?: string | null;
  scheduledTrack?: string | null;
  description?: string | null;
  modes?: string[] | null;
}

export function toStopCall(p: PlaceDto): StopCall {
  const name = p.name ?? '';
  return {
    stopId: p.stopId ?? null,
    name: name !== 'START' && name !== 'END' ? name : '',
    code: p.stopCode ?? null,
    lat: p.lat ?? 0,
    lon: p.lon ?? 0,
    scheduledArrival: instant(p.scheduledArrival ?? p.arrival),
    scheduledDeparture: instant(p.scheduledDeparture ?? p.departure),
    track: p.track ?? p.scheduledTrack ?? platformOf(p.description),
    floor: floorOf(p.description),
  };
}

interface StepDto {
  relativeDirection?: string | null;
  distance?: number;
  streetName?: string | null;
}

export interface LegDto {
  mode?: string;
  from?: PlaceDto;
  to?: PlaceDto;
  startTime?: string;
  endTime?: string;
  scheduledStartTime?: string | null;
  scheduledEndTime?: string | null;
  distance?: number | null;
  headsign?: string | null;
  /** Where the trip ends, which for trains is what the headsign (a train number) doesn't say. */
  tripTo?: PlaceDto | null;
  routeId?: string | null;
  routeColor?: string | null;
  routeTextColor?: string | null;
  agencyName?: string | null;
  agencyId?: string | null;
  tripId?: string | null;
  routeShortName?: string | null;
  routeLongName?: string | null;
  displayName?: string | null;
  intermediateStops?: PlaceDto[];
  legGeometry?: { points?: string; precision?: number };
  steps?: StepDto[];
  alerts?: { headerText?: string; descriptionText?: string }[];
}

function describeStep(s: StepDto): string {
  const street = s.streetName?.trim() ? s.streetName : null;
  const known = S.steps[s.relativeDirection as keyof typeof S.steps];
  const dir = typeof known === 'string' ? known : S.steps.CONTINUE;
  return street != null ? S.steps.on(dir, street) : dir;
}

export function legToDomain(d: LegDto): Leg {
  const mode = modeFromMotis(d.mode ?? 'WALK');
  let geometry: GeoPoint[] = [];
  try {
    geometry = Polyline.decode(d.legGeometry?.points ?? '', d.legGeometry?.precision ?? 6);
  } catch {
    geometry = [];
  }
  // Israel has no realtime in Transitous; scheduled times are the baseline.
  const start = instant(d.scheduledStartTime ?? d.startTime ?? '') ?? 0;
  const end = instant(d.scheduledEndTime ?? d.endTime ?? '') ?? 0;
  const cum = !isTransit(mode) && geometry.length > 1 ? GeoMath.cumulative(geometry) : null;
  return makeLeg({
    mode,
    from: toStopCall(d.from ?? {}),
    to: toStopCall(d.to ?? {}),
    start,
    // A walk after a car drop-off can come back a few seconds "shorter than nothing".
    end: !isTransit(mode) && end < start ? start : end,
    distanceM: d.distance ?? (cum ? cum[cum.length - 1] : null),
    headsign: d.headsign != null ? headsignOf(d.headsign, d.tripTo?.name) : null,
    routeShortName: d.routeShortName ?? d.displayName ?? null,
    routeLongName: d.routeLongName ?? null,
    routeColor: parseColor(d.routeColor),
    routeTextColor: parseColor(d.routeTextColor),
    agencyName: d.agencyName ?? null,
    tripId: d.tripId ?? null,
    routeId: d.routeId ?? null,
    intermediateStops: (d.intermediateStops ?? []).map(toStopCall),
    geometry,
    steps: (d.steps ?? []).filter((s) => (s.distance ?? 0) > 0).map((s) => ({ instruction: describeStep(s), distanceM: s.distance ?? 0 })),
    alerts: (d.alerts ?? [])
      .map((a) => [a.headerText ?? '', a.descriptionText ?? ''].filter((t) => t.trim() !== '').join(': '))
      .filter((t) => t.trim() !== ''),
    agencyId: d.agencyId ?? null,
  });
}

export interface ItineraryDto {
  id?: string;
  startTime?: string;
  endTime?: string;
  transfers?: number;
  legs?: LegDto[];
}

export function itineraryToDomain(d: ItineraryDto): Itinerary {
  const raw = d.legs ?? [];
  const legs = raw.map(legToDomain);
  // After a car drop-off MOTIS pads the drive by a couple of minutes and takes them back with
  // a walk of negative length: the car really gets there when that walk "ends".
  for (let i = 1; i < legs.length; i++) {
    const end = instant(raw[i].scheduledEndTime ?? raw[i].endTime ?? '');
    if (end == null) continue;
    if (legs[i - 1].mode === 'CAR' && end < legs[i].start) {
      legs[i - 1] = { ...legs[i - 1], end };
      legs[i] = { ...legs[i], start: end, end };
    }
  }
  const id = d.id?.trim() ? d.id : legs.map((l) => `${l.tripId}${isoUtc(l.start)}`).join(', ');
  return {
    id,
    start: legs[0]?.start ?? instant(d.startTime ?? '') ?? 0,
    end: legs[legs.length - 1]?.end ?? instant(d.endTime ?? '') ?? 0,
    transfers: d.transfers ?? 0,
    legs,
  };
}

interface PlanDto {
  itineraries?: ItineraryDto[];
  direct?: ItineraryDto[];
  nextPageCursor?: string | null;
  previousPageCursor?: string | null;
}

interface MatchDto {
  type?: string;
  name?: string;
  id?: string;
  lat?: number;
  lon?: number;
  street?: string | null;
  houseNumber?: string | null;
  country?: string | null;
  areas?: { name?: string; default?: boolean }[];
  modes?: string[] | null;
}

export function matchToPlace(m: MatchDto): Place {
  const areas = m.areas ?? [];
  const city = areas.find((a) => a.default)?.name ?? areas[areas.length - 1]?.name;
  const type = m.type ?? 'PLACE';
  const kind: PlaceKind = type === 'STOP' ? 'STOP' : type === 'ADDRESS' ? 'ADDRESS' : 'POI';
  const name = m.name ?? '';
  const addr = [m.street, m.houseNumber].filter((s) => s != null).join(' ');
  const title = type === 'ADDRESS' ? (addr.trim() ? addr : name) : name;
  const p: Place = { name: title, lat: m.lat ?? 0, lon: m.lon ?? 0, kind };
  if (city != null) p.subtitle = city;
  if (type === 'STOP') p.stopId = m.id ?? '';
  const mode = type === 'STOP' ? stopMode(m.modes) : undefined;
  if (mode != null) p.mode = mode;
  return p;
}

interface StopTimeDto {
  place?: PlaceDto;
  mode?: string;
  headsign?: string;
  tripTo?: PlaceDto | null;
  tripId?: string;
  routeId?: string | null;
  routeShortName?: string | null;
  displayName?: string | null;
  agencyName?: string | null;
  agencyId?: string | null;
  routeColor?: string | null;
  cancelled?: boolean;
  tripCancelled?: boolean;
}

export function stopTimeToDomain(d: StopTimeDto): Departure | null {
  if (d.cancelled || d.tripCancelled) return null;
  const call = toStopCall(d.place ?? {});
  const time = call.scheduledDeparture ?? call.scheduledArrival;
  if (time == null) return null;
  const mode = modeFromMotis(d.mode ?? 'BUS');
  const short = d.routeShortName ?? d.displayName;
  const label = short != null && short.trim() !== '' && short !== 'NaN' ? short : mode === 'TRAIN' ? S.stop.trainLine : '—';
  return {
    tripId: d.tripId ?? '',
    routeId: d.routeId ?? null,
    mode,
    lineLabel: label,
    headsign: headsignOf(d.headsign ?? '', d.tripTo?.name) ?? cleanHeadsign(d.headsign ?? ''),
    agency: d.agencyName ?? null,
    routeColor: parseColor(d.routeColor),
    scheduled: time,
    stop: call,
    agencyId: d.agencyId ?? null,
  };
}

/**
 * Client for Transitous (https://transitous.org), a free community-run MOTIS instance that
 * routes on the Ministry of Transport's official GTFS feed.
 */
export class TransitousApi {
  constructor(private readonly base = 'https://api.transitous.org') {}

  planUrl(request: PlanRequest): string {
    const r = planDefaults(request);
    const q: Query = [
      ['fromPlace', r.fromStopId ?? `${r.from.lat},${r.from.lon}`],
      ['toPlace', r.toStopId ?? `${r.to.lat},${r.to.lon}`],
      ['numItineraries', r.numItineraries],
      ['searchWindow', r.searchWindowSec],
      ['minTransferTime', r.minTransferMinutes],
      ['additionalTransferTime', r.additionalTransferMinutes],
      ['arriveBy', r.arriveBy],
      ['pedestrianSpeed', r.walkSpeedMps],
      ['maxPreTransitTime', (r.maxPreTransitMinutes ?? r.maxWalkMinutes) * 60],
      ['maxPostTransitTime', r.maxWalkMinutes * 60],
      ['time', r.time != null ? queryTime(r.time) : null],
      // Transit modes of WALK alone leave nothing to ride, so only the direct route is searched.
      ['transitModes', r.directOnly ? 'WALK' : motisModes(r.modes)],
      ['preTransitModes', r.preTransitModes],
      ['directModes', r.directModes],
      ['maxDirectTime', r.maxDirectMinutes != null ? r.maxDirectMinutes * 60 : null],
      ['pedestrianProfile', r.wheelchair ? 'WHEELCHAIR' : null],
      ['maxTransfers', r.maxTransfers],
      ['pageCursor', r.pageCursor],
      ['language', r.language],
    ];
    return buildUrl(this.base, 'api/v6/plan', q);
  }

  async plan(req: PlanRequest): Promise<PlanResult> {
    const dto = await Http.getJson<PlanDto>(this.planUrl(req));
    const direct = dto.direct ?? [];
    const walk = direct.find((i) => (i.legs ?? []).every((l) => (l.mode ?? 'WALK') === 'WALK'));
    const car = direct.find((i) => (i.legs ?? []).some((l) => l.mode === 'CAR'));
    return {
      itineraries: (dto.itineraries ?? [])
        .map(itineraryToDomain)
        // A lift is one drive: a car again after walking would need the car to be waiting there.
        .filter((i) => i.legs.some((l) => isTransit(l.mode)) && i.legs.filter((l) => l.mode === 'CAR').length <= 1),
      walkOnly: walk ? itineraryToDomain(walk) : null,
      nextCursor: dto.nextPageCursor ?? null,
      previousCursor: dto.previousPageCursor ?? null,
      carOnly: car ? itineraryToDomain(car) : null,
    };
  }

  /** Full trip (all stops + shape) as a single transit leg. */
  async trip(tripId: string, language: string | null = null): Promise<Leg | null> {
    const dto = await Http.getJson<ItineraryDto>(buildUrl(this.base, 'api/v6/trip', [['tripId', tripId], ['language', language]]));
    const leg = (dto.legs ?? []).find((l) => (l.mode ?? 'WALK') !== 'WALK');
    return leg ? legToDomain(leg) : null;
  }

  /** Place search; [type] ("STOP", "ADDRESS" or "PLACE") limits the kind of results. */
  async geocode(text: string, near: GeoPoint | null, language: string | null = null, type: string | null = null): Promise<Place[]> {
    const url = buildUrl(this.base, 'api/v1/geocode', [
      ['text', text],
      ['type', type],
      ['place', near ? `${near.lat},${near.lon}` : null],
      ['placeBias', near ? '1' : null],
      ['language', language],
    ]);
    return (await Http.getJson<MatchDto[]>(url))
      .filter((m) => m.country == null || m.country === 'IL' || m.country === 'PS')
      .map(matchToPlace);
  }

  async reverseGeocode(p: GeoPoint): Promise<Place | null> {
    const url = buildUrl(this.base, 'api/v1/reverse-geocode', [['place', `${p.lat},${p.lon}`], ['numResults', '3']]);
    const first = (await Http.getJson<MatchDto[]>(url))[0];
    return first ? matchToPlace(first) : null;
  }

  async nearbyStops(center: GeoPoint, radiusDeg = 0.006): Promise<Place[]> {
    const url = buildUrl(this.base, 'api/v6/map/stops', [
      ['min', `${center.lat - radiusDeg},${center.lon - radiusDeg}`],
      ['max', `${center.lat + radiusDeg},${center.lon + radiusDeg}`],
    ]);
    const stops = (await Http.getJson<PlaceDto[]>(url))
      .filter((s) => s.stopId != null)
      .map((s): Place => {
        const p: Place = { name: s.name ?? '', lat: s.lat ?? 0, lon: s.lon ?? 0, kind: 'STOP', stopId: s.stopId! };
        const mode = stopMode(s.modes);
        if (mode != null) p.mode = mode;
        const sub = [s.stopCode != null ? `#${s.stopCode}` : null, cityFromDescription(s.description)]
          .filter((x) => x != null)
          .join(' · ');
        if (sub.trim()) p.subtitle = sub;
        return p;
      });
    return sortedBy(stops, (s) => GeoMath.distance(center, s));
  }

  /** Departures from [stopId]: at least [count], and all of those within [windowSec] of [time] when given. */
  async stopTimes(
    stopId: string,
    opts: { time?: Instant | null; count?: number; language?: string | null; windowSec?: number | null } = {},
  ): Promise<Departure[]> {
    const url = buildUrl(this.base, 'api/v6/stoptimes', [
      ['stopId', stopId],
      // Otherwise MOTIS adds every stop with the same name, e.g. the platform across the road.
      ['exactRadius', 'true'],
      ['n', opts.count ?? 30],
      ['time', opts.time != null ? queryTime(opts.time) : null],
      ['window', opts.windowSec],
      ['language', opts.language],
    ]);
    const dto = await Http.getJson<{ stopTimes?: StopTimeDto[] }>(url);
    return (dto.stopTimes ?? []).map(stopTimeToDomain).filter((d): d is Departure => d != null);
  }
}
