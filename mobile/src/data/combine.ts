import { GeoMath } from './geo';
import { type LiveCall, bestTime } from './eta';
import {
  type Itinerary,
  type Leg,
  type StopCall,
  callPoint,
  isTransit,
  legDurationSec,
  legOptions,
  lineLabel,
  rideKey,
} from './models';
import type { Instant } from './time';
import { distinctBy, partition, sortedBy, sumOf } from './util';

/** Stops closer than this are the same place (opposite platforms, same pole). */
const NEAR_M = 60;
/** Same-named stops closer than this are one stop area. */
const AREA_M = 150;
/** Alternatives must leave within this long after the option's own ride. */
const WINDOW_SEC = 25 * 60;
/** A first ride may also be one that leaves up to this much earlier. */
const EARLIER_SEC = 3 * 60;
const MAX_ALTERNATIVES = 7;
/** Buses of one line offered per ride (the next few, including a late earlier one). */
const PER_LINE = 3;
/** Earlier-scheduled rides are kept as candidates this far back: they may be running late (TransitRepository.LATE_WINDOW_SEC). */
const LATE_SEC = 90 * 60;
/** Earlier-scheduled rides of one line kept as late candidates (the most recent ones). */
const LATE_PER_LINE = 6;
/** Leeway when judging whether a bus can still be caught. */
const CATCH_SLACK_SEC = 90;
/** Hurrying (a brisk walk or a jog) covers a walk in this share of its time. */
const HURRY_SHARE = 0.5;
/** Leeway when judging whether a bus can be caught by hurrying: a bus a couple of minutes out is worth running for. */
const HURRY_SLACK_SEC = 120;

type LiveOf = (l: Leg) => LiveCall | null | undefined;
const noLive: LiveOf = () => null;

const lower = (s: string) => s.trim().toLowerCase();

function sameStop(a: StopCall, b: StopCall): boolean {
  if (a.stopId != null && a.stopId === b.stopId) return true;
  const d = GeoMath.distance(callPoint(a), callPoint(b));
  return d < NEAR_M || (d < AREA_M && a.name.trim() !== '' && lower(a.name) === lower(b.name));
}

/** Both legs board and alight at the same stops. */
const sameRide = (a: Leg, b: Leg) => isTransit(a.mode) && isTransit(b.mode) && sameStop(a.from, b.from) && sameStop(a.to, b.to);

/** Same vehicle run (not just the same line). */
const sameTrip = (a: Leg, b: Leg) =>
  a.tripId != null || b.tripId != null ? a.tripId === b.tripId : lineLabel(a) === lineLabel(b) && a.start === b.start;

/** A line as riders see it: same number from the same operator. */
const lineKey = (l: Leg) => `${l.mode}|${lineLabel(l)}|${l.agencyName ?? ''}`;

const withLeg = (itin: Itinerary, i: number, leg: Leg): Itinerary => ({ ...itin, legs: itin.legs.map((l, k) => (k === i ? leg : l)) });

const shift = (l: Leg, sec: number): Leg => (sec === 0 ? l : { ...l, start: l.start + sec, end: l.end + sec });

/**
 * Index (into [Itinerary.legs] of [a]) of the single transit leg where [a] and [b] ride
 * different trips between the same stops, when they are otherwise the same journey.
 */
function differingLeg(a: Itinerary, b: Itinerary): number | null {
  const ta = a.legs.map((l, index) => ({ l, index })).filter((x) => isTransit(x.l.mode));
  const tb = b.legs.filter((l) => isTransit(l.mode));
  if (ta.length !== tb.length || ta.length === 0) return null;
  let diff: number | null = null;
  for (let k = 0; k < ta.length; k++) {
    const x = ta[k].l;
    const y = tb[k];
    if (!sameRide(x, y)) return null;
    if (sameTrip(x, y)) continue;
    if (diff != null) return null;
    diff = ta[k].index;
  }
  return diff;
}

/**
 * Folds options that differ only in the line taken on one leg into one option. [list] is
 * ordered best first; the best of each group stays the main ride, so no departure is lost —
 * the others become alternatives on that leg (one per line, each line's soonest).
 */
function merge(list: Itinerary[]): Itinerary[] {
  const groups: Itinerary[] = [];
  for (const x of list) {
    let merged = false;
    for (let g = 0; g < groups.length; g++) {
      const primary = groups[g];
      const i = differingLeg(primary, x);
      if (i == null) continue;
      const leg = primary.legs[i];
      const transitBefore = primary.legs.slice(0, i).filter((l) => isTransit(l.mode)).length;
      const alt = x.legs.filter((l) => isTransit(l.mode))[transitBefore];
      if (legOptions(leg).some((o) => lineKey(o) === lineKey(alt))) continue;
      if (Math.abs(alt.start - leg.start) > WINDOW_SEC) continue;
      if (leg.alternatives.length >= MAX_ALTERNATIVES) continue;
      groups[g] = withLeg(primary, i, { ...leg, alternatives: [...leg.alternatives, { ...alt, alternatives: [] }] });
      merged = true;
      break;
    }
    if (!merged) groups.push(x);
  }
  return groups;
}

/**
 * Adds rides from [rides] (direct rides found between the leg's two stops) as
 * alternatives on leg [legIndex], keeping only those that still fit the journey: after
 * the previous connection, in time for the next one, and not before [now]. Rides
 * scheduled up to LATE_SEC too early are kept too (the latest LATE_PER_LINE of each
 * line) — a late bus may still be catchable, which [catchable] decides once live data is
 * in — but only for a ride that's about to happen: a bus planned for tomorrow can't be
 * running late yet.
 */
function addAlternatives(itin: Itinerary, legIndex: number, rides: Leg[], now: Instant | null = null): Itinerary {
  const leg = itin.legs[legIndex];
  if (leg == null || !isTransit(leg.mode)) return itin;
  const before = itin.legs.slice(0, legIndex);
  const after = itin.legs.slice(legIndex + 1);
  const prev = before.map((l) => isTransit(l.mode)).lastIndexOf(true);
  const next = after.findIndex((l) => isTransit(l.mode));
  const walkBefore = sumOf(before.slice(prev + 1), legDurationSec);
  let earliest: Instant;
  if (prev >= 0) earliest = before[prev].end + walkBefore;
  else {
    const e = leg.start - EARLIER_SEC;
    earliest = now != null && now + walkBefore > e ? now + walkBefore : e;
  }
  const latestEnd = next >= 0 ? after[next].start - sumOf(after.slice(0, next), legDurationSec) : null;
  const latestStart = leg.start + WINDOW_SEC;
  const soon = now == null || !(now + LATE_SEC < earliest);
  const lateFrom = soon ? earliest - LATE_SEC : earliest;

  const options = legOptions(leg);
  const candidates = distinctBy(
    rides
      .filter((r) => sameRide(r, leg) && !options.some((o) => sameTrip(o, r)))
      .filter((r) => !(r.start < lateFrom) && !(r.start > latestStart))
      .filter((r) => latestEnd == null || !(r.end > latestEnd)),
    rideKey,
  );
  const [late, upcoming] = partition(candidates, (r) => r.start < earliest);
  // The next few of each line, soonest first.
  const perLine = new Map<string, number>();
  for (const o of options) perLine.set(lineKey(o), (perLine.get(lineKey(o)) ?? 0) + 1);
  const soonest = sortedBy(upcoming, (r) => r.start)
    .filter((o) => {
      const n = perLine.get(lineKey(o)) ?? 0;
      if (n < PER_LINE) {
        perLine.set(lineKey(o), n + 1);
        return true;
      }
      return false;
    })
    .slice(0, Math.max(MAX_ALTERNATIVES - leg.alternatives.length, 0));
  // Possibly-late ones, most recent first: the one due just before you get there is the likeliest
  // to still come, not one from an hour and a half ago. [catchable] decides which are offered.
  const latePerLine = new Map<string, number>();
  const recent = [...late]
    .sort((a, b) => b.start - a.start)
    .filter((o) => {
      const n = (latePerLine.get(lineKey(o)) ?? 0) + 1;
      latePerLine.set(lineKey(o), n);
      return n <= LATE_PER_LINE;
    });
  const added = sortedBy([...soonest, ...recent], (r) => r.start).map((r) => ({ ...r, alternatives: [] }));
  if (added.length === 0) return itin;
  return withLeg(itin, legIndex, { ...leg, alternatives: [...leg.alternatives, ...added] });
}

/**
 * Rides between the same two stops that leave after [leg] (any line), soonest first: what's
 * left if it's missed. [found] adds rides looked up separately to the leg's own options.
 */
function ridesAfter(leg: Leg, found: Leg[], count = 2): Leg[] {
  const after = [...legOptions(leg), ...found].filter((r) => sameRide(r, leg) && r.start > leg.start && !sameTrip(r, leg));
  return sortedBy(distinctBy(after, rideKey), (r) => r.start).slice(0, count);
}

/** When [option] reaches the boarding stop: live when tracked, else the timetable. */
function boards(option: Leg, call: LiveCall | null | undefined): Instant {
  return call != null && call.status === 'LIVE' ? bestTime(call) : option.start;
}

/** When [option] gets to the alighting stop, live when tracked. */
function arrives(option: Leg, call: LiveCall | null | undefined): Instant {
  if (call == null || call.status !== 'LIVE') return option.end;
  return call.alightExpected ?? option.end + (bestTime(call) - option.start);
}

/**
 * When you can be at leg [legIndex]'s boarding stop: [now] plus the walk there for the
 * first ride, else when the previous ride gets in (live when tracked: a late bus gets in
 * late, whatever its timetable says) plus the walk between.
 */
function reachBy(itin: Itinerary, legIndex: number, now: Instant, hurry = false, liveOf: LiveOf = noLive): Instant {
  const before = itin.legs.slice(0, Math.min(Math.max(legIndex, 0), itin.legs.length));
  const prev = before.map((l) => isTransit(l.mode)).lastIndexOf(true);
  // Hurrying speeds up walking, not a car ride.
  const walk = sumOf(before.slice(prev + 1), (l) =>
    hurry && l.mode === 'WALK' ? Math.trunc(legDurationSec(l) * HURRY_SHARE) : legDurationSec(l),
  );
  return (prev >= 0 ? Math.max(arrives(before[prev], liveOf(before[prev])), now) : now) + walk;
}

/**
 * [itin] as it's expected to go: each live-tracked ride at the times it's expected to board
 * and arrive, with the walks moving along (also after a ride was switched to another bus, which
 * leaves the walk between rides on the old one's times). The legs keep the timetable; this is
 * what to show (times, duration, transfer slack) once a late bus is in the plan.
 */
function expected(itin: Itinerary, liveOf: LiveOf): Itinerary {
  const legs = [...itin.legs];
  const transit = legs.map((l, i) => (isTransit(l.mode) ? i : -1)).filter((i) => i >= 0);
  if (transit.length === 0) return itin;
  let changed = false;
  const set = (i: number, l: Leg) => {
    if (l.start !== legs[i].start || l.end !== legs[i].end) changed = true;
    legs[i] = l;
  };
  for (const i of transit) {
    const l = legs[i];
    const c = liveOf(l);
    if (c == null || c.status !== 'LIVE') continue;
    const s = boards(l, c);
    set(i, { ...l, start: s, end: Math.max(arrives(l, c), s) });
  }
  // Walks to the first ride end as it boards; every other walk starts when the ride before it gets in.
  // A driver heading somewhere leaves when they do, so their lift (and anything before it) stays put.
  for (let i = transit[0] - 1; i >= 0; i--) {
    if (legs[i].fixed) break;
    const next = legs[i + 1].start;
    set(i, { ...legs[i], start: next - legDurationSec(legs[i]), end: next });
  }
  for (let i = transit[0] + 1; i < legs.length; i++) {
    if (isTransit(legs[i].mode)) continue;
    const prev = legs[i - 1].end;
    set(i, { ...legs[i], start: prev, end: prev + legDurationSec(legs[i]) });
  }
  if (!changed) return itin;
  return { ...itin, start: legs[0].start, end: legs[legs.length - 1].end, legs };
}

/**
 * Whether [option] can still be caught by someone at the stop at [reachBy]: it hasn't
 * passed, and it gets there after them. An earlier-scheduled bus only counts when it's
 * tracked live (so it's known to be running late).
 */
function catchable(option: Leg, call: LiveCall | null | undefined, reachByAt: Instant, slack = CATCH_SLACK_SEC): boolean {
  if (call?.status === 'PASSED') return false;
  const live = call?.status === 'LIVE';
  if (!live && option.start < reachByAt - slack) return false;
  return !(boards(option, call) < reachByAt - slack);
}

/**
 * Whether [option] can be caught only by hurrying to the stop: it's tracked live and hasn't
 * passed, and it comes before you'd walk there but not before you could hurry there.
 */
function onlyByHurrying(
  itin: Itinerary,
  legIndex: number,
  option: Leg,
  now: Instant,
  call: LiveCall | null | undefined,
  liveOf: LiveOf = noLive,
): boolean {
  if (call?.status !== 'LIVE' || catchable(option, call, reachBy(itin, legIndex, now, false, liveOf))) return false;
  return !(boards(option, call) < reachBy(itin, legIndex, now, true, liveOf) - HURRY_SLACK_SEC);
}

/**
 * Leg [legIndex]'s options that can still be caught, soonest first. With [hurry], also live
 * buses you'd catch only by hurrying ([onlyByHurrying]): worth showing, so you can run for
 * one you see is close, but not planned on.
 */
function catchableOptions(itin: Itinerary, legIndex: number, now: Instant, hurry: boolean, liveOf: LiveOf): Leg[] {
  const leg = itin.legs[legIndex];
  if (leg == null || !isTransit(leg.mode)) return [];
  const by = reachBy(itin, legIndex, now, false, liveOf);
  return sortedBy(
    legOptions(leg).filter(
      (o) => catchable(o, liveOf(o), by) || (hurry && onlyByHurrying(itin, legIndex, o, now, liveOf(o), liveOf)),
    ),
    (o) => boards(o, liveOf(o)),
  );
}

/**
 * The catchable option of leg [legIndex] that gets you there first (ties: boards first),
 * or null when the current ride gets in as soon (or nothing is catchable).
 */
function bestOption(itin: Itinerary, legIndex: number, now: Instant, liveOf: LiveOf): Leg | null {
  const leg = itin.legs[legIndex];
  if (leg == null || !isTransit(leg.mode)) return null;
  const options = catchableOptions(itin, legIndex, now, false, liveOf);
  let best: Leg | null = null;
  for (const o of options) {
    if (
      best == null ||
      arrives(o, liveOf(o)) < arrives(best, liveOf(best)) ||
      (arrives(o, liveOf(o)) === arrives(best, liveOf(best)) && boards(o, liveOf(o)) < boards(best, liveOf(best)))
    ) {
      best = o;
    }
  }
  // A bus that gets in no sooner isn't worth switching to: an earlier one only means waiting at the next stop.
  const current = options.find((o) => rideKey(o) === rideKey(leg));
  if (best == null || current == null) return best != null && rideKey(best) !== rideKey(leg) ? best : null;
  return arrives(best, liveOf(best)) < arrives(current, liveOf(current)) ? best : null;
}

/**
 * Whether every ride after the first can still be caught, as the rides before it are
 * expected to run: a late first bus can make a connection impossible.
 */
function connects(itin: Itinerary, now: Instant, liveOf: LiveOf): boolean {
  const transit = itin.legs.map((l, i) => (isTransit(l.mode) ? i : -1)).filter((i) => i >= 0);
  return transit.slice(1).every((i) => catchable(itin.legs[i], liveOf(itin.legs[i]), reachBy(itin, i, now, false, liveOf)));
}

/**
 * The itinerary riding [choice] (one of leg [legIndex]'s options) instead. Walks to the
 * first ride and from the last one move with it, so start/end times stay right.
 */
function choose(itin: Itinerary, legIndex: number, choice: Leg): Itinerary {
  const leg = itin.legs[legIndex];
  if (leg == null) return itin;
  if (sameTrip(leg, choice) && leg.start === choice.start) return itin;
  const others = legOptions(leg)
    .filter((o) => !(sameTrip(o, choice) && o.start === choice.start))
    .map((o) => ({ ...o, alternatives: [] }));
  const swapped = { ...choice, alternatives: others };
  const firstTransit = itin.legs.findIndex((l) => isTransit(l.mode));
  const lastTransit = itin.legs.map((l) => isTransit(l.mode)).lastIndexOf(true);
  // A driver heading somewhere leaves when they do: only the walk after their lift moves.
  const lift = itin.legs
    .slice(0, Math.max(firstTransit, 0))
    .map((l) => l.fixed)
    .lastIndexOf(true);
  const dStart = choice.start - leg.start;
  const dEnd = choice.end - leg.end;
  const legs = itin.legs.map((l, i) => {
    if (i === legIndex) return swapped;
    if (i < legIndex && legIndex === firstTransit && i > lift) return shift(l, dStart);
    if (i > legIndex && legIndex === lastTransit) return shift(l, dEnd);
    return l;
  });
  return { ...itin, start: legs[0].start, end: legs[legs.length - 1].end, legs };
}

/**
 * [itin] with every transit leg (except [keep]) switched to its best catchable ride, so an
 * earlier bus that's running late — or another line that comes sooner — is taken.
 */
function pickBest(itin: Itinerary, now: Instant, liveOf: LiveOf, keep: ReadonlySet<number> = new Set()): Itinerary {
  return itin.legs.reduce((acc, _, i) => {
    if (keep.has(i)) return acc;
    const b = bestOption(acc, i, now, liveOf);
    return b ? choose(acc, i, b) : acc;
  }, itin);
}

/**
 * [list] without options that, once each has picked its bus, ride exactly the same vehicles
 * as a better-ranked one (two plans that both switched to the same late bus): the first stays.
 */
function distinctRides(list: Itinerary[]): Itinerary[] {
  return distinctBy(list, (itin) => itin.legs.filter((l) => isTransit(l.mode)).map(rideKey).join('\u0000'));
}

/**
 * Several lines often ride between the same two stops (e.g. 16, 92 and 5 all go from A to B).
 * Instead of listing each as its own route, such options are folded into one whose transit
 * leg carries the other lines as [Leg.alternatives], each keeping its own times and trip.
 */
export const Combine = {
  WINDOW_SEC,
  MAX_ALTERNATIVES,
  PER_LINE,
  LATE_SEC,
  LATE_PER_LINE,
  sameStop,
  sameRide,
  sameTrip,
  lineKey,
  differingLeg,
  merge,
  addAlternatives,
  ridesAfter,
  reachBy,
  expected,
  boards,
  arrives,
  catchable,
  onlyByHurrying,
  catchableOptions,
  bestOption,
  connects,
  pickBest,
  distinctRides,
  choose,
};

