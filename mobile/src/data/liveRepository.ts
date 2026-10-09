import { Http, USER_AGENT } from './http';
import type { Vehicle } from './models';
import { type Instant, nowSec, parseInstant } from './time';
import { groupBy, maxBy } from './util';

/** Vehicles that stopped reporting linger in the feed; drop them. */
export const MAX_AGE_SEC = 5 * 60;

export interface Snapshot {
  minute: Instant;
  fetchedAt: Instant;
  byLine: Map<string, Vehicle[]>;
}

export const vehicleCount = (s: Snapshot) => [...s.byLine.values()].reduce((n, vs) => n + vs.length, 0);

/**
 * Fetches a snapshot file and returns its decompressed JSON text, or null when the server
 * hasn't got it (any non-success status). The app does this natively, off the JS thread.
 */
export type BrotliFetcher = (url: string, userAgent: string) => Promise<string | null>;

/** The feed sometimes repeats a vehicle; keep only its newest report per trip. */
export function latestPerVehicle(vs: Vehicle[]): Vehicle[] {
  if (vs.length < 2) return vs;
  const out = new Map<string, Vehicle>();
  const anonymous: Vehicle[] = [];
  for (const v of vs) {
    if (v.vehicleRef == null) {
      anonymous.push(v);
      continue;
    }
    const key = `${v.vehicleRef}|${v.journeyRef}`;
    const prev = out.get(key);
    if (prev === undefined || v.recordedAt > prev.recordedAt) out.set(key, v);
  }
  return [...out.values(), ...anonymous];
}

type Json = unknown;

/** A JSON string or number as text, like Gson's `nextString()`; anything else is null. */
function str(v: Json): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return null;
}

const num = (s: string | null) => (s != null && s.trim() !== '' && !Number.isNaN(Number(s)) ? Number(s) : null);
const int = (s: string | null) => (s != null && /^[+-]?\d+$/.test(s) ? Number(s) : null);
const obj = (v: Json): Record<string, Json> | null =>
  v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : null;

function visit(v: Json, t: Instant): Vehicle | null {
  const o = obj(v);
  if (!o) return null;
  const j = obj(o.MonitoredVehicleJourney) ?? {};
  const loc = obj(j.VehicleLocation) ?? {};
  const call = obj(j.MonitoredCall) ?? {};
  const framed = obj(j.FramedVehicleJourneyRef) ?? {};
  const line = str(j.LineRef);
  const lat = num(str(loc.Latitude));
  const lon = num(str(loc.Longitude));
  if (line == null || lat == null || lon == null) return null;
  if (lat === 0 || lon === 0) return null;
  const recorded = parseInstant(str(o.RecordedAtTime));
  if (recorded == null) return null;
  if (t - recorded > MAX_AGE_SEC) return null;
  const origin = parseInstant(str(j.OriginAimedDepartureTime));
  if (origin == null) return null;
  const order = int(str(call.Order));
  const distance = num(str(call.DistanceFromStop));
  const velocity = num(str(j.Velocity));
  return {
    lineRef: line,
    journeyRef: str(framed.DatedVehicleJourneyRef),
    originDeparture: origin,
    lat,
    lon,
    bearing: num(str(j.Bearing)),
    velocityKmh: velocity != null ? Math.trunc(velocity) : null,
    recordedAt: recorded,
    // "0" past the first stop is the feed's "no fix" value.
    distanceFromStart: distance != null && (distance > 0 || order === 1) ? distance : null,
    nextStopCode: str(call.StopPointRef),
    vehicleRef: str(j.VehicleRef),
  };
}

/** Collects every MonitoredStopVisit in the parsed snapshot, wherever it is nested. */
function walk(v: Json, out: Vehicle[], t: Instant): void {
  if (Array.isArray(v)) {
    for (const x of v) walk(x, out, t);
    return;
  }
  const o = obj(v);
  if (!o) return;
  for (const [k, x] of Object.entries(o)) {
    if (k === 'MonitoredStopVisit') {
      const visits = Array.isArray(x) ? x : [x];
      for (const s of visits) {
        const veh = visit(s, t);
        if (veh) out.push(veh);
      }
    } else walk(x, out, t);
  }
}

export function parseSnapshotJson(json: string, snapshotTime: Instant): Vehicle[] {
  const out: Vehicle[] = [];
  walk(JSON.parse(json), out, snapshotTime);
  return out;
}

/** "2026/10/09/07/05" for the UTC minute [t]. */
export function snapshotPath(t: Instant): string {
  const d = new Date(t * 1000).toISOString(); // 2026-10-09T07:05:00.000Z
  return `${d.slice(0, 4)}/${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(11, 13)}/${d.slice(14, 16)}`;
}

/**
 * Live vehicle positions from the Ministry of Transport SIRI feed.
 *
 * Hasadna's SIRI requester publishes the complete national snapshot once a minute, about
 * 30 s after the minute, as brotli-compressed JSON (~215 KB). This is the freshest keyless
 * source of MOT realtime data (Stride's ETL lags 10–20 minutes).
 */
export class LiveRepository {
  private cached: Snapshot | null = null;
  private lastAttempt = 0;
  private inflight: Promise<Snapshot | null> | null = null;

  constructor(
    private readonly fetchBrotli: BrotliFetcher,
    private readonly base = 'https://open-bus-siri-requester.hasadna.org.il',
    private readonly clock: () => Instant = nowSec,
  ) {}

  /** Latest snapshot, refreshed at most every ~20 s. Returns the stale one on failure. */
  snapshot(): Promise<Snapshot | null> {
    // Concurrent callers share one refresh, as the Kotlin mutex made them wait for it.
    this.inflight ??= this.refresh().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async refresh(): Promise<Snapshot | null> {
    const now = this.clock();
    const c = this.cached;
    // A newer file can only exist once the cached minute is more than ~80 s old.
    const newerDue = c == null || now > c.minute + 80;
    if (c != null && (!newerDue || now < this.lastAttempt + 20)) return c;
    this.lastAttempt = now;
    try {
      const fresh = await this.fetchLatest(now, c?.minute ?? null);
      if (fresh != null) this.cached = fresh;
    } catch {
      // Keep the stale snapshot.
    }
    return this.cached;
  }

  async vehiclesForLine(lineRef: string): Promise<Vehicle[]> {
    return (await this.snapshot())?.byLine.get(lineRef) ?? [];
  }

  private async fetchLatest(now: Instant, have: Instant | null): Promise<Snapshot | null> {
    const current = now - (now % 60);
    for (let back = 0; back <= 3; back++) {
      const minute = current - back * 60;
      if (have != null && !(minute > have)) return null;
      const json = await this.fetchBrotli(`${this.base}/${snapshotPath(minute)}.br`, USER_AGENT);
      if (json != null) {
        const vehicles = parseSnapshotJson(json, minute);
        const byLine = new Map<string, Vehicle[]>();
        for (const [line, vs] of groupBy(vehicles, (v) => v.lineRef)) byLine.set(line, latestPerVehicle(vs));
        return { minute, fetchedAt: this.clock(), byLine };
      }
    }
    return null;
  }
}

/** Finds the vehicle serving a specific trip; the freshest report wins if several claim it. */
export function forTrip(vs: readonly Vehicle[], tripNumber: string | null, originDeparture: Instant | null): Vehicle | null {
  const byRef = maxBy(
    vs.filter((v) => tripNumber != null && v.journeyRef === tripNumber),
    (v) => v.recordedAt,
  );
  if (byRef) return byRef;
  if (originDeparture == null) return null;
  return maxBy(
    vs.filter((v) => Math.abs(v.originDeparture - originDeparture) < 60),
    (v) => v.recordedAt,
  );
}

/** Plain fetch + a JS brotli decoder, for tests and scripts in Node. */
export function jsBrotliFetcher(decompress: (b: Uint8Array) => Uint8Array): BrotliFetcher {
  return async (url) => {
    const r = await Http.get(url);
    if (!r.ok) return null;
    const bytes = decompress(new Uint8Array(await r.arrayBuffer()));
    return new TextDecoder('utf-8').decode(bytes);
  };
}
