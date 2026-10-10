import { type Itinerary, type Leg, firstTransit, legOptions } from './models';
import { type Instant, localDate, localParts, plusDays, zoned } from './time';

/** The night's service counts as over at this hour (the next morning, for an evening search). */
const MORNING_HOUR = 4;

/** Late enough to look for the last bus: from 20:00, or from noon on a Friday (Shabbat), until the morning. */
export function lateSearch(t: Instant): boolean {
  const p = localParts(t);
  return p.hour >= 20 || p.hour < MORNING_HOUR || (p.dow === 5 && p.hour >= 12);
}

/** When the night of a search at [t] ends: 04:00 the next morning (or this morning, after midnight). */
export function nightEnd(t: Instant): Instant {
  const d = localDate(t);
  return zoned(localParts(t).hour < MORNING_HOUR ? d : plusDays(d, 1), MORNING_HOUR);
}

/** The latest bus of a route's first ride, of the ones it lists; null for a route without one (a walk). */
const lastRide = (i: Itinerary): Leg | null => {
  const first = firstTransit(i);
  return first ? legOptions(first)[legOptions(first).length - 1] : null;
};

/**
 * The route with the night's last departure, and that departure. Only when the routes prove it:
 * one leaves after [end] (so nothing was cut off by paging) and none of [later] (the next page)
 * leaves before it. Otherwise null.
 */
export function lastTonight(shown: Itinerary[], later: Itinerary[], end: Instant): { itin: Itinerary; ride: Leg } | null {
  const rides = [...shown, ...later].map(lastRide).filter((l): l is Leg => l != null);
  if (!rides.some((l) => l.start >= end)) return null;
  if (later.some((i) => (firstTransit(i)?.start ?? Infinity) < end)) return null;
  let best: { itin: Itinerary; ride: Leg } | null = null;
  for (const itin of shown) {
    const ride = lastRide(itin);
    if (ride != null && ride.start < end && (best == null || ride.start > best.ride.start)) best = { itin, ride };
  }
  return best;
}
