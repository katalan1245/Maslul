import { type Instant } from '../../data/time';
import { type Itinerary, type Leg, isTransit, legDurationSec, legOptions } from '../../data/models';

/** One plain instruction of a Simple Maslul trip. */
export type SimpleStep =
  /** A walk to the stop of the next ride. */
  | { kind: 'walkToStop'; stop: string; minutes: number }
  /** The walk at the end, to the destination. */
  | { kind: 'walkToEnd'; minutes: number }
  /** A ride: line is blank when the line has no number (most trains); others ride the same stretch just as well. */
  | { kind: 'ride'; leg: Leg; line: string; others: string[]; departs: Instant; platform: string | null; stops: number; getOff: string }
  | { kind: 'arrive'; at: Instant };

/** The line's number as riders know it, or blank (a train). */
export const simpleLine = (l: Leg): string => {
  const s = l.routeShortName?.trim();
  return s && s !== 'NaN' ? s : '';
};

/** Walks this short (say, crossing to the platform) aren't worth a step. */
const TRIVIAL_WALK_SEC = 60;

/** Minutes for a step, never shown as 0. */
export const simpleMinutes = (sec: number) => Math.max(1, Math.floor((sec + 30) / 60));

/** itin as plain steps: walk here, take this, get off there, you're there. */
export function simpleSteps(itin: Itinerary): SimpleStep[] {
  const steps: SimpleStep[] = [];
  itin.legs.forEach((leg, i) => {
    if (isTransit(leg.mode)) {
      const line = simpleLine(leg);
      const others = legOptions(leg).map(simpleLine).filter((o) => o !== '' && o !== line);
      steps.push({
        kind: 'ride',
        leg,
        line,
        others: [...new Set(others)].slice(0, 3),
        departs: leg.start,
        platform: leg.from.track ?? null,
        stops: leg.intermediateStops.length + 1,
        getOff: leg.to.name,
      });
    } else if (leg.mode === 'WALK' && legDurationSec(leg) >= TRIVIAL_WALK_SEC) {
      const next = itin.legs.slice(i + 1).find((l) => isTransit(l.mode));
      const minutes = simpleMinutes(legDurationSec(leg));
      steps.push(next ? { kind: 'walkToStop', stop: next.from.name, minutes } : { kind: 'walkToEnd', minutes });
    }
  });
  steps.push({ kind: 'arrive', at: itin.end });
  return steps;
}
