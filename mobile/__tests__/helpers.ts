import { type LiveCall, type LiveStatus, liveCall } from '../src/data/eta';
import { type Itinerary, type Leg, type StopCall, type TransitMode, isTransit, makeLeg } from '../src/data/models';
import { parseInstant } from '../src/data/time';

/** `Instant.parse` for test fixtures. */
export const instant = (s: string) => {
  const t = parseInstant(s);
  if (t == null) throw new Error(`bad instant ${s}`);
  return t;
};

export const call = (stopId: string | null, name: string, lat: number, lon: number, arr: number | null = null, dep: number | null = null): StopCall => ({
  stopId,
  name,
  code: null,
  lat,
  lon,
  scheduledArrival: arr,
  scheduledDeparture: dep,
});

export const itinOf = (id: string, ...legs: Leg[]): Itinerary => ({
  id,
  start: legs[0].start,
  end: legs[legs.length - 1].end,
  transfers: legs.filter((l) => isTransit(l.mode)).length - 1,
  legs,
});

export const live = (status: LiveStatus, scheduled: number, expected: number | null, rest: Partial<LiveCall> = {}) =>
  liveCall(status, scheduled, expected, rest);

export { makeLeg };
export type { TransitMode };
