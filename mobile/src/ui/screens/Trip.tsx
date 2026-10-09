import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Progress } from '../../data/eta';
import { progressFreshness } from '../../data/freshness';
import { type Leg, type StopCall, callPoint, lineLabel, platformLabel, scheduledTime } from '../../data/models';
import { nowSec } from '../../data/time';
import { repo } from '../../state/services';
import { Fmt } from '../fmt';
import { IconButton, LineBadge, LoadingBox, MessageBox, Txt } from '../components/common';
import { Icon } from '../components/icons';
import { LiveLocationCard, LiveSignal, freshnessColor, useNow } from '../components/live';
import { type RailSpec, TimelineRow } from '../components/timeline';
import { TransitMap } from '../map/TransitMap';
import { Model, useModel } from '../model';
import { type RootStack, nav } from '../nav';
import { alpha, readableAccent, useTheme } from '../theme';
import { lineColor } from './routeCards';

/** Map id of the trip's live vehicle. */
const VEHICLE_ID = 'veh';

/** A single trip: every stop with scheduled and live-predicted times. */
class TripModel extends Model {
  trip: Leg | null = null;
  progress: Progress | null = null;
  loading = true;
  failed = false;

  constructor(
    readonly tripId: string,
    /** Opened by tapping a live arrival time: the map zooms to the vehicle and follows it. */
    public following: boolean,
  ) {
    super();
  }

  override start() {
    void this.refresh();
    this.every(20_000, () => void this.refresh());
  }

  private async refresh() {
    const r = await repo.tripLive(this.tripId).catch(() => null);
    if (r != null) {
      this.trip = r[0];
      this.progress = r[1];
    } else if (this.trip == null) {
      this.failed = true;
    }
    this.loading = false;
    this.changed();
  }

  follow = (on: boolean) => {
    if (this.following === on) return;
    this.following = on;
    this.changed();
  };
}

export function TripScreen({ route }: NativeStackScreenProps<RootStack, 'Trip'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { tripId, boardStopId = null, alightStopId = null, focusVehicle = false } = route.params;
  const model = useModel(() => new TripModel(tripId, focusVehicle));
  const now = useNow(10_000);
  const trip = model.trip;
  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="trip_screen">
      <View style={[styles.header, { backgroundColor: t.c.surface, paddingTop: insets.top + 4 }]}>
        <IconButton icon="arrow-back" label="Back" onPress={nav.pop} />
        {trip != null && (
          <>
            <LineBadge label={lineLabel(trip)} mode={trip.mode} color={lineColor(trip)} large />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Txt v="titleSmall" numberOfLines={1}>
                {trip.headsign != null ? `to ${trip.headsign}` : ''}
              </Txt>
              {trip.agencyName != null && (
                <Txt v="bodySmall" color={t.x.subtle}>
                  {trip.agencyName}
                </Txt>
              )}
            </View>
          </>
        )}
      </View>
      {trip == null && model.loading ? (
        <LoadingBox text="Loading trip…" />
      ) : trip == null ? (
        <MessageBox title="Trip unavailable" body="This trip isn't in the current timetable." />
      ) : (
        <TripBody model={model} trip={trip} boardStopId={boardStopId} alightStopId={alightStopId} now={now} bottomInset={insets.bottom} />
      )}
    </View>
  );
}

function TripBody({
  model,
  trip,
  boardStopId,
  alightStopId,
  now,
  bottomInset,
}: {
  model: TripModel;
  trip: Leg;
  boardStopId: string | null;
  alightStopId: string | null;
  now: number;
  bottomInset: number;
}) {
  const t = useTheme();
  const color = lineColor(trip);
  const calls: StopCall[] = [trip.from, ...trip.intermediateStops, trip.to];
  const p = model.progress;
  const board = calls.findIndex((c) => c.stopId != null && c.stopId === boardStopId);
  const alight = calls.findIndex((c) => c.stopId != null && c.stopId === alightStopId);
  const following = model.following && p != null;
  const tick = useNow();
  const list = useRef<FlatList<StopCall>>(null);
  const initial = Math.max((board >= 0 ? board : (p?.lastPassed ?? 0)) - 2, 0);
  useEffect(() => {
    if (initial > 0) setTimeout(() => list.current?.scrollToIndex({ index: initial, animated: false }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const rail: RailSpec = { style: 'SOLID', color };
  const passedRail: RailSpec = { style: 'FADED', color };
  // Predicted times are green while the position is fresh, amber once it stops updating.
  const liveColor = freshnessColor(p ? progressFreshness(p, now) : 'SCHEDULED', t);
  const start = scheduledTime(trip.from);
  return (
    <>
      <View style={{ height: 230 }}>
        <TransitMap
          style={StyleSheet.absoluteFill}
          lines={[{ points: trip.geometry.length ? trip.geometry : calls.map(callPoint), color, width: 5 }]}
          markers={calls.map((c, i) => ({
            point: callPoint(c),
            color,
            kind: i === board || i === alight || i === 0 || i === calls.length - 1 ? 'STOP' : 'STOP_SMALL',
          }))}
          vehicles={
            p
              ? [{ id: VEHICLE_ID, point: { lat: p.vehicle.lat, lon: p.vehicle.lon }, bearing: p.vehicle.bearing, color, label: lineLabel(trip), faded: progressFreshness(p, now) === 'STALE' }]
              : []
          }
          fitPoints={calls.map(callPoint)}
          fitKey={trip.tripId}
          // Leave room for the live card at the top.
          contentPadding={{ top: following ? 56 : 0 }}
          focusVehicleId={following ? VEHICLE_ID : null}
          onUserPan={() => model.follow(false)}
          compassStyle={{ bottom: 8, right: 8 }}
        />
        {following && p != null && (
          <View style={{ position: 'absolute', top: 8, left: 8, right: 8 }}>
            <LiveLocationCard title={`${lineLabel(trip)} live location`} recordedAt={p.vehicle.recordedAt} onClose={() => model.follow(false)} />
          </View>
        )}
      </View>
      <Pressable disabled={p == null} onPress={() => model.follow(true)} style={[styles.status, { backgroundColor: t.c.surface }]} accessibilityHint={p ? 'Show on map' : undefined} testID="trip_status">
        {p != null ? (
          <>
            <LiveSignal freshness={progressFreshness(p, tick)} size={14} />
            <Txt v="bodyMedium" color={progressFreshness(p, tick) === 'LIVE' ? t.c.onSurface : t.x.stale} style={{ flex: 1, marginLeft: 8 }}>
              {(progressFreshness(p, tick) === 'LIVE' ? 'Live · ' : 'Not updating · ') + Fmt.ago(p.vehicle.recordedAt, tick).replace(/^./, (c) => c.toLowerCase())}
            </Txt>
            {!model.following && <Icon name="my-location" size={20} color={t.c.primary} accessibilityLabel="Show on map" />}
          </>
        ) : (
          <Txt v="bodyMedium" color={t.x.subtle}>
            {start != null && start > nowSec()
              ? `Departs ${Fmt.time(start)} · not started yet`
              : trip.end < now
                ? 'This trip has ended'
                : 'No live position for this trip — showing the timetable'}
          </Txt>
        )}
      </Pressable>
      <FlatList
        ref={list}
        data={calls}
        keyExtractor={(_, i) => String(i)}
        onScrollToIndexFailed={() => {}}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 + bottomInset }}
        renderItem={({ item: c, index: i }) => {
          const passed = p != null && i <= p.lastPassed;
          const predicted = p?.predicted[i] ?? null;
          const sched = scheduledTime(c);
          const highlight = i === board || i === alight;
          return (
            <View>
              <TimelineRow
                above={i === 0 ? null : passed ? passedRail : rail}
                below={i === calls.length - 1 ? null : p != null && i < p.lastPassed ? passedRail : rail}
                node={highlight || i === 0 || i === calls.length - 1 ? 'TERMINUS' : 'STOP'}
                nodeColor={passed ? alpha(color, 0.35) : color}
                dim={passed}
                time={
                  // Only when it'll actually be there; how late that is vs the timetable isn't useful.
                  <Txt v="labelLarge" num color={predicted != null ? liveColor : t.c.onSurface}>
                    {(predicted ?? sched) != null ? Fmt.time((predicted ?? sched)!) : ''}
                  </Txt>
                }
              >
                <Txt v="bodyLarge" style={[{ paddingTop: 11 }, highlight && { fontWeight: '600' }]} numberOfLines={1}>
                  {c.name}
                </Txt>
                <Txt v="bodySmall" color={highlight ? t.c.primary : t.x.subtle} style={{ paddingBottom: 10 }}>
                  {[i === board ? 'Board here' : i === alight ? 'Get off here' : null, c.code != null ? `#${c.code}` : null, platformLabel(c)]
                    .filter((x) => x != null)
                    .join(' · ')}
                </Txt>
              </TimelineRow>
              {p != null && i === p.lastPassed && i < calls.length - 1 && (
                <TimelineRow above={rail} below={rail} node="VEHICLE" nodeColor={color} nodeY={16}>
                  <Txt v="labelMedium" color={readableAccent(color, t)} style={{ paddingVertical: 6 }}>{`${lineLabel(trip)} is here`}</Txt>
                </TimelineRow>
              )}
            </View>
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 4 },
  status: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
});
