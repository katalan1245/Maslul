import type { Instant } from './time';
import type { LiveCall, Progress } from './eta';
import type { StopArrival } from './transitRepository';
import { MAX_AGE_SEC } from './liveRepository';

/**
 * How much to trust an arrival time, shown Moovit-style:
 * LIVE green with an animated signal, STALE amber, SCHEDULED plain timetable.
 *
 * The MOT SIRI feed publishes one national snapshot a minute, ~30 s after the minute, and
 * vehicles report every ~30–60 s, so a healthy position is usually 30–100 s old by the time
 * it's on screen. Anything past LIVE_MAX_AGE_SEC means the vehicle stopped reporting.
 */
export type Freshness = 'LIVE' | 'STALE' | 'SCHEDULED';

export const Freshness = {
  /** A position at most this old counts as live. */
  LIVE_MAX_AGE_SEC: 150,
  /** Positions older than this are dropped from the feed entirely (see LiveRepository). */
  MAX_AGE_SEC,

  ageSec: (recordedAt: Instant, now: Instant) => Math.max(now - recordedAt, 0),

  isStale: (recordedAt: Instant, now: Instant) => Freshness.ageSec(recordedAt, now) > Freshness.LIVE_MAX_AGE_SEC,

  /** Freshness of a live position recorded at [recordedAt]; SCHEDULED if there is none. */
  of(recordedAt: Instant | null | undefined, now: Instant): Freshness {
    if (recordedAt == null) return 'SCHEDULED';
    return Freshness.isStale(recordedAt, now) ? 'STALE' : 'LIVE';
  },
};

/** When the matched vehicle last reported, if this call is tracked live. */
export const callRecordedAt = (c: LiveCall): Instant | null => (c.status === 'LIVE' ? (c.vehicle?.recordedAt ?? null) : null);

export const callFreshness = (c: LiveCall | null | undefined, now: Instant): Freshness =>
  Freshness.of(c ? callRecordedAt(c) : null, now);

export const progressFreshness = (p: Progress, now: Instant): Freshness => Freshness.of(p.vehicle.recordedAt, now);

export const arrivalFreshness = (a: StopArrival, now: Instant): Freshness => Freshness.of(a.live ? a.recordedAt : null, now);
