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

/** The last bus is worth a warning when missing it means a long wait: not when the first morning one comes soon after. */
const GAP_SEC = 60 * 60;

/**
 * The route with the night's last departure, and that departure. Only when the routes prove it:
 * one leaves after [end] (so nothing was cut off by paging), none of [later] (the next page)
 * leaves before it, nothing leaves within GAP_SEC after it (night lines, or an early first bus), and it's on
 * the day of the search [at] ("Last today" on tomorrow's card reads wrong). Otherwise null.
 */
export function lastTonight(shown: Itinerary[], later: Itinerary[], end: Instant, at: Instant): { itin: Itinerary; ride: Leg } | null {
  const rides = [...shown, ...later].map(lastRide).filter((l): l is Leg => l != null);
  if (!rides.some((l) => l.start >= end)) return null;
  if (later.some((i) => (firstTransit(i)?.start ?? Infinity) < end)) return null;
  let best: { itin: Itinerary; ride: Leg } | null = null;
  for (const itin of shown) {
    const ride = lastRide(itin);
    if (ride != null && ride.start < end && (best == null || ride.start > best.ride.start)) best = { itin, ride };
  }
  if (best == null || localDate(best.ride.start) !== localDate(at)) return null;
  const last = best.ride.start;
  const starts = [...shown, ...later].flatMap((i) => {
    const f = firstTransit(i);
    return f ? legOptions(f).map((l) => l.start) : [];
  });
  return starts.some((t) => t > last && t < last + GAP_SEC) ? null : best;
}
