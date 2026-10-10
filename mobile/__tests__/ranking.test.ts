import { type Leg, type StopCall, lineLabel, makeLeg } from '../src/data/models';
import { Ranking, isTight, isWalking } from '../src/data/ranking';
import { instant, itinOf } from './helpers';

const t0 = instant('2026-09-27T21:00:00Z');
const at = (min: number) => t0 + min * 60;
const stop = (name: string, km: number): StopCall => ({
  stopId: `s${name}`, name, code: null, lat: 32.0 + km / 111.195, lon: 34.8, scheduledArrival: null, scheduledDeparture: null,
});
const bus = (line: string, from: string, fromKm: number, to: string, toKm: number, start: number, end: number): Leg =>
  makeLeg({ mode: 'BUS', from: stop(from, fromKm), to: stop(to, toKm), start: at(start), end: at(end), routeShortName: line, tripId: `trip-${line}-${start}` });
const walk = (fromKm: number, toKm: number, start: number, end: number, meters: number): Leg =>
  makeLeg({ mode: 'WALK', from: stop('w', fromKm), to: stop('w2', toKm), start: at(start), end: at(end), distanceM: meters });

// Night trip from the bug report: three buses with short walks between them…
const threeBuses = itinOf(
  '22-143-56',
  walk(0.0, 0.3, 0, 4, 300),
  bus('22', 'A', 0.3, 'B', 3.0, 4, 14),
  walk(3.0, 3.15, 14, 16, 150),
  bus('143', 'C', 3.15, 'D', 5.0, 16, 22),
  walk(5.0, 5.3, 22, 26, 300),
  bus('56', 'E', 5.3, 'F', 8.0, 26, 34),
  walk(8.0, 8.2, 34, 37, 200),
);

// …versus a direct bus arriving a few minutes later.
const direct = itinOf('64', walk(0.0, 0.3, 2, 6, 300), bus('64', 'A', 0.3, 'F', 8.0, 6, 38), walk(8.0, 8.2, 38, 41, 200));

test('measures slack after walking', () => {
  const t = Ranking.transfers(threeBuses);
  expect(t).toHaveLength(2);
  // 150 m at 1.3 m/s ≈ 115 s of the 2 min connection → 5 s spare.
  expect(t[0].slackSec).toBe(5);
  expect(isTight(t[0]) && isWalking(t[0])).toBe(true);
  expect(lineLabel(t[0].next)).toBe('143');
  expect(Ranking.riskiest(threeBuses)).toEqual([...t].sort((a, b) => a.slackSec - b.slackSec)[0]);
  expect(Ranking.riskiest(direct)).toBeNull();
});

test('comfortable same-stop transfer is not tight', () => {
  const t = Ranking.transfers(itinOf('x', bus('1', 'A', 0, 'B', 2, 0, 10), bus('2', 'B', 2, 'C', 4, 16, 25)));
  expect(t).toHaveLength(1);
  expect(t[0].slackSec).toBe(360);
  expect(isTight(t[0]) || isWalking(t[0])).toBe(false);
});

test('direct beats risky chain arriving slightly earlier', () => {
  expect(threeBuses.end < direct.end).toBe(true);
  expect(Ranking.rank([threeBuses, direct], false).map((i) => i.id)).toEqual(['64', '22-143-56']);
});

test('sorted by fastest, the chain that arrives first goes first, and a tie falls back to the penalties', () => {
  expect(Ranking.rank([direct, threeBuses], false, 1.3, 'NONE', 'FASTEST').map((i) => i.id)).toEqual(['22-143-56', '64']);
  // Leaves earlier, so neither drops the other.
  const sameEnd = itinOf('same', bus('9', 'A', 0.3, 'F', 8.0, -5, 37));
  expect(Ranking.rank([threeBuses, sameEnd], false, 1.3, 'NONE', 'FASTEST').map((i) => i.id)).toEqual(['same', '22-143-56']);
  // Arrive-by: the one leaving last goes first.
  expect(Ranking.rank([threeBuses, direct], true, 1.3, 'NONE', 'FASTEST')[0].id).toBe('64');
});

test('much faster transfer still wins', () => {
  const fast = itinOf('fast', bus('1', 'A', 0, 'B', 2, 0, 5), bus('2', 'B', 2, 'F', 8, 12, 20));
  expect(Ranking.rank([direct, fast], false)[0].id).toBe('fast');
});

test('drops dominated options', () => {
  // Leaves earlier, arrives later, more transfers: strictly worse than the direct bus.
  const worse = itinOf('worse', walk(0, 0.3, 0, 4, 300), bus('7', 'A', 0.3, 'B', 3, 4, 20), bus('8', 'B', 3, 'F', 8, 26, 45), walk(8, 8.2, 45, 50, 200));
  // A later departure of the direct line is a different option and must stay.
  const laterDirect = itinOf('64b', walk(0, 0.3, 12, 16, 300), bus('64', 'A', 0.3, 'F', 8, 16, 48));
  expect(Ranking.dominates(direct, worse)).toBe(true);
  expect(Ranking.dominates(direct, laterDirect)).toBe(false);
  expect(Ranking.rank([worse, direct, laterDirect], false).map((i) => i.id)).toEqual(['64', '64b']);
});

test('arrive-by prefers later departure', () => {
  const early = itinOf('early', bus('1', 'A', 0, 'F', 8, 0, 30));
  const late = itinOf('late', bus('2', 'A', 0, 'F', 8, 10, 32));
  expect(Ranking.rank([early, late], true)[0].id).toBe('late');
});

test('walk without distance uses straight line', () => {
  const t = Ranking.transfers(itinOf('x', bus('1', 'A', 0, 'B', 2, 0, 10), walk(2.0, 2.4, 10, 13, 0), bus('2', 'C', 2.4, 'D', 4, 13, 20)));
  expect(t).toHaveLength(1);
  expect(t[0].walkM > 400 && isTight(t[0])).toBe(true);
});

const train = (from: string, fromKm: number, to: string, toKm: number, start: number, end: number): Leg => ({
  ...bus('Train', from, fromKm, to, toKm, start, end),
  mode: 'TRAIN',
});

test('rail preference favors slower train', () => {
  // The train gets there 28 minutes after the direct bus.
  const rail = itinOf('rail', walk(0, 0.3, 2, 6, 300), train('A', 0.3, 'F', 8, 6, 66), walk(8, 8.2, 66, 69, 200));
  expect(Ranking.rank([rail, direct], false)[0].id).toBe('64');
  expect(Ranking.rank([rail, direct], false, 1.3, 'PREFER')[0].id).toBe('64');
  expect(Ranking.rank([rail, direct], false, 1.3, 'STRONG')[0].id).toBe('rail');
});

test("a faster bus doesn't hide the train when rail is preferred", () => {
  // Leaves later and arrives earlier: without a preference the bus dominates the train.
  const rail = itinOf('rail', walk(0, 0.3, 0, 4, 300), train('A', 0.3, 'F', 8, 4, 45), walk(8, 8.2, 45, 48, 200));
  expect(Ranking.dominates(direct, rail)).toBe(true);
  expect(Ranking.dominates(direct, rail, 1.3, 'PREFER')).toBe(false);
  expect(Ranking.rank([rail, direct], false, 1.3, 'PREFER')).toHaveLength(2);
});
