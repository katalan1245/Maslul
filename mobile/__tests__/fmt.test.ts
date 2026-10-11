import { zoned } from '../src/data/time';
import { Fmt, rideName } from '../src/ui/fmt';
import type { Leg } from '../src/data/models';
import { instant } from './helpers';

// Friday 9 Oct 2026, 22:07 Israel time (UTC+3), after the last bus before Shabbat.
const now = instant('2026-10-09T19:07:00Z');

test('when: a time today has no day, another day gets one', () => {
  expect(Fmt.when(instant('2026-10-09T19:30:00Z'), now)).toBe('22:30');
  expect(Fmt.when(instant('2026-10-10T15:15:00Z'), now)).toBe('Sat 18:15');
  // 00:30 Israel time is already Saturday, though it's still Friday in UTC.
  expect(Fmt.when(instant('2026-10-09T21:30:00Z'), now)).toBe('Sat 00:30');
});

test('relative: minutes within the hour, then a time with its day', () => {
  expect(Fmt.relative(now + 20, now)).toBe('Now');
  expect(Fmt.relative(now + 4 * 60, now)).toBe('4 min');
  expect(Fmt.relative(instant('2026-10-09T20:30:00Z'), now)).toBe('23:30');
  expect(Fmt.relative(instant('2026-10-10T15:15:00Z'), now)).toBe('Sat 18:15');
});

test('rideName: the line number after the mode, or just the mode when there is none', () => {
  expect(rideName({ mode: 'BUS', routeShortName: '61' } as Leg)).toBe('Bus 61');
  expect(rideName({ mode: 'TRAIN', routeShortName: null } as Leg)).toBe('Train');
  expect(rideName({ mode: 'TRAIN', routeShortName: 'Train' } as Leg)).toBe('Train');
  expect(rideName({ mode: 'BUS', routeShortName: 'Test Shuttle', shuttleId: 's1' } as Leg)).toBe('Test Shuttle');
});

it("a board row's later times show each minute once (F15)", () => {
  const { laterTimes } = require('../src/ui/screens/Stop') as typeof import('../src/ui/screens/Stop');
  const at = (h: number, m: number) => ({ departure: { scheduled: zoned('2026-10-08', h, m) }, live: null }) as never;
  expect(laterTimes([at(8, 1), at(8, 11), at(8, 11), at(8, 20)])).toBe('08:11  08:20');
  expect(laterTimes([at(8, 1), at(8, 1), at(8, 11)])).toBe('08:11');
});
