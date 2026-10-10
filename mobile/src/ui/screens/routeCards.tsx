import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Combine } from '../../data/combine';
import { type LiveCall, bestTime } from '../../data/eta';
import { type Freshness, callFreshness } from '../../data/freshness';
import {
  type Itinerary,
  type Leg,
  type TransitMode,
  firstTransit,
  isTransit,
  itinDurationSec,
  legDurationSec,
  lineLabel,
  platformLabel,
  rideKey,
  transitLegs,
  kindOf,
  vehicleKind,
  walkMeters,
  walkSec,
} from '../../data/models';
import type { Transfer } from '../../data/ranking';
import { isWalking } from '../../data/ranking';
import { RidePlanner, type RideOffer } from '../../data/rides';
import { type Instant, type LocalDate, localDate, today } from '../../data/time';
import { S } from '../../i18n';
import { Fmt, modeName } from '../fmt';
import { LineBadge, Pill, Txt } from '../components/common';
import { Icon, type IconName, modeIcon } from '../components/icons';
import { LiveSignal, freshnessColor } from '../components/live';
import { lineColorOf, numeric, type, useTheme } from '../theme';
import type { TimeMode } from './routesModel';

export const lineColor = (l: Leg) => lineColorOf(l.mode, l.routeColor, l.agencyId, l.agencyName);

/** Departures listed per ride before the rest fold into "N more". */
export const SHOWN_RIDES = 3;

/** "Bus 480", or just "Train" for a ride whose line is named after its mode. */
export function rideName(l: Leg): string {
  const m = modeName(l.mode);
  return lineLabel(l).toLowerCase() === m.toLowerCase() ? m : `${m} ${lineLabel(l)}`;
}

export function rideLabel(r: RideOffer | null): string {
  if (r == null) return S.cards.ride;
  return r.kind === 'toPlace' ? S.cards.rideTo(r.dest.name) : S.cards.rideMinutes(r.minutes);
}

export function timeLabel(mode: TimeMode, t: Instant | null): string {
  if (mode === 'NOW' || t == null) return S.cards.leaveNow;
  const d: LocalDate = localDate(t);
  const day = d === today() ? '' : ` · ${Fmt.day(d)}`;
  return (mode === 'DEPART' ? S.cards.depart(Fmt.time(t)) : S.cards.arriveBy(Fmt.time(t))) + day;
}

const transfersText = (n: number) => (n === 0 ? S.cards.direct : S.cards.transfers(n));

export function ItineraryCard({
  itin,
  live,
  now,
  tags,
  risk,
  missed,
  rideLive,
  onLiveClick,
  onBoardTripId,
  onPress,
  testID,
}: {
  itin: Itinerary;
  live: LiveCall | null | undefined;
  now: Instant;
  tags: string[];
  risk?: Transfer | null;
  /** The ride after [risk]'s, if that connection is missed. */
  missed?: Leg | null;
  rideLive: ReadonlyMap<string, LiveCall>;
  /** Tapping the live arrival line shows the vehicle on a map. */
  onLiveClick?: () => void;
  /** The trip the user is on, when planning from it: its ride reads "stay on". */
  onBoardTripId?: string | null;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const first = firstTransit(itin);
  const liveOf = (o: Leg) => (first != null && rideKey(o) === rideKey(first) ? live : rideLive.get(rideKey(o)));
  // Times follow the live vehicles: "leave in" the first one, arrival with the last one, so a late
  // bus in the plan doesn't leave the times on its timetable slot.
  const expected = Combine.expected(itin, liveOf);
  const leaveAt = expected.start;
  const endAt = expected.end;
  // The planned bus is live and close: you'd only make it by hurrying, so say so instead of "Missed".
  const hurry = first != null && Combine.onlyByHurrying(itin, itin.legs.indexOf(first), first, now, live);
  // Already on board there's nothing to leave for; nor once a driver's set off (they leave when you're in).
  const liftLeft = itin.legs[0]?.fixed === true && leaveAt < now - 120;
  // Buses that can still be caught on each ride (other lines, the next ones, a late earlier one),
  // including a live one that's close enough to run for.
  const choices = new Map<string, Leg[]>();
  itin.legs.forEach((l, i) => {
    if (!isTransit(l.mode)) return;
    const c = Combine.catchableOptions(itin, i, now, true, liveOf);
    choices.set(rideKey(l), c.length ? c : [l]);
  });
  const lineCount = (l: Leg) => new Set((choices.get(rideKey(l)) ?? []).map(Combine.lineKey)).size;
  const shown = itin.legs.filter((l) => isTransit(l.mode) || legDurationSec(l) >= 60);
  const car = itin.legs.find((l) => l.mode === 'CAR');
  const onBoard = onBoardTripId != null;
  const stayOn = first?.tripId != null && first.tripId === onBoardTripId;
  // The first ride lists its next buses when there's a choice; later rides only when several lines go.
  const strips = transitLegs(itin).filter((l) => (l === first ? !onBoard && (choices.get(rideKey(l))?.length ?? 0) > 1 : lineCount(l) > 1));

  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: t.c.surface }]} accessibilityRole="button" testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          {tags.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              {tags.map((tag) => (
                <Pill key={tag} text={tag} color={t.c.primary} />
              ))}
            </View>
          )}
          <Txt v="titleLarge" num>
            {S.fmt.span(Fmt.when(leaveAt, now), Fmt.time(endAt))}
          </Txt>
          <Txt v="bodySmall" color={t.x.subtle}>
            {[Fmt.duration(endAt - leaveAt), transfersText(itin.transfers), walkSec(itin) >= 60 ? S.cards.walkTotal(Fmt.duration(walkSec(itin))) : null]
              .filter((x) => x != null)
              .join(' · ')}
          </Txt>
        </View>
        {!onBoard && !liftLeft && <LeaveIn leaveAt={leaveAt} now={now} freshness={callFreshness(live, now)} hurry={hurry} mode={first?.mode ?? 'BUS'} />}
      </View>
      <View style={styles.legsRow}>
        {shown.map((leg, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center' }}>
            {!isTransit(leg.mode) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Icon name={modeIcon(leg.mode)} size={18} color={t.x.subtle} />
                <Txt v="labelMedium" color={t.x.subtle}>
                  {Math.trunc((legDurationSec(leg) + 30) / 60)}
                </Txt>
              </View>
            ) : lineCount(leg) > 1 ? (
              <CombinedBadges rides={choices.get(rideKey(leg)) ?? []} />
            ) : (
              <LineBadge label={lineLabel(leg)} mode={leg.mode} color={lineColor(leg)} />
            )}
            {i < shown.length - 1 && <Icon name="chevron-right" size={16} color={t.x.subtle} />}
          </View>
        ))}
      </View>
      {/* Where a lift drops you off: the answer this option is about. */}
      {car && (
        <HintLine
          icon="directions-car"
          title={
            first == null && RidePlanner.dropOffName(itin) == null
              ? S.cards.rideAllTheWay(Fmt.duration(legDurationSec(car)))
              : RidePlanner.dropOffName(itin) != null
                ? S.cards.dropOffNear(RidePlanner.dropOffName(itin)!)
                : S.cards.dropOffOnTheWay
          }
          detail={S.cards.byCar(Fmt.time(car.end), Fmt.duration(legDurationSec(car)))}
        />
      )}
      {onBoard && first != null &&
        (stayOn ? (
          <HintLine
            icon={modeIcon(first.mode)}
            title={S.cards.stayOnUntil(first.to.name)}
            detail={
              S.cards.getOffAt(Fmt.time(Combine.arrives(first, live))) +
              (transitLegs(itin)[1] ? ` · ${S.cards.then(rideName(transitLegs(itin)[1]))}` : platformLabel(first.to) ? ` · ${platformLabel(first.to)}` : '')
            }
          />
        ) : (
          // Where the next ride boards (it may be a stop next to the one you get off at), at its expected time.
          <HintLine
            icon="place"
            title={S.cards.getOffNext}
            detail={S.cards.thenFrom(rideName(first), first.from.name, Fmt.time(expected.legs[itin.legs.indexOf(first)]?.start ?? first.start))}
          />
        ))}
      {first != null && !strips.includes(first) && !onBoard && (
        <View style={{ marginTop: 12 }}>
          <LiveLine
            label={lineLabel(first)}
            mode={first.mode}
            stop={[first.from.name, platformLabel(first.from)].filter((x) => x != null).join(' · ')}
            live={live}
            scheduled={first.start}
            now={now}
            onPress={onLiveClick}
          />
        </View>
      )}
      {strips.map((leg) => {
        const i = itin.legs.indexOf(leg);
        return (
          <View key={rideKey(leg)} style={{ marginTop: leg === first ? 12 : 8 }}>
            <RideOptions
              leg={leg}
              rides={choices.get(rideKey(leg)) ?? []}
              now={now}
              relative={leg === first}
              liveOf={liveOf}
              hurry={(o) => Combine.onlyByHurrying(itin, i, o, now, liveOf(o), liveOf)}
            />
          </View>
        );
      })}
      {risk != null && (
        <View style={{ marginTop: 8 }}>
          <TransferWarning t={risk} missed={missed} />
        </View>
      )}
      {itin.legs.some((l) => l.alerts.length > 0) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
          <Icon name="warning-amber" size={16} color="#F5A524" />
          <Txt v="bodySmall" color={t.x.subtle} style={{ marginLeft: 6 }}>
            {S.cards.serviceAlert}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

/** A boxed one-liner on a route card: "Get dropped off near X · 07:42". */
function HintLine({ icon, title, detail }: { icon: IconName; title: string; detail: string | null }) {
  const t = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: t.c.surfaceVariant, marginTop: 12 }]}>
      <Icon name={icon} size={18} color={t.c.primary} />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Txt v="bodyMedium" style={{ fontWeight: '500' }} numberOfLines={1}>
          {title}
        </Txt>
        {detail != null && (
          <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>
            {detail}
          </Txt>
        )}
      </View>
    </View>
  );
}

/** "16 / 92 / 5 +2": the first few lines that make a combined ride, soonest first. */
export function CombinedBadges({ rides }: { rides: Leg[] }) {
  const t = useTheme();
  const lines = rides.filter((r, i) => rides.findIndex((x) => lineLabel(x) === lineLabel(r)) === i);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {lines.slice(0, SHOWN_RIDES).map((o, i) => (
        <View key={lineLabel(o)} style={{ flexDirection: 'row', alignItems: 'center' }}>
          {i > 0 && (
            <Txt v="labelMedium" color={t.x.subtle}>
              {' / '}
            </Txt>
          )}
          <LineBadge label={lineLabel(o)} mode={o.mode} color={lineColor(o)} showIcon={i === 0} />
        </View>
      ))}
      {lines.length > SHOWN_RIDES && (
        <Txt v="labelLarge" color={t.x.subtle}>
          {` +${lines.length - SHOWN_RIDES}`}
        </Txt>
      )}
    </View>
  );
}

/**
 * Compact next departures of every line in a combined ride:
 * "From Stop · [16] 4 min  [92] 7 min  [5] 12 min", live ones marked, and those you'd only
 * catch by hurrying marked "Hurry".
 */
export function RideOptions({
  leg,
  rides,
  now,
  relative,
  liveOf,
  hurry = () => false,
}: {
  leg: Leg;
  rides: Leg[];
  now: Instant;
  relative: boolean;
  liveOf: (l: Leg) => LiveCall | null | undefined;
  hurry?: (l: Leg) => boolean;
}) {
  const t = useTheme();
  const perLine = new Map<string, number>();
  const all = rides
    .map((o) => [o, liveOf(o)] as const)
    .sort((a, b) => Combine.boards(a[0], a[1]) - Combine.boards(b[0], b[1]))
    .filter(([o]) => {
      const n = (perLine.get(Combine.lineKey(o)) ?? 0) + 1;
      perLine.set(Combine.lineKey(o), n);
      return n <= 2;
    });
  const lines = new Set(all.map(([o]) => Combine.lineKey(o))).size;
  const [expanded, setExpanded] = useState(false);
  const options = expanded ? all : all.slice(0, SHOWN_RIDES);
  const more = all.length - SHOWN_RIDES;
  // The user's own shuttle reads as one, not as a bus.
  const what = lines > 1 ? S.cards.lines(lines) : options.every(([o]) => o.shuttleId != null) ? S.cards.nextShuttles : S.cards.next(kindOf(options.map(([o]) => o)));
  return (
    <View style={[styles.boxColumn, { backgroundColor: t.c.surfaceVariant }]}>
      <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>
        {S.cards.from(what, leg.from.name)}
      </Txt>
      <View style={styles.flow}>
        {options.map(([o, c]) => {
          const isLive = c?.status === 'LIVE';
          const time = isLive ? bestTime(c) : o.start;
          const f = callFreshness(c, now);
          return (
            <View key={rideKey(o)} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <LineBadge label={lineLabel(o)} mode={o.mode} color={lineColor(o)} showIcon={false} />
              <View style={{ width: 5 }} />
              {isLive && (
                <View style={{ marginRight: 4 }}>
                  <LiveSignal freshness={f} />
                </View>
              )}
              <Txt v="labelLarge" num color={isLive ? freshnessColor(f, t) : t.c.onSurface}>
                {relative ? Fmt.relative(time, now) : Fmt.time(time)}
              </Txt>
              {hurry(o) && (
                <Txt v="labelMedium" color={t.x.late} style={{ marginLeft: 4, fontWeight: '600' }}>
                  {S.cards.hurry}
                </Txt>
              )}
            </View>
          );
        })}
        {more > 0 && (
          <Pressable onPress={() => setExpanded(!expanded)} hitSlop={8} accessibilityRole="button" testID="more_rides">
            <Txt v="labelLarge" color={t.c.primary}>
              {expanded ? S.detail.showFewer : S.cards.more(more)}
            </Txt>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Whether a ride goes by its mode's name ("Train"), having no line number of its own. */
const unnumbered = (l: Leg) => {
  const s = l.routeShortName?.trim();
  return s == null || s === '' || s === 'NaN' || s.toLowerCase() === modeName(l.mode).toLowerCase();
};
/** The ride to catch, mid-sentence: "143", or "the train" for one without a line number. */
const catchName = (l: Leg) => (unnumbered(l) ? S.cards.theVehicle(vehicleKind(l.mode)) : lineLabel(l));
/** The ride after a missed one: "next 143", or "the next train". */
const nextName = (l: Leg) => (unnumbered(l) ? S.cards.theNextVehicle(vehicleKind(l.mode)) : S.cards.nextLine(lineLabel(l)));

/**
 * "⚠ Tight transfer · 2 min to 143" — the connection may be missed if a bus runs off schedule —
 * and, when known, the ride after it: "If missed, next 143 at 14:32 (+12 min)".
 */
export function TransferWarning({ t: tr, missed }: { t: Transfer; missed?: Leg | null }) {
  const t = useTheme();
  const min = Math.trunc(Math.max(tr.slackSec, 0) / 60);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }} testID="transfer_warning">
      <View style={{ marginTop: 1 }}>
        <Icon name="warning-amber" size={16} color="#F5A524" />
      </View>
      <View style={{ marginLeft: 6, flex: 1 }}>
        <Txt v="bodySmall" color={t.x.subtle}>
          {S.cards.tightTransfer(min, catchName(tr.next)) + (isWalking(tr) ? S.cards.afterWalk(Fmt.distance(tr.walkM)) : '')}
        </Txt>
        {missed != null && (
          <Txt v="bodySmall" color={t.x.subtle}>
            {S.cards.ifMissed(nextName(missed), Fmt.time(missed.start), Fmt.duration(missed.start - tr.next.start))}
          </Txt>
        )}
      </View>
    </View>
  );
}

function LeaveIn({ leaveAt, now, freshness, hurry, mode }: { leaveAt: Instant; now: Instant; freshness: Freshness; hurry: boolean; mode: TransitMode }) {
  const t = useTheme();
  const min = Math.trunc((leaveAt - now + 30) / 60);
  return (
    <View style={{ alignItems: 'flex-end' }} testID="leave_in">
      {hurry && min <= 0 ? (
        <>
          <Txt v="titleMedium" color={t.x.late}>
            {S.cards.hurry}
          </Txt>
          <Txt v="labelSmall" color={t.x.subtle}>{S.cards.isClose(vehicleKind(mode))}</Txt>
        </>
      ) : min <= 0 && min > -2 ? (
        <Txt v="titleMedium" color={t.x.live}>
          {S.cards.goNow}
        </Txt>
      ) : min >= 1 && min <= 90 ? (
        <>
          <Txt v="labelSmall" color={t.x.subtle}>
            {S.cards.leaveIn}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Txt v="headlineSmall" num color={freshnessColor(freshness, t)}>
              {String(min)}
            </Txt>
            <Txt v="labelMedium" style={{ marginBottom: 3 }}>
              {S.cards.minUnit}
            </Txt>
          </View>
        </>
      ) : min < 0 ? (
        <Txt v="labelMedium" color={t.x.subtle}>
          {S.cards.missed}
        </Txt>
      ) : null}
    </View>
  );
}

/** "● 116 in 4 min · 3 stops away, at X" style summary for a boarding. */
export function LiveLine({
  label,
  mode,
  stop,
  live,
  scheduled,
  now,
  onPress,
}: {
  label: string;
  mode: TransitMode;
  stop: string;
  live: LiveCall | null | undefined;
  scheduled: Instant;
  now: Instant;
  /** Tapping a live arrival shows the vehicle on a map; ignored without a live vehicle. */
  onPress?: () => void;
}) {
  const t = useTheme();
  const tappable = onPress != null && live?.status === 'LIVE' && live.vehicle != null;
  let body;
  if (live?.status === 'LIVE') {
    const f = callFreshness(live, now);
    const eta = bestTime(live) - now < 45 ? S.cards.arriving(vehicleKind(mode)) : S.cards.inTime(Fmt.relative(bestTime(live), now));
    const away = live.stopsAway != null && live.stopsAway >= 1 && live.stopsAway <= 30 ? ` · ${S.cards.stopsAway(live.stopsAway)}` : '';
    body = (
      <>
        <LiveSignal freshness={f} size={14} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={[type.bodyMedium, { color: t.c.onSurface, fontWeight: '500' }]} numberOfLines={1}>
            {`${modeName(mode)} ${label} `}
            <Text style={{ color: freshnessColor(f, t), fontWeight: '600' }}>{eta}</Text>
            {away}
          </Text>
          <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>{S.cards.atStop(stop)}</Txt>
        </View>
      </>
    );
  } else if (live?.status === 'PASSED') {
    body = (
      <>
        <Icon name="warning-amber" size={16} color={t.x.late} />
        <Txt v="bodyMedium" color={t.x.late} numberOfLines={2} style={{ flex: 1, marginLeft: 8 }}>
          {S.cards.alreadyPassed(label, stop)}
        </Txt>
      </>
    );
  } else {
    body = (
      <>
        <Icon name={modeIcon(mode)} size={16} color={t.x.subtle} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Txt v="bodyMedium" numberOfLines={1}>{S.cards.from(label, stop)}</Txt>
          <Txt v="bodySmall" color={t.x.subtle}>
            {S.cards.scheduled(Fmt.time(scheduled)) + (live?.status === 'UNTRACKED' ? S.cards.noLiveData : '')}
          </Txt>
        </View>
      </>
    );
  }
  return (
    <Pressable
      onPress={tappable ? onPress : undefined}
      disabled={!tappable}
      accessibilityHint={tappable ? S.cards.showOnMap : undefined}
      style={[styles.box, { backgroundColor: t.c.surfaceVariant }]}
      testID="live_line"
    >
      {body}
    </Pressable>
  );
}

export function WalkOnlyCard({ itin, now, onPress }: { itin: Itinerary; now: Instant; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.card, styles.walkCard, { backgroundColor: t.c.surface }]} testID="walk_only">
      <View style={[styles.walkIcon, { backgroundColor: t.c.surfaceVariant }]}>
        <Icon name="directions-walk" color={t.c.onSurface} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Txt v="titleMedium">{S.cards.walk(Fmt.duration(itinDurationSec(itin)))}</Txt>
        <Txt v="bodySmall" color={t.x.subtle}>
          {Fmt.distance(walkMeters(itin))}
        </Txt>
      </View>
      <Txt v="bodyMedium" style={numeric}>{S.cards.arrive(Fmt.time(now + itinDurationSec(itin)))}</Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginVertical: 5, borderRadius: 20, padding: 16, elevation: 0.5 },
  walkCard: { flexDirection: 'row', alignItems: 'center' },
  walkIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  legsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 6, marginTop: 12 },
  box: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  boxColumn: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  flow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 6, marginTop: 6, alignItems: 'center' },
});
