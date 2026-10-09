import { type Place, placePoint } from '../src/data/models';
import { ShuttleSchedule } from '../src/data/shuttles';
import { zoned } from '../src/data/time';
import { type Shuttle, WORK_WEEK } from '../src/data/userStore';

const place = (name: string, km: number, eastKm = 0): Place => ({ name, lat: 32.0 + km / 111.195, lon: 34.8 + eastKm / 94.3, kind: 'POI' });
/** "2026-10-08T18:00" in Israel time. */
const local = (s: string) => zoned(s.slice(0, 10), Number(s.slice(11, 13)), Number(s.slice(14, 16)));

const office = place('Office', 0);
const station = place('Station', 6);
const shuttle: Shuttle = { id: 's1', name: 'Office shuttle', from: office, to: station, times: [7 * 60 + 30, 8 * 60, 17 * 60 + 15], rideMinutes: 15, days: WORK_WEEK };

test('parses times leniently', () => {
  expect(ShuttleSchedule.parseTimes('8:15, 07:30 17.00')).toEqual([450, 495, 1020]);
  expect(ShuttleSchedule.parseTimes('07:30, 07:30')).toEqual([450]);
  expect(ShuttleSchedule.parseTimes('07:30, soon')).toBeNull();
  expect(ShuttleSchedule.parseTimes('24:00')).toBeNull();
  expect(ShuttleSchedule.parseTimes('  ')).toBeNull();
  expect(ShuttleSchedule.formatTimes([450, 1020])).toBe('07:30, 17:00');
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

const missing = (o: Partial<{ name: string; from: Place | null; to: Place | null; times: string; rideMinutes: number | null; days: number[] }> = {}) =>
  ShuttleSchedule.missing(
    o.name ?? 'Office shuttle',
    o.from === undefined ? office : o.from,
    o.to === undefined ? station : o.to,
    o.times ?? '07:30, 17:00',
    o.rideMinutes === undefined ? 15 : o.rideMinutes,
    o.days ?? WORK_WEEK,
  );

test('a complete shuttle needs nothing', () => {
  expect(missing()).toEqual([]);
  expect(ShuttleSchedule.missingText(missing())).toBeNull();
  // One departure and one day are enough; so are the shortest and longest rides.
  expect(missing({ times: '7:05', days: [5], rideMinutes: 5 })).toEqual([]);
  expect(missing({ rideMinutes: 120 })).toEqual([]);
});

test('an unset ride time is called out', () => {
  expect(missing({ rideMinutes: null })).toEqual(['how long the ride takes']);
  expect(ShuttleSchedule.missingText(missing({ rideMinutes: null }))).toBe('Still needed: how long the ride takes.');
});

test('everything missing is listed in form order', () => {
  const all = missing({ name: '  ', from: null, to: null, times: '', rideMinutes: null, days: [] });
  expect(all).toEqual(['a name', 'where it leaves from', 'where it goes', 'departure times', 'how long the ride takes', 'a day it runs']);
  expect(ShuttleSchedule.missingText(all)).toBe(
    'Still needed: a name, where it leaves from, where it goes, departure times, how long the ride takes and a day it runs.',
  );
  expect(ShuttleSchedule.missingText(missing({ name: '', rideMinutes: null }))).toBe('Still needed: a name and how long the ride takes.');
});

test('bad times and the same stop twice are missing', () => {
  expect(missing({ times: '07:30, soon' })).toEqual(['departure times like 07:30']);
  expect(missing({ times: '25:00' })).toEqual(['departure times like 07:30']);
  expect(missing({ times: ' , ' })).toEqual(['departure times']);
  // Both ends at the same stop (within a few dozen metres) isn't a shuttle.
  expect(missing({ to: place('Office gate', 0.05) })).toEqual(['two different stops']);
  expect(missing({ to: place('Down the road', 0.3) })).toEqual([]);
});
