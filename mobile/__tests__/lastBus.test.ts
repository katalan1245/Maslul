import { lastTonight, lateSearch, nightEnd } from '../src/data/lastBus';
import { makeLeg } from '../src/data/models';
import { zoned } from '../src/data/time';
import { call, itinOf } from './helpers';

// 2026-10-08 is a Thursday, 2026-10-09 a Friday.
const at = (date: string, h: number, m = 0) => zoned(date, h, m);

/** A walk, then a bus at [t]. */
const route = (id: string, t: number) => {
  const a = call('s1', 'Arlozorov', 32.08, 34.78, t, t);
  const b = call('s2', 'Dizengoff', 32.07, 34.77, t + 600, t + 600);
  return itinOf(id, makeLeg({ mode: 'WALK', from: call(null, 'Start', 32.08, 34.78), to: a, start: t - 240, end: t }), makeLeg({ mode: 'BUS', from: a, to: b, start: t, end: t + 600 }));
};
const walk = (id: string, t: number) => itinOf(id, makeLeg({ mode: 'WALK', from: call(null, 'A', 32.08, 34.78), to: call(null, 'B', 32.07, 34.77), start: t, end: t + 1800 }));

it('looks for the last bus in the evening, on Friday afternoon and after midnight', () => {
  expect(lateSearch(at('2026-10-08', 19, 59))).toBe(false);
  expect(lateSearch(at('2026-10-08', 20))).toBe(true);
  expect(lateSearch(at('2026-10-08', 12))).toBe(false);
  expect(lateSearch(at('2026-10-09', 12))).toBe(true);
  expect(lateSearch(at('2026-10-09', 11, 59))).toBe(false);
  expect(lateSearch(at('2026-10-09', 1))).toBe(true);
  expect(lateSearch(at('2026-10-09', 4))).toBe(false);
});

it("ends the night at 04:00, the next morning or this one after midnight", () => {
  expect(nightEnd(at('2026-10-08', 22))).toBe(at('2026-10-09', 4));
  expect(nightEnd(at('2026-10-09', 1))).toBe(at('2026-10-09', 4));
  // Friday afternoon: Shabbat's gap starts, so anything after Saturday 04:00 proves the last.
  expect(nightEnd(at('2026-10-09', 14))).toBe(at('2026-10-10', 4));
});

const end = at('2026-10-09', 4);
const r2300 = route('a', at('2026-10-08', 23));
const r2340 = route('b', at('2026-10-08', 23, 40));
const morning = route('c', at('2026-10-09', 5, 30));

it('finds the last route when a later one is past the night', () => {
  expect(lastTonight([r2300, r2340, morning], [], end)?.itin).toBe(r2340);
  // The proof can come from the next page.
  expect(lastTonight([r2300, r2340], [morning], end)?.ride.start).toBe(at('2026-10-08', 23, 40));
  // A walk-only route neither counts nor proves anything.
  expect(lastTonight([r2340, walk('w', at('2026-10-09', 1))], [morning], end)?.itin).toBe(r2340);
});

it("doesn't claim a last route without proof", () => {
  // Nothing seen past the night: the next page might have more.
  expect(lastTonight([r2300, r2340], [], end)).toBeNull();
  // The next page has another bus tonight.
  expect(lastTonight([r2300], [r2340, morning], end)).toBeNull();
  // Only morning routes: nothing leaves tonight.
  expect(lastTonight([morning], [], end)).toBeNull();
});

it('takes the latest bus a route lists, not only its planned one', () => {
  const merged = route('m', at('2026-10-08', 23));
  merged.legs[1] = { ...merged.legs[1], alternatives: [makeLeg({ ...merged.legs[1], start: at('2026-10-08', 23, 50), end: at('2026-10-09', 0) })] };
  const last = lastTonight([merged, r2340, morning], [], end);
  expect(last?.itin).toBe(merged);
  expect(last?.ride.start).toBe(at('2026-10-08', 23, 50));
});
