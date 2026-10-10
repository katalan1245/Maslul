/** Upstream's GraceTest and WiderWalkTest: a little over the limits, and a longer walk when nothing leaves soon. */
import { Grace, WiderWalk } from '../src/data/grace';
import type { Itinerary, TransitMode } from '../src/data/models';
import { call, instant, makeLeg } from './helpers';

const s = call('s', 'S', 32.0, 34.8);
const at = (t0: number) => (min: number) => t0 + min * 60;

describe('Grace', () => {
  const t = at(instant('2026-10-12T05:00:00Z'));
  const leg = (mode: TransitMode, from: number, to: number) => makeLeg({ mode, from: s, to: s, start: t(from), end: t(to), routeShortName: '1' });
  /** A lift (or walk) of firstMin minutes, then a bus to arrive. */
  const itin = (id: string, first: TransitMode, firstMin: number, arrive: number, walkAfter = 0): Itinerary => ({
    id,
    start: t(0),
    end: t(arrive),
    transfers: 0,
    legs: [leg(first, 0, firstMin), leg('BUS', firstMin, arrive - walkAfter), ...(walkAfter > 0 ? [leg('WALK', arrive - walkAfter, arrive)] : [])],
  });

  it('knows what goes over a limit', () => {
    expect(Grace.overLift(itin('12', 'CAR', 12, 60), 10)).toBe(true);
    expect(Grace.overLift(itin('10', 'CAR', 10, 60), 10)).toBe(false);
    expect(Grace.overLift(itin('12', 'CAR', 12, 60), null)).toBe(false);
    expect(Grace.overWalk(itin('w', 'WALK', 22, 60), 20)).toBe(true);
    // Walking from the last stop counts too; a lift doesn't.
    expect(Grace.overWalk(itin('e', 'CAR', 5, 60, 23), 20)).toBe(true);
    expect(Grace.overWalk(itin('c', 'CAR', 25, 60), 20)).toBe(false);
  });

  it('keeps a little over only when it saves real time', () => {
    const within = itin('10-min lift', 'CAR', 10, 90);
    const muchSooner = itin('12-min lift, 30 min sooner', 'CAR', 12, 60);
    const barelySooner = itin('12-min lift, 5 min sooner', 'CAR', 12, 85);
    const kept = Grace.filter([within, muchSooner, barelySooner], false, (i) => Grace.overLift(i, 10));
    expect(kept.map((i) => i.id)).toEqual(['10-min lift', '12-min lift, 30 min sooner']);
  });

  it('with nothing within the limits, a little over is better than nothing', () => {
    const over = [itin('a', 'CAR', 12, 60), itin('b', 'CAR', 13, 80)];
    expect(Grace.filter(over, false, (i) => Grace.overLift(i, 10))).toEqual(over);
  });

  it('arriving by a time keeps what leaves clearly later', () => {
    const of = (id: string, start: number, walkEnd: number): Itinerary => ({
      id, start: t(start), end: t(60), transfers: 0, legs: [leg('WALK', start, walkEnd), leg('BUS', walkEnd, 60)],
    });
    const kept = Grace.filter([of('within', 0, 15), of('later', 20, 42), of('bit', 5, 27)], true, (i) => Grace.overWalk(i, 20));
    expect(kept.map((i) => i.id)).toEqual(['within', 'later']);
  });
});

describe('WiderWalk', () => {
  // Friday 16:00 in Israel.
  const asked = instant('2026-10-09T13:00:00Z');
  const t = at(asked);
  const itin = (id: string, leave: number, arrive: number, mode: TransitMode = 'BUS'): Itinerary => ({
    id, start: t(leave), end: t(arrive), transfers: 0, legs: [makeLeg({ mode, from: s, to: s, start: t(leave), end: t(arrive), routeShortName: '66' })],
  });

  it('looks further only when nothing leaves soon', () => {
    // Tomorrow evening's bus, after Shabbat: nothing soon.
    expect(WiderWalk.needed([itin('sat', 26 * 60, 27 * 60)], asked, false, 20)).toBe(true);
    expect(WiderWalk.needed([], asked, false, 20)).toBe(true);
    // A bus in an hour and a half is soon enough.
    expect(WiderWalk.needed([itin('soon', 90, 130)], asked, false, 20)).toBe(false);
    // A walk the planner already allows that far needs no second look.
    expect(WiderWalk.needed([], asked, false, WiderWalk.MINUTES)).toBe(false);
    // A drive (a lift) isn't a bus to catch.
    expect(WiderWalk.needed([itin('car', 5, 30, 'CAR')], asked, false, 20)).toBe(true);
  });

  it('arriving by a time looks at arrivals', () => {
    const by = t(6 * 60);
    expect(WiderWalk.needed([itin('early', -60, 0)], by, true, 20)).toBe(true);
    expect(WiderWalk.needed([itin('ok', 4 * 60 + 30, 5 * 60 + 10)], by, true, 20)).toBe(false);
  });

  it('keeps only what gets there clearly sooner', () => {
    const usual = [itin('sat', 26 * 60, 27 * 60)];
    const wide = [itin('kiryat-ono', 40, 95), itin('sat', 26 * 60, 27 * 60), itin('sat-walk', 25 * 60 + 50, 26 * 60 + 50)];
    expect(WiderWalk.better(wide, usual, false).map((i) => i.id)).toEqual(['kiryat-ono']);
    // With nothing usual, anything that rides transit helps.
    expect(WiderWalk.better(wide, [], false).map((i) => i.id)).toEqual(['kiryat-ono', 'sat', 'sat-walk']);
  });

  it('arriving by a time keeps what leaves clearly later', () => {
    const wide = [itin('later', 3 * 60, 4 * 60), itin('bit-later', -50, 10)];
    expect(WiderWalk.better(wide, [itin('early', -60, 0)], true).map((i) => i.id)).toEqual(['later']);
  });
});
