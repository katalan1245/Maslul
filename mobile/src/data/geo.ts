import type { GeoPoint } from './models';
import { clamp } from './util';
import { type Instant, type LocalDate, plusDays, startOfDay } from './time';

export const Polyline = {
  /** Decodes a Google encoded polyline with the given precision (MOTIS uses 6 or 7). */
  decode(encoded: string, precision = 6): GeoPoint[] {
    const factor = Math.pow(10, precision);
    const out: GeoPoint[] = [];
    let index = 0;
    let lat = 0;
    let lon = 0;
    // Arithmetic rather than bitwise ops: JS bitwise is 32-bit and these values can exceed it.
    const next = (): number => {
      let result = 0;
      let mul = 1;
      let b: number;
      do {
        if (index >= encoded.length) throw new Error('Truncated polyline');
        b = encoded.charCodeAt(index++) - 63;
        result += (b & 0x1f) * mul;
        mul *= 32;
      } while (b >= 0x20 && index < encoded.length);
      return result % 2 === 1 ? -(result + 1) / 2 : result / 2;
    };
    while (index < encoded.length) {
      lat += next();
      lon += next();
      out.push({ lat: lat / factor, lon: lon / factor });
    }
    return out;
  },
};

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export interface Projection {
  alongM: number;
  offsetM: number;
}

export const GeoMath = {
  distance(a: GeoPoint, b: GeoPoint): number {
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  },

  /** Cumulative distance along the polyline at each vertex. */
  cumulative(line: readonly GeoPoint[]): number[] {
    const out = new Array<number>(line.length).fill(0);
    for (let i = 1; i < line.length; i++) out[i] = out[i - 1] + GeoMath.distance(line[i - 1], line[i]);
    return out;
  },

  /**
   * Projects [p] onto the polyline. Uses a local equirectangular approximation, which is
   * accurate to well under a metre at city scale. When [hintAlongM] is given and the line passes
   * within [snapM] more than once (loops, out-and-back streets), it takes the pass closest to the
   * hint, and the nearest point of that pass: the point of a pass nearest the hint would lag behind
   * the real position by up to [snapM].
   */
  project(
    line: readonly GeoPoint[],
    cum: readonly number[],
    p: GeoPoint,
    hintAlongM: number | null = null,
    fromIndex = 0,
    snapM = 80,
  ): Projection | null {
    if (line.length < 2) return null;
    const kx = 111320 * Math.cos(rad(p.lat));
    const ky = 110540;
    let nearest: Projection | null = null;
    let nearHint: Projection | null = null;
    // The nearest point of the current pass: consecutive segments within snapM.
    let pass: Projection | null = null;
    const endPass = () => {
      if (pass && (nearHint === null || Math.abs(pass.alongM - hintAlongM!) < Math.abs(nearHint.alongM - hintAlongM!))) nearHint = pass;
      pass = null;
    };
    for (let i = Math.max(fromIndex, 0); i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      const ax = (a.lon - p.lon) * kx;
      const ay = (a.lat - p.lat) * ky;
      const bx = (b.lon - p.lon) * kx;
      const by = (b.lat - p.lat) * ky;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : clamp(-(ax * dx + ay * dy) / len2, 0, 1);
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const off = Math.sqrt(cx * cx + cy * cy);
      const along = cum[i] + t * (cum[i + 1] - cum[i]);
      if (nearest === null || off < nearest.offsetM) nearest = { alongM: along, offsetM: off };
      if (hintAlongM == null) continue;
      if (off > snapM) endPass();
      else if (pass === null || off < pass.offsetM) pass = { alongM: along, offsetM: off };
    }
    if (hintAlongM != null) endPass();
    return nearHint ?? nearest;
  },

  bearing(a: GeoPoint, b: GeoPoint): number {
    const p1 = rad(a.lat);
    const p2 = rad(b.lat);
    const dl = rad(b.lon - a.lon);
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return (((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
  },

  /** Smallest signed difference a − b between two compass angles, in −180..180. */
  angleDiff(a: number, b: number): number {
    return ((((a - b) % 360) + 540) % 360) - 180;
  },
};

const PREFIX = 'il-Israel-MOT_';
const tripRegex = /^(\d{8})_(\d{2,3}):(\d{2})_il-Israel-MOT_(.+)$/;

export interface ParsedTripId {
  serviceDate: LocalDate;
  originDeparture: Instant;
  gtfsTripId: string;
}

export const tripNumberOf = (p: ParsedTripId) => p.gtfsTripId.split('_')[0];

/** "20260927" → "2026-09-27" if it's a real date. */
function basicDate(s: string): LocalDate | null {
  const d = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return plusDays(d, 0) === d ? d : null;
}

/**
 * Transitous trip ids for the Israeli feed look like
 * `20260927_21:20_il-Israel-MOT_585026147_270926` — service date, the trip's first departure
 * (local time, may exceed 24:00), and the MOT trip_id.
 */
export const TripIds = {
  parse(tripId: string | null | undefined): ParsedTripId | null {
    const m = tripRegex.exec(tripId ?? '');
    if (!m) return null;
    const date = basicDate(m[1]);
    if (!date) return null;
    const minutes = Number(m[2]) * 60 + Number(m[3]);
    return { serviceDate: date, originDeparture: startOfDay(date) + minutes * 60, gtfsTripId: m[4] };
  },

  build(serviceDate: LocalDate, originDeparture: Instant, journeyRef: string): string {
    const minutes = Math.trunc((originDeparture - startOfDay(serviceDate)) / 60);
    const hh = String(Math.trunc(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return `${serviceDate.replace(/-/g, '')}_${hh}:${mm}_${PREFIX}${journeyRef}`;
  },

  /**
   * Trip id for a Stride ride. Journey refs end with the service date ("_260926" = 26/09/26),
   * which differs from the calendar date for trips after midnight.
   */
  fromJourney(journeyRef: string, departure: Instant, fallbackDate: LocalDate): string {
    const i = journeyRef.lastIndexOf('_');
    const suffix = i < 0 ? '' : journeyRef.substring(i + 1);
    const date = /^\d{6}$/.test(suffix) ? basicDate(`20${suffix.slice(4, 6)}${suffix.slice(2, 4)}${suffix.slice(0, 2)}`) : null;
    return TripIds.build(date ?? fallbackDate, departure, journeyRef);
  },

  lineRef(routeId: string | null | undefined): string | null {
    return routeId != null && routeId.startsWith(PREFIX) ? routeId.substring(PREFIX.length) : null;
  },

  stopId: (motStopId: string) => PREFIX + motStopId,
};
