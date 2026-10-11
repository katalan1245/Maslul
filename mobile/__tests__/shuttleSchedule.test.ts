import { type Place, placePoint } from '../src/data/models';
import { ShuttleSchedule } from '../src/data/shuttles';
import { zoned } from '../src/data/time';
import { TransitRepository } from '../src/data/transitRepository';
import { type Shuttle, WORK_WEEK } from '../src/data/userStore';

const place = (name: string, km: number, eastKm = 0): Place => ({ name, lat: 32.0 + km / 111.195, lon: 34.8 + eastKm / 94.3, kind: 'POI' });
/** "2026-10-08T18:00" in Israel time. */
const local = (s: string) => zoned(s.slice(0, 10), Number(s.slice(11, 13)), Number(s.slice(14, 16)));

const office = place('Office', 0);
const station = place('Station', 6);
const shuttle: Shuttle = { id: 's1', name: 'Office shuttle', from: office, to: station, times: [7 * 60 + 30, 8 * 60, 17 * 60 + 15], rideMinutes: 15, days: WORK_WEEK };

test('adds times once each, in order, and repeats up to the end time (#3)', () => {
  expect(ShuttleSchedule.withTimes([1020, 450], [495, 450])).toEqual([450, 495, 1020]);
  // 07:00 to 08:00 every 30: the end time is a departure too.
  expect(ShuttleSchedule.repeating(420, 480, 30)).toEqual([420, 450, 480]);
  expect(ShuttleSchedule.repeating(420, 470, 30)).toEqual([420, 450]);
  expect(ShuttleSchedule.repeating(480, 420, 30)).toEqual([]);
});

test('lists three or more evenly spaced times as one run (#3)', () => {
  const run = ShuttleSchedule.repeating(7 * 60, 19 * 60, 30);
  const groups = ShuttleSchedule.groupTimes(ShuttleSchedule.withTimes(run, [5 * 60 + 45, 21 * 60]));
  expect(groups.map(ShuttleSchedule.formatGroup)).toEqual(['05:45', 'Every 30 min, 07:00–19:00', '21:00']);
  // Two at the same gap aren't a run.
  expect(ShuttleSchedule.groupTimes([450, 480, 600]).map((g) => g.every)).toEqual([null, null, null]);
  expect(ShuttleSchedule.groupTimes([]).length).toBe(0);
});

test('departures follow the days it runs', () => {
  // Thursday 2026-10-08 evening: the next ones are Sunday morning (no shuttle on Friday or Saturday).
  expect(ShuttleSchedule.departures(shuttle, local('2026-10-08T18:00'), local('2026-10-11T23:00'))).toEqual([
    local('2026-10-11T07:30'), local('2026-10-11T08:00'), local('2026-10-11T17:15'),
  ]);
  expect(ShuttleSchedule.departures(shuttle, local('2026-10-05T07:45'), local('2026-10-05T12:00'))).toEqual([local('2026-10-05T08:00')]);
});

test("a ride has its shuttle's times and no live trip", () => {
  const leg = ShuttleSchedule.leg(shuttle, local('2026-10-05T08:00'));
  expect(leg.end).toBe(local('2026-10-05T08:15'));
  expect(leg.routeShortName).toBe('Office shuttle');
  expect(leg.shuttleId).toBe('s1');
  expect(leg.tripId).toBeNull();
  expect(ShuttleSchedule.ridesAfterOne(shuttle, leg, 1).map((l) => l.start)).toEqual([local('2026-10-05T17:15')]);
});

test('only shuttles that help are tried', () => {
  const home = place('Home', 30);
  // Office → station → home: the shuttle takes you most of the way's start, toward home.
  expect(ShuttleSchedule.relevant([shuttle], placePoint(office), placePoint(home))).toEqual([shuttle]);
  // The other way round it only takes you further away.
  expect(ShuttleSchedule.relevant([shuttle], placePoint(home), placePoint(office))).toEqual([]);
  // A short hop next door doesn't need one.
  expect(ShuttleSchedule.relevant([shuttle], placePoint(office), { lat: office.lat + 0.001, lon: office.lon })).toEqual([]);
  // From somewhere else across town toward the station area it's still worth checking.
  expect(ShuttleSchedule.relevant([shuttle], placePoint(place('Elsewhere', 0.5, 1)), placePoint(place('Beyond', 9)))).toEqual([shuttle]);
});

test('days read like a week', () => {
  expect(ShuttleSchedule.formatDays(WORK_WEEK)).toBe('Sun–Thu');
  expect(ShuttleSchedule.formatDays([1, 2, 3, 4, 5, 6, 7])).toBe('Every day');
  expect(ShuttleSchedule.formatDays([5, 7])).toBe('Sun, Fri');
  expect(ShuttleSchedule.formatDays([7, 1, 2, 3, 4, 5])).toBe('Sun–Fri');
  expect(ShuttleSchedule.formatDays([7, 1, 3, 4, 5, 6])).toBe('Sun, Mon, Wed–Sat');
});

test('a shuttle from the station is tried for the way back', () => {
  // Home → train to the station → shuttle to the office, though the station is a bit farther from home.
  const back = { ...shuttle, id: 'b', from: station, to: office };
  expect(ShuttleSchedule.relevant([back], placePoint(place('Home', -60)), placePoint(office))).toEqual([back]);
});

test("a shuttle that loops back isn't tried", () => {
  // From the station, riding the office shuttle would only bring you back to the station.
  expect(ShuttleSchedule.relevant([shuttle], placePoint(station), placePoint(place('Far', -50, 20)))).toEqual([]);
});

const missing = (o: Partial<{ name: string; from: Place | null; to: Place | null; times: number[]; rideMinutes: number | null; days: number[] }> = {}) =>
  ShuttleSchedule.missing(
    o.name ?? 'Office shuttle',
    o.from === undefined ? office : o.from,
    o.to === undefined ? station : o.to,
    o.times ?? [450, 1020],
    o.rideMinutes === undefined ? 15 : o.rideMinutes,
    o.days ?? WORK_WEEK,
  );

test('a complete shuttle needs nothing', () => {
  expect(missing()).toEqual([]);
  expect(ShuttleSchedule.missingText(missing())).toBeNull();
  // One departure and one day are enough; so are the shortest and longest rides.
  expect(missing({ times: [425], days: [5], rideMinutes: 5 })).toEqual([]);
  expect(missing({ rideMinutes: 120 })).toEqual([]);
});

test('an unset ride time is called out', () => {
  expect(missing({ rideMinutes: null })).toEqual(['how long the ride takes']);
  expect(ShuttleSchedule.missingText(missing({ rideMinutes: null }))).toBe('Still needed: how long the ride takes.');
});

test('everything missing is listed in form order', () => {
  const all = missing({ name: '  ', from: null, to: null, times: [], rideMinutes: null, days: [] });
  expect(all).toEqual(['a name', 'where it leaves from', 'where it goes', 'departure times', 'how long the ride takes', 'a day it runs']);
  expect(ShuttleSchedule.missingText(all)).toBe(
    'Still needed: a name, where it leaves from, where it goes, departure times, how long the ride takes and a day it runs.',
  );
  expect(ShuttleSchedule.missingText(missing({ name: '', rideMinutes: null }))).toBe('Still needed: a name and how long the ride takes.');
});

test('no times and the same stop twice are missing', () => {
  expect(missing({ times: [] })).toEqual(['departure times']);
  // Both ends at the same stop (within a few dozen metres) isn't a shuttle.
  expect(missing({ to: place('Office gate', 0.05) })).toEqual(['two different stops']);
  expect(missing({ to: place('Down the road', 0.3) })).toEqual([]);
});

test('a shuttle all the way offers its first departure, not a later one (R2)', async () => {
  const repo = new TransitRepository(null as never);
  const night: Shuttle = { ...shuttle, times: [4 * 60 + 14, 7 * 60 + 30], days: [1, 2, 3, 4, 5, 6, 7] };
  const at = local('2026-10-05T03:33');
  const [itin, ...rest] = await repo.shuttleOptions({ from: placePoint(office), to: placePoint(station), time: at } as never, [night], at);
  expect(rest).toEqual([]);
  expect(itin.start).toBe(local('2026-10-05T04:14'));
});
