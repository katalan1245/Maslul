import { type Itinerary, isTransit, legDurationSec } from './models';
import { type Instant } from './time';

/**
 * A little leeway on the limits the user sets. Someone who'll drive you 10 minutes won't mind 12
 * if it saves you half an hour, and a 23-minute walk to a bus that leaves now beats a 20-minute
 * one to a bus an hour later. Planning allows MINUTES more than each limit; an option that uses
 * them is kept only when it's worth it.
 */
export const Grace = {
  MINUTES: 3,
  /** How much sooner an option over a limit must get there than every option within the limits. */
  GAIN_SEC: 10 * 60,

  /** Walking to the first stop or from the last one for longer than maxWalkMinutes. */
  overWalk(itin: Itinerary, maxWalkMinutes: number): boolean {
    const first = itin.legs.findIndex((l) => isTransit(l.mode));
    if (first < 0) return false;
    const last = itin.legs.length - 1 - [...itin.legs].reverse().findIndex((l) => isTransit(l.mode));
    const walk = (legs: Itinerary['legs']) => legs.filter((l) => l.mode === 'WALK').reduce((s, l) => s + legDurationSec(l), 0);
    return Math.max(walk(itin.legs.slice(0, first)), walk(itin.legs.slice(last + 1))) > maxWalkMinutes * 60;
  },

  /** A lift that drives longer than the liftMinutes the driver offered. */
  overLift: (itin: Itinerary, liftMinutes: number | null): boolean =>
    liftMinutes != null && itin.legs.some((l) => l.mode === 'CAR' && legDurationSec(l) > liftMinutes * 60),

  /**
   * Keeps the options that stretch a limit (over) only when they get there GAIN_SEC sooner
   * (arriving by a time: leave that much later) than every option within the limits, or when
   * nothing is within them.
   */
  filter(options: Itinerary[], arriveBy: boolean, over: (i: Itinerary) => boolean): Itinerary[] {
    const within = options.filter((i) => !over(i));
    if (within.length === 0 || within.length === options.length) return options;
    const latest = Math.max(...within.map((i) => i.start));
    const soonest = Math.min(...within.map((i) => i.end));
    const worth = (i: Itinerary) => (arriveBy ? i.start >= latest + Grace.GAIN_SEC : i.end <= soonest - Grace.GAIN_SEC);
    return options.filter((i) => !over(i) || worth(i));
  },
};

/**
 * Looking further afield when nothing leaves soon within the usual walk. On a Friday afternoon
 * the buses around you may have stopped while a line a 40-minute walk away still runs; without
 * this the planner only offers tomorrow's first bus.
 */
export const WiderWalk = {
  /** Longest walk to or from a stop when looking further. */
  MINUTES: 50,
  /** Nothing leaving within this long (or, arriving by a time, getting there within it) is nothing soon. */
  SOON_SEC: 2 * 3600,
  /** A longer walk is only worth offering when it gets you there at least this much sooner. */
  GAIN_SEC: 20 * 60,

  /** Whether to look further: nothing that rides transit leaves soon after asked (or arrives soon before it). */
  needed(options: Itinerary[], asked: Instant, arriveBy: boolean, maxWalkMinutes: number): boolean {
    if (maxWalkMinutes >= WiderWalk.MINUTES) return false;
    const rides = options.filter((i) => i.legs.some((l) => isTransit(l.mode)));
    return arriveBy ? !rides.some((i) => i.end >= asked - WiderWalk.SOON_SEC) : !rides.some((i) => i.start <= asked + WiderWalk.SOON_SEC);
  },

  /** The options from the wider search that get there clearly sooner (or, arriving by a time, leave clearly later) than usual. */
  better(wide: Itinerary[], usual: Itinerary[], arriveBy: boolean): Itinerary[] {
    const known = new Set(usual.map((i) => i.id));
    const fresh = wide.filter((i) => !known.has(i.id) && i.legs.some((l) => isTransit(l.mode)));
    if (usual.length === 0) return fresh;
    if (arriveBy) {
      const latest = Math.max(...usual.map((i) => i.start));
      return fresh.filter((i) => i.start >= latest + WiderWalk.GAIN_SEC);
    }
    const soonest = Math.min(...usual.map((i) => i.end));
    return fresh.filter((i) => i.end <= soonest - WiderWalk.GAIN_SEC);
  },
};
