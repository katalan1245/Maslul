import { liveCall } from '../src/data/eta';
import { Freshness, arrivalFreshness, callFreshness } from '../src/data/freshness';
import type { Vehicle } from '../src/data/models';
import { Fmt } from '../src/ui/fmt';
import { instant } from './helpers';

const now = instant('2026-09-28T09:00:00Z');

const vehicle = (ageSec: number): Vehicle => ({
  lineRef: '1', journeyRef: '123', originDeparture: now - 1800, lat: 32.0, lon: 34.8, bearing: null, velocityKmh: null,
  recordedAt: now - ageSec, distanceFromStart: null, nextStopCode: null, vehicleRef: 'v1',
});

test('thresholds', () => {
  expect(Freshness.of(null, now)).toBe('SCHEDULED');
  expect(Freshness.of(now - 40, now)).toBe('LIVE');
  expect(Freshness.of(now - Freshness.LIVE_MAX_AGE_SEC, now)).toBe('LIVE');
  expect(Freshness.of(now - (Freshness.LIVE_MAX_AGE_SEC + 1), now)).toBe('STALE');
  // A clock slightly behind the feed still counts as fresh.
  expect(Freshness.of(now + 5, now)).toBe('LIVE');
});

test('live call freshness', () => {
  const live = liveCall('LIVE', now, now + 300, { vehicle: vehicle(30) });
  expect(callFreshness(live, now)).toBe('LIVE');
  expect(callFreshness({ ...live, vehicle: vehicle(240) }, now)).toBe('STALE');
  // Without a live vehicle (or once it passed the stop) it's timetable data.
  expect(callFreshness(liveCall('UNTRACKED', now, null), now)).toBe('SCHEDULED');
  expect(callFreshness({ ...live, status: 'PASSED' }, now)).toBe('SCHEDULED');
  expect(callFreshness(null, now)).toBe('SCHEDULED');
});

test('stop arrival freshness', () => {
  expect(arrivalFreshness({ time: now, live: true, delaySec: 0, journeyRef: '1', recordedAt: now - 20 }, now)).toBe('LIVE');
  expect(arrivalFreshness({ time: now, live: true, delaySec: 0, journeyRef: '1', recordedAt: now - 200 }, now)).toBe('STALE');
  expect(arrivalFreshness({ time: now, live: false, delaySec: 0, journeyRef: '1', recordedAt: null }, now)).toBe('SCHEDULED');
});

test('updated ago', () => {
  expect(Fmt.ago(now - 2, now)).toBe('Updated just now');
  expect(Fmt.ago(now - 30, now)).toBe('Updated 30s ago');
  expect(Fmt.ago(now - 150, now)).toBe('Updated 2 min ago');
  expect(Fmt.ago(now + 3, now)).toBe('Updated just now');
});
