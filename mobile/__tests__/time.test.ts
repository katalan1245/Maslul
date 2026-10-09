import { dayOfWeek, isoUtc, israelOffset, localDate, localParts, parseInstant, plusDays, startOfDay, zoned } from '../src/data/time';
import { fixed } from '../src/data/util';
import { Fmt } from '../src/ui/fmt';

/** The offset the tz database gives, from Node's ICU. */
function icuOffset(t: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(t * 1000));
  const n = (k: string) => Number(parts.find((p) => p.type === k)!.value);
  return (Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) / 1000) - t;
}

test('Israel offset matches the tz database every hour, 2014–2035', () => {
  for (let t = Date.UTC(2014, 0, 1) / 1000; t < Date.UTC(2036, 0, 1) / 1000; t += 3600) {
    if (israelOffset(t) !== icuOffset(t)) throw new Error(`mismatch at ${isoUtc(t)}: ${israelOffset(t)} vs ${icuOffset(t)}`);
  }
});

test('local dates and midnights', () => {
  // 2026-03-27 is the Friday DST starts; 2026-10-25 the Sunday it ends.
  expect(isoUtc(startOfDay('2026-03-27'))).toBe('2026-03-26T22:00:00Z');
  expect(isoUtc(startOfDay('2026-03-28'))).toBe('2026-03-27T21:00:00Z');
  expect(isoUtc(startOfDay('2026-10-25'))).toBe('2026-10-24T21:00:00Z');
  expect(isoUtc(startOfDay('2026-10-26'))).toBe('2026-10-25T22:00:00Z');
  expect(isoUtc(zoned('2026-10-09', 7, 30))).toBe('2026-10-09T04:30:00Z');
  expect(localDate(parseInstant('2026-10-08T21:30:00Z')!)).toBe('2026-10-09');
  expect(localParts(parseInstant('2026-10-08T21:30:00Z')!).hour).toBe(0);
  expect(plusDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(dayOfWeek('2026-10-09')).toBe(5);
  expect(dayOfWeek('2026-10-11')).toBe(7);
});

test('parses only real instants', () => {
  expect(parseInstant('2026-09-28T04:04:10+00:00')).toBe(Date.UTC(2026, 8, 28, 4, 4, 10) / 1000);
  expect(parseInstant('2026-09-27T21:41:24+03:00')).toBe(Date.UTC(2026, 8, 27, 18, 41, 24) / 1000);
  expect(parseInstant('2026-09-27T21:41:24.512Z')).toBe(Date.UTC(2026, 8, 27, 21, 41, 24) / 1000);
  expect(parseInstant('2026-09-27')).toBeNull();
  expect(parseInstant('soon')).toBeNull();
  expect(parseInstant(null)).toBeNull();
});

test("formats numbers the way Java's %.Nf does", () => {
  expect(fixed(32.08, 4)).toBe('32.0800');
  expect(fixed(1.00005, 4)).toBe('1.0001');
  expect(fixed(34.78125, 4)).toBe('34.7813');
  expect(fixed(-0.00001, 4)).toBe('0.0000');
  expect(fixed(1.25, 1)).toBe('1.3');
  expect(Fmt.distance(1250)).toBe('1.3 km');
  expect(Fmt.distance(987)).toBe('980 m');
});

test('formats durations and days', () => {
  expect(Fmt.duration(29)).toBe('1 min');
  expect(Fmt.duration(45 * 60)).toBe('45 min');
  expect(Fmt.duration(60 * 60)).toBe('1 h');
  expect(Fmt.duration(65 * 60)).toBe('1 h 05 min');
  expect(Fmt.day('2026-10-09', '2026-10-09')).toBe('Today');
  expect(Fmt.day('2026-10-10', '2026-10-09')).toBe('Tomorrow');
  expect(Fmt.day('2026-10-12', '2026-10-09')).toBe('Mon, 12 Oct');
  expect(Fmt.time(parseInstant('2026-10-09T04:05:00Z')!)).toBe('07:05');
});
