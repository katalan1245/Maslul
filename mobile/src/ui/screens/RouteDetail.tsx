import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Combine } from '../../data/combine';
import type { LiveApproach, LiveCall } from '../../data/eta';
import { Freshness, callFreshness } from '../../data/freshness';
import {
  type Itinerary,
  type Leg,
  type Place,
  callPoint,
  firstTransit,
  isTransit,
  legDurationSec,
  legOptions,
  lineLabel,
  platformLabel,
  rideKey,
  scheduledTime,
  vehicle,
  vehiclesOf,
  walkMeters,
} from '../../data/models';
import { Ranking, type Transfer, isTight } from '../../data/ranking';
import { ShuttleSchedule } from '../../data/shuttles';
import { type Instant, nowSec } from '../../data/time';
import { WALK_SPEEDS } from '../../data/userStore';
import { activeTrip, useActiveTrip } from '../../live/liveTrip';
import { canNotify, scheduleReminder } from '../../live/notifications';
import MaslulNative from '../../../modules/maslul-native/src/MaslulNativeModule';
import { location, useLastLocation } from '../../state/location';
import { repo } from '../../state/services';
import { store } from '../../state/store';
import { Fmt, modeName, rideName } from '../fmt';
import { Button, IconButton, LineBadge, Txt } from '../components/common';
import { Icon, modeIcon } from '../components/icons';
import { LiveLocationCard, LiveSignal, freshnessColor, useNow } from '../components/live';
import { MapSheet } from '../components/MapSheet';
import { showToast } from '../components/overlays';
import { type RailSpec, TimelineRow } from '../components/timeline';
import { type MapLine, type MapMarker, type MapVehicle, TransitMap, useMapController } from '../map/TransitMap';
import { Model, useModel } from '../model';
import { type RootStack, nav } from '../nav';
import { alpha, lerpColor, useTheme } from '../theme';
import { SHOWN_RIDES, TransferWarning, lineColor } from './routeCards';

class RouteDetailModel extends Model {
  /** Live state of every ride option, by rideKey. */
  readonly rideLive = new Map<string, LiveCall>();
  readonly approach = new Map<number, LiveApproach>();
  /** Leg index whose live vehicle the map follows, after tapping its arrival. */
  following: number | null = null;
  /** The itinerary with the line picked on each combined leg (initially the best one). */
  itinerary: Itinerary;
  /** Rides found after each transfer leg's (by leg index), for the wait if it's missed; null while looking. */
  private readonly after = new Map<number, Leg[] | null>();
  /** Legs whose ride the user picked by hand; the others follow whichever bus gets there first. */
  private readonly picked = new Set<number>();

  constructor(
    original: Itinerary,
    readonly from: Place,
    readonly to: Place,
  ) {
    super();
    this.itinerary = original;
    const modes = store.value.settings.modes;
    const first = original.legs.findIndex((l) => isTransit(l.mode));
    original.legs.forEach((l, i) => {
      // The user's own shuttle: its timetable says what comes next.
      const own = l.shuttleId != null ? ShuttleSchedule.ridesAfter(store.value.shuttles, l) : null;
      if (i > first && own != null) this.after.set(i, own);
      else if (i > first && isTransit(l.mode) && l.shuttleId == null) {
        this.after.set(i, null);
        repo.ridesAfter(l, modes).then(
          (r) => {
            this.after.set(i, r);
            this.changed();
          },
          () => {
            this.after.delete(i);
            this.changed();
          },
        );
      }
    });
  }

  override start() {
    void this.refreshLive();
    this.every(20_000, () => void this.refreshLive());
  }

  /** Rides leaving after the one taken on transfer leg [i] (the wait if it's missed); null until looked up. */
  ridesAfter(i: number): Leg[] | null {
    const a = this.after.get(i);
    return a ? Combine.ridesAfter(this.itinerary.legs[i], a) : null;
  }

  lookingForRidesAfter = (i: number) => this.after.has(i) && this.after.get(i) == null;

  /** Live state of the ride currently chosen on leg [i]. */
  live(i: number): LiveCall | null {
    const l = this.itinerary.legs[i];
    return l != null && isTransit(l.mode) ? (this.rideLive.get(rideKey(l)) ?? null) : null;
  }

  liveOf = (l: Leg) => this.rideLive.get(rideKey(l));

  /** The trip as the rides are expected to run (late ones included): what its times show. */
  expected = (): Itinerary => Combine.expected(this.itinerary, this.liveOf);

  /** A tight connection onto [leg], if the previous vehicle (as expected to run) leaves little spare time. */
  tightTransferInto = (leg: Leg): Transfer | null =>
    Ranking.transfers(this.expected(), WALK_SPEEDS[store.value.settings.walkSpeed].mps).find((t) => rideKey(t.next) === rideKey(leg) && isTight(t)) ?? null;

  /** Rides [option] (another bus between the same stops) on leg [i] instead. */
  choose = (i: number, option: Leg) => {
    this.picked.add(i);
    this.switchTo(i, option);
  };

  private switchTo(i: number, option: Leg) {
    this.itinerary = Combine.choose(this.itinerary, i, option);
    this.approach.delete(i);
    this.changed();
    const call = this.rideLive.get(rideKey(option));
    if (call) void this.updateApproach(i, this.itinerary.legs[i], call);
  }

  private async updateApproach(i: number, leg: Leg, call: LiveCall) {
    const a = await repo.approach(leg, call).catch(() => null);
    // The pick may have changed meanwhile.
    if (this.itinerary.legs[i] == null || rideKey(this.itinerary.legs[i]) !== rideKey(leg)) return;
    if (a) this.approach.set(i, a);
    else this.approach.delete(i);
    this.changed();
  }

  private async refreshLive() {
    const now = nowSec();
    await Promise.all(
      this.itinerary.legs.flatMap((chosen, i) => {
        if (!isTransit(chosen.mode)) return [];
        // Every line of a combined leg, so their buses and arrivals can be compared.
        return legOptions(chosen).map(async (leg) => {
          const call = await (async () => ((await repo.worthLive(leg, now, 300)) ? repo.legLive(leg, now) : null))().catch(() => null);
          if (call == null || this.disposed) return;
          this.rideLive.set(rideKey(leg), call);
          if (rideKey(leg) === rideKey(this.itinerary.legs[i])) await this.updateApproach(i, leg, call);
          this.pickBest();
          this.changed();
        });
      }),
    );
  }

  /**
   * Takes whichever catchable bus gets you there first on each leg the user hasn't picked —
   * e.g. an earlier 16 running late that comes before the planned one. Only for trips about
   * to happen, where live data says something.
   */
  private pickBest() {
    const now = nowSec();
    if (this.itinerary.start > now + 90 * 60) return;
    this.itinerary.legs.forEach((_, i) => {
      if (this.picked.has(i)) return;
      const b = Combine.bestOption(this.itinerary, i, now, this.liveOf);
      if (b) this.switchTo(i, b);
    });
  }

  /** Follows leg [i]'s live vehicle on the map (null stops). */
  follow = (i: number | null) => {
    if (this.following === i) return;
    this.following = i;
    this.changed();
  };

  openTrip = (leg: Leg) => {
    if (leg.tripId == null) return;
    nav.push('Trip', { tripId: leg.tripId, boardStopId: leg.from.stopId, alightStopId: leg.to.stopId });
  };

  async remind() {
    const minutes = store.value.settings.reminderMinutes;
    const itin = this.itinerary;
    const first = firstTransit(itin);
    const call = first ? this.live(itin.legs.indexOf(first)) : null;
    const walkBefore = first ? itin.legs.slice(0, itin.legs.indexOf(first)).reduce((s, l) => s + legDurationSec(l), 0) : 0;
    const leaveAt = (call?.status === 'LIVE' && call.expected != null ? call.expected : (first?.start ?? itin.start)) - walkBefore;
    const at = leaveAt - minutes * 60;
    const text = first
      ? `Leave at ${Fmt.time(leaveAt)} · ${first.shuttleId != null ? lineLabel(first) : rideName(first)} from ${first.from.name} at ${Fmt.time(first.start)}`
      : `Leave at ${Fmt.time(leaveAt)}`;
    const ok = await scheduleReminder(at, `Time to go to ${this.to.name}`, text).catch(() => false);
    showToast(ok ? `Reminder set for ${Fmt.when(at, nowSec())} (${minutes} min before leaving)` : 'That departure is too soon for a reminder');
    // Without "Alarms & reminders" Android may hold a reminder back by minutes, up to an hour.
    if (ok && MaslulNative?.canScheduleExactAlarms() === false) {
      Alert.alert('Get reminders on time?', 'Android may send this reminder late. Allow Maslul under "Alarms & reminders" so reminders come on time.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Allow', onPress: () => MaslulNative?.openExactAlarmSettings() },
      ]);
    }
  }

  share() {
    const e = this.expected();
    const lines = [`My trip to ${this.to.name}: ${Fmt.when(e.start, nowSec())} → ${Fmt.time(e.end)} (${Fmt.duration(e.end - e.start)})`];
    for (const l of this.itinerary.legs) {
      if (l.mode === 'WALK') {
        if (legDurationSec(l) >= 60) lines.push(`• Walk ${Fmt.duration(legDurationSec(l))} to ${l.to.name.trim() || this.to.name}`);
      } else {
        lines.push(`• ${rideName(l)} from ${l.from.name} at ${Fmt.time(l.start)} → ${l.to.name} (${Fmt.time(l.end)})`);
      }
    }
    void Share.share({ message: lines.join('\n') + '\n', title: 'Share trip' });
  }
}

export function RouteDetailScreen({ route }: NativeStackScreenProps<RootStack, 'RouteDetail'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const model = useModel(() => new RouteDetailModel(route.params.itinerary, route.params.from, route.params.to));
  const active = useActiveTrip();
  const isActive = active?.itinerary.id === model.itinerary.id;
  const now = useNow(10_000);
  const controller = useMapController();

  const startLive = async () => {
    const ok = (await location.hasPermission()) || (await location.requestPermission());
    if (Platform.OS === 'android') await canNotify(true);
    if (ok) await activeTrip.start(model.itinerary, model.to.name);
    else showToast('Live directions need location access');
  };
  const remind = async () => {
    await canNotify(true);
    await model.remind();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="route_detail_screen">
      <MapSheet
        peekFraction={0.52}
        topGap={8}
        map={(c) => <RouteMap model={model} mapOnly={c.mapOnly} bottom={c.mapOnly ? 72 : c.peekHeight} controller={controller} />}
        overlay={(c) => (
          <Overlay
            model={model}
            mapOnly={c.mapOnly}
            onExpand={() => (c.mapOnly ? c.show() : c.hide())}
            onShow={c.show}
            onFollow={c.peek}
            onMyLocation={async () => {
              // Jump to the last fix right away, then to a fresh one.
              if (location.last) controller.current?.moveTo(location.last, 15.5);
              const p = await location.current();
              if (p) controller.current?.moveTo(p, 15.5);
            }}
            insetsTop={insets.top}
            insetsBottom={insets.bottom}
          />
        )}
      >
        <View testID="route_detail">
          <DetailHeader
            itin={model.expected()}
            active={isActive}
            onStart={() => (isActive ? void activeTrip.stop() : void startLive())}
            onRemind={() => void remind()}
            onShare={() => model.share()}
          />
          {isActive && active?.state != null && (
            <View style={[styles.activeCard, { backgroundColor: t.c.primaryContainer }]} testID="active_state">
              <Txt v="titleSmall" color={t.c.onPrimaryContainer}>
                {active.state.title}
              </Txt>
              <Txt v="bodyMedium" color={t.c.onPrimaryContainer}>
                {active.state.text}
              </Txt>
            </View>
          )}
          <View style={{ height: 8 }} />
          <JourneyTimeline model={model} now={now} />
          <View style={{ height: 24 }} />
        </View>
      </MapSheet>
    </View>
  );
}

function Overlay({
  model,
  mapOnly,
  onExpand,
  onShow,
  onFollow,
  onMyLocation,
  insetsTop,
  insetsBottom,
}: {
  model: RouteDetailModel;
  mapOnly: boolean;
  onExpand: () => void;
  onShow: () => void;
  onFollow: () => void;
  onMyLocation: () => void;
  insetsTop: number;
  insetsBottom: number;
}) {
  const t = useTheme();
  // Following a vehicle needs the map in view.
  useEffect(() => {
    if (model.following != null) onFollow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.following]);
  const followedLeg = model.following;
  const followed = followedLeg != null ? model.live(followedLeg) : null;
  return (
    <>
      <View style={[styles.back, { top: insetsTop + 12 }]}>
        <IconButton icon="arrow-back" label="Back" onPress={nav.pop} filled color={t.c.onSurface} />
      </View>
      <View style={[styles.rightButtons, { top: insetsTop + 12 }]}>
        <IconButton icon={mapOnly ? 'fullscreen-exit' : 'fullscreen'} label={mapOnly ? 'Show details' : 'Expand map'} onPress={onExpand} filled testID="map_expand" />
        <IconButton icon="my-location" label="My location" onPress={onMyLocation} filled color={t.c.primary} testID="map_my_location" />
      </View>
      {followedLeg != null && followed?.status === 'LIVE' && followed.vehicle != null && (
        <View style={[styles.liveCard, { top: insetsTop + 12 }]}>
          <LiveLocationCard
            title={`${lineLabel(model.itinerary.legs[followedLeg])} live location`}
            recordedAt={followed.vehicle.recordedAt}
            onClose={() => model.follow(null)}
          />
        </View>
      )}
      {mapOnly && (
        <Pressable onPress={onShow} style={[styles.fab, { backgroundColor: t.c.surface, bottom: insetsBottom + 16 }]} accessibilityRole="button">
          <Icon name="expand-less" color={t.c.onSurface} />
          <Txt v="labelLarge" style={{ marginLeft: 8 }}>
            Trip details
          </Txt>
        </Pressable>
      )}
    </>
  );
}

function RouteMap({ model, mapOnly, bottom, controller }: { model: RouteDetailModel; mapOnly: boolean; bottom: number; controller: ReturnType<typeof useMapController> }) {
  const t = useTheme();
  const user = useLastLocation();
  const now = useNow(10_000);
  const itin = model.itinerary;
  const bg = t.c.background;
  const lines: MapLine[] = itin.legs.map((l) => {
    const pts = l.geometry.length ? l.geometry : [callPoint(l.from), callPoint(l.to)];
    if (l.mode === 'WALK') return { points: pts, color: t.dark ? '#B0B8C4' : '#5B6472', width: 5, dashed: true };
    if (l.mode === 'CAR') return { points: pts, color: t.dark ? '#9AA3B2' : '#3F4652', width: 6 };
    return { points: pts, color: lineColor(l), width: 6 };
  });
  const markers: MapMarker[] = [];
  itin.legs
    .filter((l) => isTransit(l.mode))
    .forEach((l) => {
      const c = lineColor(l);
      l.intermediateStops.forEach((s) => markers.push({ point: callPoint(s), color: c, kind: 'STOP_SMALL' }));
      markers.push({ point: callPoint(l.from), color: c, kind: 'STOP' }, { point: callPoint(l.to), color: c, kind: 'STOP' });
    });
  markers.push({ point: callPoint(itin.legs[0].from), color: '#000000', kind: 'ORIGIN' });
  markers.push({ point: callPoint(itin.legs[itin.legs.length - 1].to), color: '#E5484D', kind: 'DESTINATION' });
  // Other lines of a combined leg: drawn faded underneath, with their buses, so all can be compared.
  const otherLines: MapLine[] = itin.legs.flatMap((l) =>
    l.alternatives.map((o) => ({
      points: o.geometry.length ? o.geometry : [callPoint(o.from), callPoint(o.to)],
      color: lerpColor(lineColor(o), bg, 0.5),
      width: 4,
    })),
  );
  const vehicles: MapVehicle[] = itin.legs.flatMap((leg) =>
    // The chosen ride's bus last, so it's drawn on top.
    [...leg.alternatives, leg].flatMap((o): MapVehicle[] => {
      const v = model.rideLive.get(rideKey(o))?.vehicle;
      if (!v) return [];
      const c = lineColor(o);
      return [
        {
          id: `v${rideKey(o)}`,
          point: { lat: v.lat, lon: v.lon },
          bearing: v.bearing,
          color: o === leg ? c : lerpColor(c, bg, 0.4),
          label: lineLabel(o),
          faded: Freshness.of(v.recordedAt, now) === 'STALE',
        },
      ];
    }),
  );
  const followLeg = model.following != null ? itin.legs[model.following] : null;
  const followId = followLeg && vehicles.some((v) => v.id === `v${rideKey(followLeg)}`) ? `v${rideKey(followLeg)}` : null;
  // The live vehicle's way to the boarding stop, faded so it reads as "not your ride yet".
  const approach = [...model.approach.entries()].map(([i, a]) => {
    const c = lerpColor(lineColor(itin.legs[i]), bg, 0.45);
    return { line: { points: a.path, color: c, width: 5, dashed: true }, stops: a.stops.map((p): MapMarker => ({ point: p, color: c, kind: 'STOP_SMALL' })) };
  });
  const routePts = itin.legs.flatMap((l) => (l.geometry.length ? l.geometry : [callPoint(l.from), callPoint(l.to)]));
  return (
    <TransitMap
      style={StyleSheet.absoluteFill}
      lines={[...otherLines, ...approach.map((a) => a.line), ...lines]}
      markers={[...approach.flatMap((a) => a.stops), ...markers]}
      vehicles={vehicles}
      user={user}
      // Refit once the live vehicle shows up so it's in view too.
      fitPoints={[...routePts, ...[...model.approach.values()].flatMap((a) => a.path.slice(0, 1))]}
      fitKey={`${itin.id}-${mapOnly}-${model.approach.size > 0}`}
      contentPadding={{ top: 60, bottom }}
      controller={controller}
      focusVehicleId={followId}
      onUserPan={() => model.follow(null)}
      compassStyle={{ top: 124, right: 16 }}
    />
  );
}

function DetailHeader({ itin, active, onStart, onRemind, onShare }: { itin: Itinerary; active: boolean; onStart: () => void; onRemind: () => void; onShare: () => void }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <Txt v="headlineSmall" num>{`${Fmt.when(itin.start, nowSec())} → ${Fmt.time(itin.end)}`}</Txt>
        <Txt v="titleMedium" color={t.x.subtle} style={{ marginLeft: 10, marginBottom: 2 }}>
          {Fmt.duration(itin.end - itin.start)}
        </Txt>
      </View>
      <Txt v="bodyMedium" color={t.x.subtle}>
        {(itin.transfers === 0 ? 'No transfers' : `${itin.transfers} transfer${itin.transfers > 1 ? 's' : ''}`) +
          (walkMeters(itin) > 0 ? ` · ${Fmt.distance(walkMeters(itin))} walking` : '')}
      </Txt>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Button text={active ? 'End' : 'Start'} icon={active ? 'stop' : 'navigation'} onPress={onStart} testID="start_button" />
        <Button text="Remind me" icon="alarm-add" kind="tonal" onPress={onRemind} testID="remind_button" />
        <Button icon="share" kind="outlined" onPress={onShare} testID="share_button" />
      </View>
    </View>
  );
}

function JourneyTimeline({ model, now }: { model: RouteDetailModel; now: Instant }) {
  const t = useTheme();
  const legs = model.itinerary.legs;
  // Leaving and arriving as the rides are expected to run (the stops show their own live times).
  const expected = model.expected();
  const walkRail: RailSpec = { style: 'DOTTED', color: t.x.walk };
  const carRail: RailSpec = { style: 'SOLID', color: t.x.subtle };
  const railOf = (l: Leg): RailSpec => (l.mode === 'WALK' ? walkRail : l.mode === 'CAR' ? carRail : { style: 'SOLID', color: lineColor(l) });
  const from = model.from;
  return (
    <View>
      {/* Origin */}
      <TimelineRow above={null} below={railOf(legs[0])} node="ENDPOINT" nodeColor={t.c.onSurface} time={<TimeText scheduled={expected.start} />}>
        <Txt v="titleSmall" style={{ paddingTop: 12, paddingBottom: 10 }}>
          {from.kind !== 'CURRENT_LOCATION' ? from.name : 'Your location'}
        </Txt>
      </TimelineRow>
      {legs.map((leg, i) => {
        if (!isTransit(leg.mode)) {
          const next = legs[i + 1];
          return (
            <View key={i}>
              {leg.mode === 'CAR' ? <CarSegment leg={leg} rail={carRail} /> : <WalkSegment leg={leg} rail={walkRail} />}
              {/* A node where the walk (or the lift) ends, unless the next leg draws its own boarding node. */}
              {next != null && !isTransit(next.mode) && (
                <TimelineRow
                  above={railOf(leg)}
                  below={railOf(next)}
                  node="SMALL"
                  nodeColor={leg.mode === 'CAR' ? t.x.subtle : t.x.walk}
                  time={leg.mode === 'CAR' ? <TimeText scheduled={leg.end} /> : undefined}
                >
                  <Txt v="bodyMedium" style={{ paddingTop: 12 }}>
                    {leg.to.name.trim() || (leg.mode === 'CAR' ? 'Get out here' : '')}
                  </Txt>
                </TimelineRow>
              )}
            </View>
          );
        }
        const c = lineColor(leg);
        const rail: RailSpec = { style: 'SOLID', color: c };
        const prev = legs[i - 1];
        const next = legs[i + 1];
        const live = model.live(i);
        const tight = model.tightTransferInto(leg);
        return (
          <View key={i}>
            {/* Boarding */}
            <TimelineRow
              above={prev ? railOf(prev) : null}
              below={rail}
              node="STOP"
              nodeColor={c}
              time={<TimeText scheduled={leg.start} expected={live?.status === 'LIVE' ? live.expected : null} freshness={callFreshness(live, now)} />}
            >
              <Txt v="titleSmall" style={{ paddingTop: 12 }}>
                {leg.from.name}
              </Txt>
              {leg.tripId != null && leg.tripId === model.from.tripId && (
                <Txt v="bodySmall" color={t.x.subtle}>{`You're on this ${vehicle(leg.mode)}: stay on`}</Txt>
              )}
              {platformLabel(leg.from) != null && (
                <Txt v="bodySmall" color={t.x.subtle}>
                  {platformLabel(leg.from)}
                </Txt>
              )}
              {tight != null && (
                <View style={{ marginTop: 4 }}>
                  <TransferWarning t={tight} />
                </View>
              )}
            </TimelineRow>
            <TransitSegment model={model} index={i} leg={leg} rail={rail} live={live} now={now} />
            {/* Alighting */}
            <TimelineRow
              above={rail}
              below={next ? railOf(next) : null}
              node="STOP"
              nodeColor={c}
              time={<TimeText scheduled={leg.end} expected={live?.alightExpected ?? null} freshness={callFreshness(live, now)} />}
            >
              <Txt v="titleSmall" style={{ paddingTop: 12 }}>
                {leg.to.name}
              </Txt>
              <Txt v="bodySmall" color={t.x.subtle} style={{ marginBottom: 8 }}>
                Get off
              </Txt>
            </TimelineRow>
          </View>
        );
      })}
      {/* Destination */}
      <TimelineRow above={railOf(legs[legs.length - 1])} below={null} node="TERMINUS" nodeColor={t.c.primary} time={<TimeText scheduled={expected.end} />}>
        <Txt v="titleSmall" style={{ paddingTop: 12 }}>
          {model.to.name}
        </Txt>
        {model.to.subtitle != null && (
          <Txt v="bodySmall" color={t.x.subtle}>
            {model.to.subtitle}
          </Txt>
        )}
      </TimelineRow>
    </View>
  );
}

function TimeText({ scheduled, expected = null, freshness = 'SCHEDULED' }: { scheduled: Instant; expected?: Instant | null; freshness?: Freshness }) {
  const t = useTheme();
  // Live predictions: green while the position is fresh, amber once it stops updating.
  const liveColor = freshnessColor(freshness === 'SCHEDULED' ? 'LIVE' : freshness, t);
  return (
    <Txt v="labelLarge" num color={expected != null ? liveColor : t.c.onSurface}>
      {Fmt.time(expected ?? scheduled)}
    </Txt>
  );
}

function WalkSegment({ leg, rail }: { leg: Leg; rail: RailSpec }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <TimelineRow above={rail} below={rail} node="NONE" nodeColor="transparent">
      <Pressable disabled={leg.steps.length === 0} onPress={() => setOpen(!open)} style={styles.segmentRow} accessibilityRole="button">
        <Icon name={modeIcon('WALK')} size={18} color={t.x.subtle} />
        <Txt v="bodyMedium" color={t.x.subtle} style={{ marginLeft: 6 }}>
          {`Walk ${Fmt.duration(legDurationSec(leg))}` + (leg.distanceM != null ? ` · ${Fmt.distance(leg.distanceM)}` : '')}
        </Txt>
        {leg.steps.length > 0 && <Icon name={open ? 'expand-less' : 'expand-more'} color={t.x.subtle} />}
      </Pressable>
      {open && (
        <View style={{ paddingBottom: 8 }}>
          {leg.steps.map((s, k) => (
            <Txt key={k} v="bodySmall" color={t.x.subtle} style={{ paddingVertical: 2 }}>
              {`${s.instruction} · ${Fmt.distance(s.distanceM)}`}
            </Txt>
          ))}
        </View>
      )}
    </TimelineRow>
  );
}

/** "Car · 18 min · 12 km": a lift for part of the way. */
function CarSegment({ leg, rail }: { leg: Leg; rail: RailSpec }) {
  const t = useTheme();
  return (
    <TimelineRow above={rail} below={rail} node="NONE" nodeColor="transparent">
      <View style={[styles.segmentRow, { paddingVertical: 14 }]}>
        <Icon name={modeIcon('CAR')} size={18} color={t.x.subtle} />
        <Txt v="bodyMedium" color={t.x.subtle} style={{ marginLeft: 6 }}>
          {`Ride ${Fmt.duration(legDurationSec(leg))}` + (leg.distanceM != null ? ` · ${Fmt.distance(leg.distanceM)}` : '')}
        </Txt>
      </View>
    </TimelineRow>
  );
}

function TransitSegment({ model, index, leg, rail, live, now }: { model: RouteDetailModel; index: number; leg: Leg; rail: RailSpec; live: LiveCall | null; now: Instant }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const catchable = Combine.catchableOptions(model.itinerary, index, now, true, model.liveOf);
  const options = catchable.some((o) => rideKey(o) === rideKey(leg)) ? catchable : [...catchable, leg];
  const n = leg.intermediateStops.length + 1;
  const after = model.ridesAfter(index);
  const follow = () => model.follow(index);
  return (
    <TimelineRow above={rail} below={rail} node="NONE" nodeColor="transparent">
      <View style={{ height: 6 }} />
      {options.length > 1 && (
        <View style={{ marginBottom: 8 }}>
          <LineOptions
            leg={leg}
            rides={options}
            now={now}
            rideLive={model.rideLive}
            hurry={(o) => Combine.onlyByHurrying(model.itinerary, index, o, now, model.liveOf(o), model.liveOf)}
            onChoose={(o) => model.choose(index, o)}
          />
        </View>
      )}
      <Pressable onPress={() => model.openTrip(leg)} style={styles.lineRow} accessibilityRole="button" testID="open_trip">
        <LineBadge label={lineLabel(leg)} mode={leg.mode} color={lineColor(leg)} />
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Txt v="bodyMedium" style={{ fontWeight: '500' }} numberOfLines={1}>
            {leg.headsign != null ? `to ${leg.headsign}` : modeName(leg.mode)}
          </Txt>
          {leg.agencyName != null && (
            <Txt v="bodySmall" color={t.x.subtle}>
              {leg.agencyName}
            </Txt>
          )}
        </View>
      </Pressable>
      <View style={{ height: 6 }} />
      {/* On the bus already: "passed this stop, check the next one" isn't advice for you. */}
      {(leg.tripId == null || leg.tripId !== model.from.tripId) && <LiveStatusChip live={live} leg={leg} now={now} onPress={follow} />}
      {model.lookingForRidesAfter(index) && (
        <Txt v="labelMedium" color={t.x.subtle} style={{ marginTop: 8 }} testID="missed_rides_loading">
          If you miss it: checking the next rides…
        </Txt>
      )}
      {after != null && <MissedRides leg={leg} rides={after} />}
      {leg.alerts.map((a, k) => (
        <View key={k} style={{ flexDirection: 'row', marginTop: 6 }}>
          <Icon name="warning-amber" size={16} color="#F5A524" />
          <Txt v="bodySmall" numberOfLines={3} style={{ marginLeft: 6, flex: 1 }}>
            {a}
          </Txt>
        </View>
      ))}
      <Pressable disabled={leg.intermediateStops.length === 0} onPress={() => setOpen(!open)} style={styles.segmentRow} accessibilityRole="button">
        <Txt v="bodySmall" color={t.x.subtle}>{`Ride ${n} stop${n > 1 ? 's' : ''} · ${Fmt.duration(legDurationSec(leg))}`}</Txt>
        {leg.intermediateStops.length > 0 && <Icon name={open ? 'expand-less' : 'expand-more'} size={18} color={t.x.subtle} />}
      </Pressable>
      {open && (
        <View style={{ paddingBottom: 6 }}>
          {leg.intermediateStops.map((s, k) => (
            <View key={k} style={{ flexDirection: 'row', paddingVertical: 3 }}>
              <Txt v="bodySmall" num color={t.x.subtle} style={{ width: 44 }}>
                {scheduledTime(s) != null ? Fmt.time(scheduledTime(s)!) : ''}
              </Txt>
              <Txt v="bodySmall" numberOfLines={1} style={{ flex: 1 }}>
                {s.name}
              </Txt>
            </View>
          ))}
        </View>
      )}
    </TimelineRow>
  );
}

/** "If you miss it: [143] 14:32 · +12 min  [5] 14:40 · +20 min" for a transfer: the next two rides. */
function MissedRides({ leg, rides }: { leg: Leg; rides: Leg[] }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 8 }} testID="missed_rides">
      <Txt v="labelMedium" color={t.x.subtle}>
        {rides.length === 0 ? 'If you miss it: no other ride within the hour' : 'If you miss it, next:'}
      </Txt>
      {rides.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4, marginTop: 4 }}>
          {rides.map((o) => (
            <View key={rideKey(o)} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <LineBadge label={lineLabel(o)} mode={o.mode} color={lineColor(o)} showIcon={false} />
              <Txt v="labelMedium" num color={t.x.subtle} style={{ marginLeft: 5 }}>
                {`${Fmt.time(o.start)} · +${Fmt.duration(o.start - leg.start)}`}
              </Txt>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/**
 * Every bus that can still be caught for this ride (other lines, or the next ones of the same
 * line — including an earlier one running late), soonest first, each with its departure and arrival
 * (live when tracked). Tapping one rides it: the timeline and map follow the pick.
 */
function LineOptions({
  leg,
  rides,
  now,
  rideLive,
  hurry,
  onChoose,
}: {
  leg: Leg;
  rides: Leg[];
  now: Instant;
  rideLive: ReadonlyMap<string, LiveCall>;
  /** Buses you'd only catch by hurrying to the stop. */
  hurry: (l: Leg) => boolean;
  onChoose: (l: Leg) => void;
}) {
  const t = useTheme();
  const [expanded, setExpanded] = useState(false);
  const options = rides.map((o) => [o, rideLive.get(rideKey(o))] as const).sort((a, b) => Combine.boards(a[0], a[1]) - Combine.boards(b[0], b[1]));
  const lines = new Set(options.map(([o]) => Combine.lineKey(o))).size;
  const vehicles = vehiclesOf(options.map(([o]) => o));
  const heading =
    lines > 1
      ? `${options.length} ${vehicles} go this way`
      : // The user's own shuttle: "Next 2 shuttles", not "buses of Office shuttle".
        options.every(([o]) => o.shuttleId != null)
        ? `Next ${options.length} shuttles`
        : `Next ${options.length} ${vehicles} of ${lineLabel(leg)}`;
  // The first few (and the chosen one); the rest behind "N more".
  const shown = expanded ? options : options.filter(([o], i) => i < SHOWN_RIDES || rideKey(o) === rideKey(leg));
  const hidden = options.length - shown.length;
  return (
    <View>
      <Txt v="labelMedium" color={t.x.subtle}>{`${heading} · tap to choose`}</Txt>
      <View style={[styles.optionsBox, { backgroundColor: t.c.surfaceVariant }]} testID="line_options">
        {shown.map(([o, c]) => {
          const chosen = rideKey(o) === rideKey(leg);
          const isLive = c?.status === 'LIVE';
          const dep = isLive && c.expected != null ? c.expected : o.start;
          const arr = isLive && c.alightExpected != null ? c.alightExpected : o.end;
          const color = lineColor(o);
          const f = callFreshness(c, now);
          return (
            <Pressable
              key={rideKey(o)}
              onPress={() => onChoose(o)}
              style={[styles.optionRow, chosen && { backgroundColor: alpha(color, 0.14) }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
            >
              <Icon name={chosen ? 'radio-button-checked' : 'radio-button-unchecked'} size={20} color={chosen ? t.c.primary : t.c.onSurfaceVariant} />
              <View style={{ width: 8 }} />
              <LineBadge label={lineLabel(o)} mode={o.mode} color={color} showIcon={false} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Txt v="bodyMedium" num style={chosen ? { fontWeight: '600' } : undefined}>{`${Fmt.time(dep)} → ${Fmt.time(arr)}`}</Txt>
                <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>
                  {[o.headsign != null ? `to ${o.headsign}` : modeName(o.mode), platformLabel(o.from)].filter((x) => x != null).join(' · ')}
                </Txt>
              </View>
              {c?.status === 'LIVE' ? (
                <View style={{ alignItems: 'flex-end', marginLeft: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <LiveSignal freshness={f} />
                    <Txt v="labelLarge" num color={freshnessColor(f, t)} style={{ marginLeft: 4 }}>
                      {Fmt.relative(dep, now)}
                    </Txt>
                  </View>
                  {hurry(o) && (
                    <Txt v="labelMedium" color={t.x.late} style={{ fontWeight: '600' }}>
                      Hurry
                    </Txt>
                  )}
                </View>
              ) : c?.status === 'PASSED' ? (
                <Txt v="labelMedium" color={t.x.late} style={{ marginLeft: 6 }}>
                  Passed
                </Txt>
              ) : (
                <Txt v="labelLarge" num color={t.x.subtle} style={{ marginLeft: 6 }}>
                  {Fmt.relative(dep, now)}
                </Txt>
              )}
            </Pressable>
          );
        })}
        {(hidden > 0 || (expanded && options.length > SHOWN_RIDES)) && (
          <Pressable onPress={() => setExpanded(!expanded)} style={{ paddingHorizontal: 14, paddingVertical: 10 }} testID="more_rides">
            <Txt v="labelLarge" color={t.c.primary}>
              {expanded ? 'Show fewer' : `${hidden} more`}
            </Txt>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function LiveStatusChip({ live, leg, now, onPress }: { live: LiveCall | null; leg: Leg; now: Instant; onPress?: () => void }) {
  const t = useTheme();
  const freshness = callFreshness(live, now);
  let text: string;
  let color: string;
  let dot = false;
  switch (live?.status) {
    case 'LIVE': {
      const eta = live.expected ?? leg.start;
      const rel = Fmt.relative(eta, now);
      const away = live.stopsAway != null && live.stopsAway >= 1 && live.stopsAway <= 40 ? ` · ${live.stopsAway} stop${live.stopsAway > 1 ? 's' : ''} away` : '';
      text = `Arrives ${rel === 'Now' ? 'now' : `in ${rel}`}${away}`;
      color = freshnessColor(freshness, t);
      dot = true;
      break;
    }
    case 'PASSED':
      text = 'Already passed this stop — check the next one';
      color = t.x.late;
      break;
    case 'UNTRACKED':
      text = `No live data · scheduled ${Fmt.time(leg.start)}`;
      color = t.x.subtle;
      break;
    case 'SCHEDULED':
      text = `Scheduled ${Fmt.time(leg.start)} · not departed yet`;
      color = t.x.subtle;
      break;
    default:
      text = `Timetable ${Fmt.time(leg.start)}`;
      color = t.x.subtle;
  }
  // A live vehicle can be shown on the map; timetable-only rows aren't tappable.
  const tappable = onPress != null && live?.status === 'LIVE' && live.vehicle != null;
  return (
    <Pressable
      disabled={!tappable}
      onPress={onPress}
      accessibilityHint={tappable ? 'Show on map' : undefined}
      style={[styles.chip, { backgroundColor: alpha(color.startsWith('#') ? color : '#888888', 0.1) }]}
      testID="live_status"
    >
      {dot && (
        <View style={{ marginRight: 6 }}>
          <LiveSignal freshness={freshness} size={13} />
        </View>
      )}
      <Txt v="labelMedium" color={color} style={{ flexShrink: 1 }}>
        {text}
      </Txt>
      {tappable && (
        <View style={{ marginLeft: 6 }}>
          <Icon name="my-location" size={16} color={color} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: { position: 'absolute', left: 12 },
  rightButtons: { position: 'absolute', right: 12, gap: 8 },
  liveCard: { position: 'absolute', left: 64, right: 64 },
  fab: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderRadius: 16,
    paddingHorizontal: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  activeCard: { marginHorizontal: 16, marginVertical: 6, borderRadius: 14, padding: 14 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  lineRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  optionsBox: { borderRadius: 12, marginTop: 6, overflow: 'hidden' },
  optionRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
