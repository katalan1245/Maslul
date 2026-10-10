import { Combine } from '../src/data/combine';
import type { LiveCall } from '../src/data/eta';
import { type Leg, isCombined, legOptions, lineLabel, rideKey, transitLegs } from '../src/data/models';
import { call, instant, itinOf, live, makeLeg } from './helpers';

const t0 = instant('2026-09-28T07:00:00Z');
const at = (min: number) => t0 + min * 60;
const stop = (name: string, km: number, id: string | null = `s${name}`) => call(id, name, 32.0 + km / 111.195, 34.8);

const bus = (line: string, from: string, fromKm: number, to: string, toKm: number, start: number, end: number, fromId: string | null = `s${from}`) =>
  makeLeg({
    mode: 'BUS',
    from: stop(from, fromKm, fromId),
    to: stop(to, toKm),
    start: at(start),
    end: at(end),
    routeShortName: line,
    tripId: `trip-${line}-${start}`,
  });

const walk = (fromKm: number, toKm: number, start: number, end: number) =>
  makeLeg({ mode: 'WALK', from: stop('w', fromKm, null), to: stop('w2', toKm, null), start: at(start), end: at(end), distanceM: 200 });

const direct = (line: string, start: number, end: number) =>
  itinOf(`${line}@${start}`, walk(0, 0.2, start - 3, start), bus(line, 'A', 0.2, 'B', 5.0, start, end), walk(5.0, 5.2, end, end + 3));

const labels = (legs: Leg[]) => legs.map(lineLabel);
const none = () => null;

test('combines different lines between same stops', () => {
  const out = Combine.merge([direct('16', 10, 30), direct('92', 12, 33), direct('5', 15, 34)]);
  expect(out).toHaveLength(1);
  const leg = transitLegs(out[0])[0];
  expect(lineLabel(leg)).toBe('16');
  expect(labels(legOptions(leg))).toEqual(['16', '92', '5']);
  expect(isCombined(leg)).toBe(true);
  // Each line keeps its own times.
  const l92 = leg.alternatives.find((l) => lineLabel(l) === '92')!;
  expect(l92.start).toBe(at(12));
  expect(l92.end).toBe(at(33));
});

test('keeps best as main and lists options by soonest', () => {
  // The best-ranked option comes first even if another line leaves earlier.
  const out = Combine.merge([direct('92', 12, 25), direct('16', 10, 30)]);
  const leg = transitLegs(out[0])[0];
  expect(lineLabel(leg)).toBe('92');
  expect(out[0].id).toBe('92@12');
  expect(labels(legOptions(leg))).toEqual(['16', '92']);
});

test('later run of same line stays separate', () => {
  const out = Combine.merge([direct('16', 10, 30), direct('16', 25, 45), direct('92', 12, 33)]);
  expect(out.map((i) => i.id)).toEqual(['16@10', '16@25']);
  expect(labels(legOptions(transitLegs(out[0])[0]))).toEqual(['16', '92']);
  expect(isCombined(transitLegs(out[1])[0])).toBe(false);
});

test('different stops or far apart times do not combine', () => {
  const elsewhere = itinOf('x', bus('7', 'C', 1.5, 'B', 5.0, 11, 31));
  const muchLater = direct('92', 60, 80);
  expect(Combine.merge([direct('16', 10, 30), elsewhere, muchLater])).toHaveLength(3);
});

test('same stop area combines', () => {
  // Different stop ids (opposite platforms) but same name, 80 m apart.
  const a = itinOf('a', bus('16', 'A', 0.2, 'B', 5.0, 10, 30));
  const b = itinOf('b', bus('92', 'A', 0.28, 'B', 5.0, 12, 32, 'sA-2'));
  expect(Combine.sameStop(a.legs[0].from, b.legs[0].from)).toBe(true);
  expect(Combine.merge([a, b])).toHaveLength(1);
});

test('combines only the leg that differs', () => {
  const train = bus('Train', 'B', 5.0, 'F', 50.0, 40, 70);
  const a = itinOf('a', bus('16', 'A', 0.0, 'B', 5.0, 10, 30), walk(5.0, 5.0, 30, 35), train);
  const b = itinOf('b', bus('92', 'A', 0.0, 'B', 5.0, 14, 33), walk(5.0, 5.0, 33, 38), train);
  expect(Combine.differingLeg(a, b)).toBe(0);
  const out = Combine.merge([a, b]);
  expect(out).toHaveLength(1);
  expect(labels(legOptions(out[0].legs[0]))).toEqual(['16', '92']);
  expect(isCombined(out[0].legs[2])).toBe(false);

  // Different on both rides: two separate journeys.
  const c = itinOf('c', bus('92', 'A', 0.0, 'B', 5.0, 14, 33), bus('Train', 'B', 5.0, 'F', 50.0, 55, 85));
  expect(Combine.differingLeg(a, c)).toBeNull();
  expect(Combine.merge([a, c])).toHaveLength(2);
});

test('adds found rides that still make the connection', () => {
  const a = itinOf('a', bus('16', 'A', 0.0, 'B', 5.0, 10, 30), walk(5.0, 5.1, 30, 33), bus('Train', 'C', 5.1, 'F', 50.0, 40, 70));
  const rides = [
    bus('16', 'A', 0.0, 'B', 5.0, 10, 30), // itself
    bus('92', 'A', 0.0, 'B', 5.0, 12, 34), // fits: 34 + 3 min walk ≤ 40
    bus('5', 'A', 0.0, 'B', 5.0, 14, 38), // misses the train
    bus('92', 'A', 0.0, 'B', 5.0, 13, 35), // second run of 92: kept, the next few of a line are offered
    bus('40', 'A', 0.0, 'B', 5.0, 2, 22), // scheduled earlier: kept in case it's running late
    bus('41', 'A', 0.0, 'B', 5.0, -100, -80), // far too early to be merely late
    bus('7', 'Z', 3.0, 'B', 5.0, 12, 30), // other stop
  ];
  const leg = Combine.addAlternatives(a, 0, rides).legs[0];
  expect(labels(legOptions(leg))).toEqual(['40', '16', '92', '92']);
  expect(leg.alternatives.filter((l) => lineLabel(l) === '92').map((l) => l.start)).toEqual([12, 13].map(at));

  // A later ride's alternatives must leave after the previous one arrives (unless live says they're late).
  const withTrains = Combine.addAlternatives(a, 2, [bus('Train2', 'C', 5.1, 'F', 50.0, 31, 60), bus('Train3', 'C', 5.1, 'F', 50.0, 36, 66)]);
  expect(labels(Combine.catchableOptions(withTrains, 2, at(0), false, none))).toEqual(['Train3', 'Train']);
});

test('first ride alternatives not in the past', () => {
  const a = direct('16', 10, 30);
  const rides = [bus('92', 'A', 0.2, 'B', 5.0, 8, 29)];
  expect(labels(Combine.catchableOptions(Combine.addAlternatives(a, 1, rides), 1, at(0), false, none))).toEqual(['92', '16']);
  // Now is 07:07 and the walk to the stop takes 3 min: the 07:08 can't be caught (without live data saying it's late).
  const now = Combine.addAlternatives(a, 1, rides, at(7));
  expect(labels(Combine.catchableOptions(now, 1, at(7), false, none))).toEqual(['16']);
});

test('choosing another line moves the trip', () => {
  const merged = Combine.merge([direct('16', 10, 30), direct('92', 12, 33)])[0];
  const alt = merged.legs[1].alternatives[0];
  const chosen = Combine.choose(merged, 1, alt);
  expect(lineLabel(chosen.legs[1])).toBe('92');
  expect(labels(legOptions(chosen.legs[1]))).toEqual(['16', '92']);
  // Walks before and after move with the ride.
  expect(chosen.start).toBe(at(9));
  expect(chosen.end).toBe(at(36));
  expect(chosen.id).toBe(merged.id);
  expect(Combine.choose(merged, 1, merged.legs[1])).toBe(merged);
});

// ---- Catching an earlier bus that's running late ----

const liveAt = (l: Leg, board: number): LiveCall => live('LIVE', l.start, at(board), { delaySec: board * 60 - (l.start - t0) });

/** Planned 16 at 10:12 (min 12); the 10:02 one (min 2) is running late and reaches the stop at min 8. */
function lateCase() {
  const planned = direct('16', 12, 30);
  const late = bus('16', 'A', 0.2, 'B', 5.0, 2, 20);
  return { itin: Combine.addAlternatives(planned, 1, [late], at(4)), planned: planned.legs[1], late };
}

const of = (m: Map<string, LiveCall>) => (l: Leg) => m.get(rideKey(l)) ?? null;
const trips = (legs: Leg[]) => legs.map((l) => l.tripId);

test('keeps earlier scheduled ride of same line as candidate', () => {
  const { itin, late } = lateCase();
  expect(trips(legOptions(itin.legs[1]))).toEqual(['trip-16-2', 'trip-16-12']);
  expect(legOptions(itin.legs[1])[0].start).toBe(late.start);
});

test('switches to late earlier bus that comes first', () => {
  const { itin, planned, late } = lateCase();
  const m = new Map([
    [rideKey(late), liveAt(late, 8)],
    [rideKey(planned), liveAt(planned, 12)],
  ]);
  // At min 4 with a 3-minute walk you're at the stop by 7 — the late bus comes at 8.
  const picked = Combine.pickBest(itin, at(4), of(m));
  expect(picked.legs[1].tripId).toBe('trip-16-2');
  expect(trips(picked.legs[1].alternatives)).toEqual(['trip-16-12']);
});

test("ignores late bus you can't reach", () => {
  const { itin, planned, late } = lateCase();
  const m = new Map([
    [rideKey(late), liveAt(late, 8)],
    [rideKey(planned), liveAt(planned, 12)],
  ]);
  // At min 7 you'd reach the stop at 10: the late bus is gone by then.
  expect(Combine.pickBest(itin, at(7), of(m))).toBe(itin);
  expect(trips(Combine.catchableOptions(itin, 1, at(7), false, of(m)))).toEqual(['trip-16-12']);
});

test('earlier scheduled bus without live data is not offered', () => {
  const { itin } = lateCase();
  // No live data: the 10:02 has presumably left, so only the planned bus is catchable.
  expect(trips(Combine.catchableOptions(itin, 1, at(4), false, none))).toEqual(['trip-16-12']);
  expect(Combine.pickBest(itin, at(4), none)).toBe(itin);
});

test('passed bus is not offered', () => {
  const { itin, planned, late } = lateCase();
  const m = new Map([
    [rideKey(late), live('PASSED', late.start, null)],
    [rideKey(planned), liveAt(planned, 12)],
  ]);
  expect(trips(Combine.catchableOptions(itin, 1, at(4), false, of(m)))).toEqual(['trip-16-12']);
});

test('keeps up to three buses per line', () => {
  const planned = direct('16', 12, 30);
  const more = [14, 18, 22, 26].map((s) => bus('16', 'A', 0.2, 'B', 5.0, s, s + 18));
  const leg = Combine.addAlternatives(planned, 1, more, at(4)).legs[1];
  expect(legOptions(leg).map((l) => l.start)).toEqual([12, 14, 18].map(at));
});

/**
 * The 18 runs every 12 min and the planner's first is at min 102. The one due at min 66 is
 * running 28 min late and comes at min 94, just as you reach the stop. Older 18s, 25s and 40s
 * from the last hour and a half must not crowd it out of the candidates.
 */
test('keeps the most recent late candidates, not the oldest', () => {
  const planned = direct('18', 102, 107);
  const found = [
    ...[30, 42, 54, 66, 78, 90, 102, 114].map((s) => bus('18', 'A', 0.2, 'B', 5.0, s, s + 5)),
    ...[34, 49, 64, 79, 94].map((s) => bus('25', 'A', 0.2, 'B', 5.0, s, s + 5)),
    ...[27, 47, 67, 87].map((s) => bus('40', 'A', 0.2, 'B', 5.0, s, s + 5)),
  ];
  const itin = Combine.addAlternatives(planned, 1, found, at(92));
  expect(trips(legOptions(itin.legs[1]))).toContain('trip-18-66');
  // Live: the min-66 bus reaches the stop at 94; the planned one is 8 min late.
  const late = legOptions(itin.legs[1]).find((l) => l.tripId === 'trip-18-66')!;
  const m = new Map([
    [rideKey(late), liveAt(late, 94)],
    [rideKey(planned.legs[1]), liveAt(planned.legs[1], 110)],
  ]);
  expect(Combine.pickBest(itin, at(92), of(m)).legs[1].tripId).toBe('trip-18-66');
  // The upcoming ones are still the next few, soonest first.
  expect(trips(legOptions(itin.legs[1]))).toContain('trip-18-114');
});

/**
 * The walk the planner works out from the rider's position makes it pick the min-54 tram, but
 * the min-45 one is still catchable on the timetable alone. Trams every 9 min over the last hour
 * and a half must not crowd it out.
 */
test('offers the earlier tram still catchable on the timetable', () => {
  const tram = (start: number) => bus('T', 'A', 0.0, 'B', 9.0, start, start + 17);
  const planned = itinOf('t@54', walk(0.0, 0.0, 47, 54), tram(54), walk(9.0, 9.4, 71, 78));
  const found: Leg[] = [];
  for (let s = -45; s <= 63; s += 9) found.push(tram(s));
  const itin = Combine.addAlternatives(planned, 1, found, at(39));
  expect(Combine.catchableOptions(itin, 1, at(39), false, none).slice(0, 2).map((l) => l.start)).toEqual([at(45), at(54)]);
  expect(Combine.pickBest(itin, at(39), none).legs[1].tripId).toBe('trip-T-45');
});

test('late candidates are per line and most recent first', () => {
  const planned = direct('16', 100, 105);
  const found: Leg[] = [];
  for (let s = 10; s <= 90; s += 10) found.push(bus('16', 'A', 0.2, 'B', 5.0, s, s + 5));
  const late = Combine.addAlternatives(planned, 1, found, at(90)).legs[1].alternatives.map((l) => l.start);
  expect(late).toEqual([40, 50, 60, 70, 80, 90].map(at));
  expect(late).toHaveLength(Combine.LATE_PER_LINE);
});

test('ridesAfter lists later rides of any line on the same hop', () => {
  const leg = { ...direct('16', 12, 30).legs[1], alternatives: [bus('16', 'A', 0.2, 'B', 5.0, 8, 26)] };
  const found = [
    bus('92', 'A', 0.2, 'B', 5.0, 20, 38),
    bus('16', 'A', 0.2, 'B', 5.0, 27, 45),
    leg, // the ride itself
    bus('5', 'A', 0.2, 'C', 9.0, 15, 40), // goes elsewhere
  ];
  const after = Combine.ridesAfter(leg, found);
  expect(after.map((l) => [lineLabel(l), l.start])).toEqual([
    ['92', at(20)],
    ['16', at(27)],
  ]);
});

test('planned trip far ahead gets no earlier buses as late candidates', () => {
  const planned = direct('16', 12, 30);
  const earlier = bus('16', 'A', 0.2, 'B', 5.0, 2, 20);
  // Planning for 10:12 tomorrow: the 10:02 can't be running late yet, so it isn't offered.
  const tomorrow = Combine.addAlternatives(planned, 1, [earlier], at(12 - 24 * 60));
  expect(trips(legOptions(tomorrow.legs[1]))).toEqual(['trip-16-12']);
  // Planning for half an hour from now, it may still be running late.
  const soon = Combine.addAlternatives(planned, 1, [earlier], at(-20));
  expect(trips(legOptions(soon.legs[1]))).toEqual(['trip-16-2', 'trip-16-12']);
});

test('live bus you could hurry for is shown but not planned on', () => {
  // 3-minute walk to the stop; it's min 9, so you'd stroll there by min 12.
  const itin = direct('16', 12, 30);
  const b = itin.legs[1];
  const close = new Map([[rideKey(b), liveAt(b, 10)]]); // live: at the stop at min 10
  expect(Combine.onlyByHurrying(itin, 1, b, at(9), close.get(rideKey(b)))).toBe(true);
  expect(Combine.catchableOptions(itin, 1, at(9), false, of(close))).toEqual([]);
  expect(Combine.catchableOptions(itin, 1, at(9), true, of(close)).map(rideKey)).toEqual([rideKey(b)]);
  // Too close to make even hurrying, or only on the timetable: not offered.
  expect(Combine.onlyByHurrying(itin, 1, b, at(9), liveAt(b, 8))).toBe(false);
  expect(Combine.onlyByHurrying(itin, 1, b, at(11), null)).toBe(false);
});

test('hurry allows two minutes of slack', () => {
  // A 4-minute walk (2 min hurrying); it's min 8, and the live bus is at the stop 44 s from now.
  const itin = itinOf('h', walk(0.0, 0.3, 8, 12), bus('16', 'A', 0.3, 'B', 5.0, 12, 30), walk(5.0, 5.2, 30, 33));
  const b = itin.legs[1];
  expect(Combine.onlyByHurrying(itin, 1, b, at(8), live('LIVE', b.start, at(8) + 44))).toBe(true);
  // More than 2 minutes before you could hurry there: gone.
  expect(Combine.onlyByHurrying(itin, 1, b, at(8), live('LIVE', b.start, at(8) - 5))).toBe(false);
});

// ---- Times as the rides are expected to run ----

/** Walk 2 → ride A (min 10–20) → walk 3 → ride B (min 30–45) → walk 3. */
const twoRides = (bAlternatives: Leg[] = []) =>
  itinOf(
    'two',
    walk(0.0, 0.2, 8, 10),
    bus('A', 'A', 0.2, 'B', 5.0, 10, 20),
    walk(5.0, 5.2, 20, 23),
    { ...bus('B', 'C', 5.2, 'D', 12.0, 30, 45), alternatives: bAlternatives },
    walk(12.0, 12.2, 45, 48),
  );

test("late second ride doesn't end the trip before it starts", () => {
  // A ride B due at min -5 is running 31 min late: at the stop at 26, in at 41 — sooner than the planned one.
  const lateB = bus('B', 'C', 5.2, 'D', 12.0, -5, 10);
  const itin = twoRides([lateB]);
  const m = new Map([[rideKey(lateB), live('LIVE', lateB.start, at(26), { alightExpected: at(41) })]]);
  const picked = Combine.pickBest(itin, at(5), of(m));
  expect(picked.legs[3].tripId).toBe('trip-B--5');
  // On the timetable that trip ends at min 13, before you'd even leave.
  expect(picked.end < picked.start + 10 * 60).toBe(true);
  const e = Combine.expected(picked, of(m));
  expect(e.start).toBe(at(8));
  expect(e.end).toBe(at(44));
  expect(e.legs[3].end).toBe(at(41));
});

test('expected times follow live rides and the walks move with them', () => {
  const itin = twoRides();
  expect(Combine.expected(itin, none)).toBe(itin);
  const a = itin.legs[1];
  const b = itin.legs[3];
  const m = new Map([
    [rideKey(a), live('LIVE', a.start, at(14), { alightExpected: at(24) })],
    [rideKey(b), live('LIVE', b.start, at(32), { alightExpected: at(47) })],
  ]);
  const e = Combine.expected(itin, of(m));
  // Start, then where each leg ends: walk 14, A 24, walk 27, B 47, walk 50.
  expect([e.start, ...e.legs.map((l) => l.end)]).toEqual([12, 14, 24, 27, 47, 50].map(at));
  expect(e.legs[3].start).toBe(at(32));
  // An untracked ride keeps its timetable.
  expect(Combine.expected(itin, (l) => (l === a ? m.get(rideKey(a))! : null)).legs[3].start).toBe(b.start);
});

test('connection uses the live arrival of the ride before', () => {
  const laterB = bus('B', 'C', 5.2, 'D', 12.0, 50, 65);
  const itin = twoRides([laterB]);
  const a = itin.legs[1];
  // On time: the planned B at 30 is caught.
  expect(trips(Combine.catchableOptions(itin, 3, at(5), false, none))).toEqual(['trip-B-30', 'trip-B-50']);
  // A runs 20 min late and gets in at 40: the B at 30 is gone by the time you walk over.
  const late = new Map([[rideKey(a), live('LIVE', a.start, at(30), { alightExpected: at(40) })]]);
  expect(trips(Combine.catchableOptions(itin, 3, at(5), false, of(late)))).toEqual(['trip-B-50']);
  expect(Combine.pickBest(itin, at(5), of(late)).legs[3].tripId).toBe('trip-B-50');
});

test('plans that end up on the same bus show once', () => {
  // Two plans (the 16 at min 12 and at min 24) both switch to a late 16 that comes first.
  const late = bus('16', 'A', 0.2, 'B', 5.0, 2, 20);
  const a = Combine.addAlternatives(direct('16', 12, 30), 1, [late], at(4));
  const b = Combine.addAlternatives(direct('16', 24, 42), 1, [late], at(4));
  const m = new Map([[rideKey(late), liveAt(late, 8)]]);
  const picked = [a, b].map((i) => Combine.pickBest(i, at(4), of(m)));
  expect(picked.map((i) => i.legs[1].tripId)).toEqual(['trip-16-2', 'trip-16-2']);
  expect(Combine.distinctRides(picked).map((i) => i.id)).toEqual([a.id]);
});

test("a late first ride that misses the only connection doesn't connect", () => {
  const itin = twoRides();
  const a = itin.legs[1];
  expect(Combine.connects(itin, at(5), none)).toBe(true);
  // A gets in at 40: the walk ends at 43, long after the only B (min 30) leaves.
  const late = new Map([[rideKey(a), live('LIVE', a.start, at(30), { alightExpected: at(40) })]]);
  expect(Combine.pickBest(itin, at(5), of(late))).toBe(itin);
  expect(Combine.connects(itin, at(5), of(late))).toBe(false);
  // With a later B to switch to, it still connects.
  const withLater = Combine.pickBest(twoRides([bus('B', 'C', 5.2, 'D', 12.0, 50, 65)]), at(5), of(late));
  expect(Combine.connects(withLater, at(5), of(late))).toBe(true);
});

test('walk between rides moves with a switched ride', () => {
  // Planned B at 30 (walk 27–30 before it); an earlier B at 25 is switched to, no live data at all.
  const earlierB = bus('B', 'C', 5.2, 'D', 12.0, 25, 40);
  const planned = itinOf(
    'w',
    walk(0.0, 0.2, 8, 10),
    bus('A', 'A', 0.2, 'B', 5.0, 10, 20),
    walk(5.0, 5.2, 27, 30),
    { ...bus('B', 'C', 5.2, 'D', 12.0, 30, 45), alternatives: [earlierB] },
    walk(12.0, 12.2, 45, 48),
  );
  const picked = Combine.pickBest(planned, at(5), none);
  expect(picked.legs[3].tripId).toBe('trip-B-25');
  const e = Combine.expected(picked, none);
  expect(e.legs[2].start).toBe(at(20));
  expect(e.legs[2].end).toBe(at(23));
  expect(e.legs[3].start < e.legs[2].end).toBe(false);
  expect(e.end).toBe(at(43));
});

test('an earlier bus that gets in no sooner is not taken instead (R1: the card opened as an earlier trip)', () => {
  const planned = direct('16', 12, 30);
  const early = bus('92', 'A', 0.2, 'B', 5.0, 6, 30);
  const itin = Combine.addAlternatives(planned, 1, [early], at(2));
  const m = new Map([
    [rideKey(early), live('LIVE', early.start, at(6), { alightExpected: at(30) })],
    [rideKey(planned.legs[1]), live('LIVE', planned.legs[1].start, at(12), { alightExpected: at(30) })],
  ]);
  expect(trips(Combine.catchableOptions(itin, 1, at(2), false, of(m)))).toEqual(['trip-92-6', 'trip-16-12']);
  expect(Combine.pickBest(itin, at(2), of(m))).toBe(itin);
});
