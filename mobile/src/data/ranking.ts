import { GeoMath } from './geo';
import { type Itinerary, type Leg, callPoint, isTransit, legDurationSec, walkSec } from './models';
import { RAIL_PREFERENCES, type RailPreference, type RouteSort } from './userStore';
import { sortedBy, sumOf } from './util';

/** Connections with less spare time than this are flagged as tight. */
const TIGHT_SEC = 240;
const TRANSFER_PENALTY = 300;
const WALK_WEIGHT = 0.3;

/** One change between two transit legs. */
export interface Transfer {
  /** Time left over after walking: next boarding − (alighting + walk). */
  slackSec: number;
  walkM: number;
  next: Leg;
}

export const isTight = (t: Transfer) => t.slackSec < TIGHT_SEC;
export const isWalking = (t: Transfer) => t.walkM >= 50;

function transfers(itin: Itinerary, walkMps = 1.3): Transfer[] {
  const out: Transfer[] = [];
  let prev: Leg | null = null;
  let walkM = 0;
  for (const l of itin.legs) {
    if (!isTransit(l.mode)) {
      // MOTIS pads transfer walks with the transfer buffer, so use distance, not duration.
      if (l.mode === 'WALK') {
        walkM += l.distanceM != null && l.distanceM > 0 ? l.distanceM : GeoMath.distance(callPoint(l.from), callPoint(l.to)) * 1.25;
      }
      continue;
    }
    if (prev != null) {
      const walk = walkM > 0 ? Math.trunc(Math.max(30, walkM / walkMps)) : 0;
      out.push({ slackSec: l.start - prev.end - walk, walkM, next: l });
    }
    prev = l;
    walkM = 0;
  }
  return out;
}

/** The riskiest transfer worth warning about, if any. */
function riskiest(itin: Itinerary, walkMps = 1.3): Transfer | null {
  let best: Transfer | null = null;
  for (const t of transfers(itin, walkMps)) if (isTight(t) && (best == null || t.slackSec < best.slackSec)) best = t;
  return best;
}

/** Extra "virtual seconds" for transfers and how risky they are. */
function riskPenalty(itin: Itinerary, walkMps = 1.3): number {
  return sumOf(transfers(itin, walkMps), (t) => {
    let p = TRANSFER_PENALTY;
    if (isWalking(t)) p += Math.min(t.walkM, 600) * 0.3;
    if (isTight(t)) p += (TIGHT_SEC - Math.max(t.slackSec, -120)) * 1.5;
    return p;
  });
}

/** Extra "virtual seconds" for riding buses, for riders who'd rather take the train. */
function busPenalty(itin: Itinerary, rail: RailPreference): number {
  if (rail === 'NONE') return 0;
  const r = RAIL_PREFERENCES[rail];
  return sumOf(
    itin.legs.filter((l) => l.mode === 'BUS'),
    (l) => legDurationSec(l) * r.busMinuteCost + r.busLegSec,
  );
}

/**
 * Lower is better: arrival (or, for arrive-by, departure) plus penalties. FASTEST puts the
 * arrival first and uses the penalties only between options that arrive at the same second.
 */
function score(itin: Itinerary, arriveBy: boolean, walkMps = 1.3, rail: RailPreference = 'NONE', sort: RouteSort = 'BEST'): number {
  const base = arriveBy ? -itin.start : itin.end;
  const penalty = riskPenalty(itin, walkMps) + walkSec(itin) * WALK_WEIGHT + busPenalty(itin, rail);
  // Seconds × 1e5 stays well inside a double's exact range (about 2e14 for today's times).
  return sort === 'FASTEST' ? base * 1e5 + Math.min(penalty, 99_999) : base + penalty;
}

/**
 * True if [a] is at least as good as [b] on every count — leaves no earlier, arrives no
 * later, no more transfers, walking, risk or (when rail is preferred) bus riding — and
 * strictly better on one.
 */
function dominates(a: Itinerary, b: Itinerary, walkMps = 1.3, rail: RailPreference = 'NONE'): boolean {
  if (a.start < b.start || a.end > b.end || a.transfers > b.transfers) return false;
  if (walkSec(a) > walkSec(b) + 60) return false;
  if (riskPenalty(a, walkMps) > riskPenalty(b, walkMps)) return false;
  if (busPenalty(a, rail) > busPenalty(b, rail)) return false;
  return a.end < b.end || a.start > b.start || a.transfers < b.transfers;
}

/** Drops clearly dominated options and sorts the rest by [score]. */
function rank(list: Itinerary[], arriveBy: boolean, walkMps = 1.3, rail: RailPreference = 'NONE', sort: RouteSort = 'BEST'): Itinerary[] {
  const kept = list.filter((b) => !list.some((a) => a !== b && dominates(a, b, walkMps, rail)));
  return sortedBy(
    kept,
    (i) => score(i, arriveBy, walkMps, rail, sort),
    (i) => i.start,
  );
}

/**
 * Ranks itineraries by how good they are to actually take, not just by arrival time:
 * every transfer costs a few minutes, and tight or walking transfers (where a bus that is a
 * little early or late means missing the connection) cost more. With a RailPreference, time
 * on buses costs extra too.
 */
export const Ranking = { TIGHT_SEC, transfers, riskiest, riskPenalty, busPenalty, score, dominates, rank };
