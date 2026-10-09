import { GeoMath } from './geo';
import { type GeoPoint, type Leg, type Place, makeLeg, placePoint } from './models';
import { type Instant, dayOfWeek, localDate, plusDays, startOfDay } from './time';
import type { Shuttle } from './userStore';
import { sortedBy } from './util';
import { S } from '../i18n';

/** Colour of shuttle rides, so they stand apart from the operators' lines. */
const COLOR = 0xff7c3aed;
/** Walking this far or less to or from a shuttle stop needs no planning. */
const SAME_PLACE_M = 80;

/** "7:30, 08:15 17:00" → [450, 495, 1020]; null if any part isn't a time. */
function parseTimes(text: string): number[] | null {
  const parts = text
    .split(/[, ;\n]/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) return null;
  const out: number[] = [];
  for (const p of parts) {
    const m = /^(\d{1,2})[:.](\d{2})$/.exec(p);
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    out.push(h * 60 + min);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Nothing typed but spaces and separators. */
const isEmptyTimes = (text: string) => /^[\s,;]*$/.test(text);

const isNear = (a: GeoPoint, b: GeoPoint) => GeoMath.distance(a, b) <= SAME_PLACE_M;

/** What a shuttle still needs before it can be saved, as short phrases in form order; empty when it's complete. */
function missing(
  name: string,
  from: Place | null,
  to: Place | null,
  times: string,
  rideMinutes: number | null,
  days: readonly number[],
): string[] {
  const out: string[] = [];
  const n = S.shuttles.needs;
  if (name.trim() === '') out.push(n.name);
  if (from == null) out.push(n.from);
  if (to == null) out.push(n.to);
  if (from != null && to != null && isNear(placePoint(from), placePoint(to))) out.push(n.differentStops);
  if (parseTimes(times) == null) out.push(isEmptyTimes(times) ? n.times : n.timesLike);
  if (rideMinutes == null) out.push(n.ride);
  if (days.length === 0) out.push(n.day);
  return out;
}

/** "Still needed: a name and how long the ride takes." */
function missingText(m: string[]): string | null {
  return m.length === 0 ? null : S.shuttles.stillNeeded(m);
}

const formatTime = (minutes: number) =>
  `${String(Math.trunc(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const formatTimes = (times: number[]) => times.map(formatTime).join(', ');

/** "Sun–Thu", "Every day", "Fri, Sat": runs of three days or more as a range. */
function formatDays(days: readonly number[]): string {
  const set = new Set(days);
  if (set.size === 7) return S.shuttles.everyDay;
  const names = S.shuttles.days;
  // Week order as in Israel: Sunday first.
  const runs: number[][] = [[]];
  for (const d of [7, 1, 2, 3, 4, 5, 6]) {
    if (set.has(d)) runs[runs.length - 1].push(d);
    else runs.push([]);
  }
  return runs
    .filter((r) => r.length)
    .map((r) => (r.length >= 3 ? `${names[r[0]]}–${names[r[r.length - 1]]}` : r.map((d) => names[d]).join(', ')))
    .join(', ');
}

/** Departures of [s] from [from] (inclusive) up to [until], soonest first. */
function departures(s: Shuttle, from: Instant, until: Instant): Instant[] {
  if (s.times.length === 0 || s.days.length === 0) return [];
  const out: Instant[] = [];
  let day = localDate(from);
  const last = localDate(until);
  while (day <= last) {
    if (s.days.includes(dayOfWeek(day))) {
      const start = startOfDay(day);
      for (const m of s.times) {
        const t = start + m * 60;
        if (!(t < from) && !(t > until)) out.push(t);
      }
    }
    day = plusDays(day, 1);
  }
  return out;
}

/** A ride on [s] leaving at [departure], drawn along [geometry] when known. */
function leg(s: Shuttle, departure: Instant, geometry: GeoPoint[] = []): Leg {
  const end = departure + s.rideMinutes * 60;
  return makeLeg({
    mode: 'BUS',
    from: { stopId: null, name: s.from.name, code: null, lat: s.from.lat, lon: s.from.lon, scheduledArrival: null, scheduledDeparture: departure },
    to: { stopId: null, name: s.to.name, code: null, lat: s.to.lat, lon: s.to.lon, scheduledArrival: end, scheduledDeparture: null },
    start: departure,
    end,
    headsign: s.to.name,
    routeShortName: s.name,
    routeColor: COLOR,
    agencyName: S.shuttles.agency,
    geometry: geometry.length ? geometry : [placePoint(s.from), placePoint(s.to)],
    shuttleId: s.id,
  });
}

/** The next [count] rides of [s] after [l] (one of its rides): the wait if it's missed. */
function ridesAfterOne(s: Shuttle, l: Leg, count = 2): Leg[] {
  return departures(s, l.start + 60, l.start + 18 * 3600)
    .slice(0, count)
    .map((t) => leg(s, t, l.geometry));
}

/** [ridesAfter] for a shuttle ride, looking its shuttle up in [shuttles]; null if it's gone. */
function ridesAfter(shuttles: Shuttle[], l: Leg, count = 2): Leg[] | null {
  const s = shuttles.find((x) => x.id === l.shuttleId);
  return s ? ridesAfterOne(s, l, count) : null;
}

/**
 * Shuttles worth trying between [origin] and [dest], most promising first: they leave no
 * farther away than the destination is, and don't head off the wrong way. A shuttle that
 * barely gets you closer can still be the way to the train, so planning decides the rest.
 */
function relevant(shuttles: Shuttle[], origin: GeoPoint, dest: GeoPoint, max = 3): Shuttle[] {
  const direct = GeoMath.distance(origin, dest);
  if (direct < 300) return [];
  const scored = shuttles
    .filter((s) => s.times.length > 0 && s.days.length > 0)
    .map((s) => ({ s, access: GeoMath.distance(origin, placePoint(s.from)), egress: GeoMath.distance(placePoint(s.to), dest) }))
    .filter(
      ({ s, access, egress }) =>
        // A shuttle to (or from) the train can sit a little "behind" the trip, either end.
        access < direct * 1.25 + 2000 &&
        egress < direct * 1.25 + 2000 &&
        access + egress < direct * 1.6 + 3000 &&
        // Not a loop: it mustn't take you back to where you started, or leave from by where you're going.
        GeoMath.distance(origin, placePoint(s.to)) >= GeoMath.distance(origin, placePoint(s.from)) / 2 &&
        GeoMath.distance(placePoint(s.from), dest) >= egress / 2,
    );
  return sortedBy(scored, (x) => x.access + x.egress)
    .slice(0, max)
    .map((x) => x.s);
}

export const ShuttleSchedule = {
  COLOR,
  parseTimes,
  isEmptyTimes,
  missing,
  missingText,
  formatTime,
  formatTimes,
  formatDays,
  departures,
  leg,
  ridesAfterOne,
  ridesAfter,
  isNear,
  relevant,
};
