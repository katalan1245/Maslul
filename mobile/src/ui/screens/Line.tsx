import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { arrivalFreshness, progressFreshness } from '../../data/freshness';
import { type LineRoute, type LineStop, type Ride, routeDestination, routeLabel, routeOrigin } from '../../data/models';
import { type Instant, localParts } from '../../data/time';
import { type LineDetail, LineUnavailableException, type LineVehicle } from '../../data/transitRepository';
import { repo } from '../../state/services';
import { store, useUserData } from '../../state/store';
import { Fmt } from '../fmt';
import { IconButton, LineBadge, LiveDot, LoadingBox, MessageBox, Pill, TextButton, Txt } from '../components/common';
import { FAVORITE_GOLD } from '../components/favorites';
import { Icon, modeIcon } from '../components/icons';
import { ArrivalTime, LiveLocationCard, LiveSignal, freshnessColor, useNow } from '../components/live';
import { MapSheet } from '../components/MapSheet';
import { Menu, showToast } from '../components/overlays';
import { type RailSpec, TimelineRow } from '../components/timeline';
import { TransitMap } from '../map/TransitMap';
import { Model, useModel } from '../model';
import { type RootStack, nav } from '../nav';
import { alpha, readableAccent, useTheme } from '../theme';
import { routeColor } from './LinesHome';

/** Stable map id for a line's live vehicle. */
const mapId = (v: LineVehicle) => v.vehicle.vehicleRef ?? v.vehicle.journeyRef ?? `${v.vehicle.lineRef}-${v.vehicle.originDeparture}`;

class LineModel extends Model {
  variants: LineRoute[];
  detail: LineDetail | null = null;
  vehicles: LineVehicle[] = [];
  loading = true;
  error: string | null = null;
  tab: 0 | 1 = 0;
  expanded: number | null = null;
  /** Map id of the live vehicle the map is following, after tapping its arrival time. */
  following: string | null = null;
  private gen = 0;

  constructor(public route: LineRoute) {
    super();
    this.variants = [route];
    void this.load();
  }

  override start() {
    this.every(20_000, () => void this.refreshLive());
  }

  private async load() {
    const gen = ++this.gen;
    this.loading = true;
    this.error = null;
    this.detail = null;
    this.vehicles = [];
    this.changed();
    const current = await repo.currentRoute(this.route).catch(() => this.route);
    if (gen !== this.gen) return;
    this.route = current;
    const variants = repo.lineVariants(current).catch(() => null);
    try {
      this.detail = await repo.lineDetail(current);
      if (gen !== this.gen) return;
      this.changed();
      await this.refreshLive();
    } catch (e) {
      if (gen !== this.gen) return;
      this.error = e instanceof LineUnavailableException ? e.message : "Couldn't load this line. Check your connection and try again.";
    }
    const v = await variants;
    if (gen !== this.gen) return;
    if (v) this.variants = v;
    this.loading = false;
    this.changed();
  }

  retry = () => {
    if (!this.loading) void this.load();
  };

  private async refreshLive() {
    const d = this.detail;
    if (!d) return;
    const v = await repo.lineVehicles(d).catch(() => null);
    if (v && this.detail === d) {
      this.vehicles = v;
      this.changed();
    }
  }

  /** Follows the live vehicle running [journeyRef] on the map, if it's tracked. */
  follow = (journeyRef: string | null) => {
    const v = this.vehicles.find((x) => journeyRef != null && x.vehicle.journeyRef === journeyRef);
    if (v) this.setFollowing(mapId(v));
  };

  setFollowing = (id: string | null) => {
    this.following = id;
    this.changed();
  };

  setTab = (tab: 0 | 1) => {
    this.tab = tab;
    this.changed();
  };

  toggleExpanded = (i: number) => {
    this.expanded = this.expanded === i ? null : i;
    this.changed();
  };

  select = (r: LineRoute) => {
    if (r.gtfsRouteId === this.route.gtfsRouteId) return;
    this.route = r;
    this.expanded = null;
    this.following = null;
    void this.load();
  };

  /** Toggles to the opposite direction (first variant with a different direction). */
  reverse = () => {
    const r = this.route;
    const other =
      this.variants.find((v) => v.direction !== r.direction && v.alternative === r.alternative) ??
      this.variants.find((v) => v.direction !== r.direction) ??
      this.variants.find((v) => v.gtfsRouteId !== r.gtfsRouteId);
    if (other) this.select(other);
  };

  openStop = async (s: LineStop) => {
    const match = await repo.transitStop(s);
    if (match) nav.push('Stop', { place: { ...match, name: s.name } });
    else showToast('Stop board unavailable');
  };

  openRide = async (r: Ride) => {
    const d = this.detail;
    if (!d) return;
    nav.push('Trip', { tripId: await repo.rideTripId(d, r) });
  };
}

export function LineScreen({ route }: NativeStackScreenProps<RootStack, 'Line'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const model = useModel(() => new LineModel(route.params.route));
  const now = useNow(10_000);
  const r = model.route;
  const color = routeColor(r);
  const fav = data.favoriteLines.some((x) => x.operatorRef === r.operatorRef && x.mkt === r.mkt);
  const [menu, setMenu] = useState(false);
  const d = model.detail;
  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="line_screen">
      <View style={[styles.header, { backgroundColor: t.c.surface, paddingTop: insets.top + 4 }]}>
        <IconButton icon="arrow-back" label="Back" onPress={nav.pop} />
        <LineBadge label={routeLabel(r)} mode={r.mode} color={color} large />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Txt v="titleSmall" numberOfLines={2}>{`to ${routeDestination(r).trim() || r.longName}`}</Txt>
          <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>{`${r.agency} · from ${routeOrigin(r)}`}</Txt>
        </View>
        <IconButton icon={fav ? 'star' : 'star-border'} label="Favorite" color={fav ? FAVORITE_GOLD : t.c.onSurfaceVariant} onPress={() => store.toggleFavoriteLine(r)} testID="favorite_line" />
        <IconButton
          icon="swap-horiz"
          label="Change direction"
          disabled={model.variants.length <= 1}
          onPress={() => (model.variants.length > 2 ? setMenu(true) : model.reverse())}
          testID="line_direction"
        />
      </View>
      <Menu
        visible={menu}
        onDismiss={() => setMenu(false)}
        items={model.variants.map((v) => ({ text: `to ${routeDestination(v)} · from ${routeOrigin(v)}`, onPress: () => model.select(v) }))}
      />
      {d == null && model.loading ? (
        <LoadingBox text="Loading line…" />
      ) : d == null ? (
        <MessageBox title="Line unavailable" body={model.error} action="Retry" onAction={model.retry} />
      ) : (
        <LineBody model={model} d={d} color={color} now={now} />
      )}
    </View>
  );
}

/** The map, with the stops and timetable in a sheet over it that can be dragged down (or hidden) to enlarge the map. */
function LineBody({ model, d, color, now }: { model: LineModel; d: LineDetail; color: string; now: Instant }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const stops = d.stops.map((s) => ({ lat: s.lat, lon: s.lon }));
  // Keep following only while that vehicle is still reported.
  const followed = model.vehicles.find((v) => mapId(v) === model.following) ?? null;
  return (
    <MapSheet
      peekFraction={0.62}
      topGap={8}
      scroll={false}
      map={(c) => (
        <View style={StyleSheet.absoluteFill}>
          <TransitMap
            style={StyleSheet.absoluteFill}
            lines={[{ points: d.timeline.line, color, width: 5 }]}
            markers={stops.map((p, i) => ({ point: p, color, kind: i === 0 || i === stops.length - 1 ? 'STOP' : 'STOP_SMALL' }))}
            vehicles={model.vehicles.map((v) => ({
              id: mapId(v),
              point: { lat: v.vehicle.lat, lon: v.vehicle.lon },
              bearing: v.vehicle.bearing,
              color,
              label: routeLabel(d.route),
              faded: progressFreshness(v.progress, now) === 'STALE',
            }))}
            fitPoints={stops}
            fitKey={`${d.route.gtfsRouteId}-${c.mapOnly}`}
            contentPadding={{ top: followed ? 56 : 0, bottom: c.mapOnly ? 72 : c.peekHeight }}
            focusVehicleId={followed ? mapId(followed) : null}
            onUserPan={() => model.setFollowing(null)}
            onMarkerPress={(id) => model.vehicles.some((v) => mapId(v) === id) && model.setFollowing(id)}
            compassStyle={{ top: 64, right: 12 }}
          />
          {followed != null && (
            <View style={{ position: 'absolute', top: 8, left: 60, right: 60 }}>
              <LiveLocationCard
                title={`${routeLabel(d.route)} live location` + (followed.ride ? ` · left ${Fmt.time(followed.ride.departure)}` : '')}
                recordedAt={followed.vehicle.recordedAt}
                onClose={() => model.setFollowing(null)}
              />
            </View>
          )}
        </View>
      )}
      overlay={(c) => (
        <>
          <FollowPeek following={model.following} peek={c.peek} />
          <View style={{ position: 'absolute', top: 8, right: 8 }}>
            <IconButton icon={c.mapOnly ? 'fullscreen-exit' : 'fullscreen'} label={c.mapOnly ? 'Show stops' : 'Expand map'} onPress={() => (c.mapOnly ? c.show() : c.hide())} filled testID="line_map_expand" />
          </View>
          {c.mapOnly && (
            <Pressable onPress={c.show} style={[styles.fab, { backgroundColor: t.c.surface, bottom: insets.bottom + 16 }]} accessibilityRole="button">
              <Icon name="expand-less" color={t.c.onSurface} />
              <Txt v="labelLarge" style={{ marginLeft: 8 }}>
                {model.tab === 0 ? 'Stops' : 'Timetable'}
              </Txt>
            </Pressable>
          )}
        </>
      )}
    >
      <View style={{ flex: 1 }}>
        <View style={[styles.tabs, { borderBottomColor: t.x.divider }]}>
          {(['Stops', 'Timetable'] as const).map((label, i) => (
            <Pressable key={label} onPress={() => model.setTab(i as 0 | 1)} style={styles.tab} accessibilityRole="tab" accessibilityState={{ selected: model.tab === i }}>
              <Txt v="titleSmall" color={model.tab === i ? t.c.primary : t.c.onSurfaceVariant}>
                {label}
              </Txt>
              {model.tab === i && <View style={[styles.indicator, { backgroundColor: t.c.primary }]} />}
            </Pressable>
          ))}
        </View>
        {model.tab === 0 ? <StopsList model={model} d={d} color={color} now={now} /> : <Timetable model={model} d={d} now={now} />}
      </View>
    </MapSheet>
  );
}

/** Following a vehicle needs the map in view. */
function FollowPeek({ following, peek }: { following: string | null; peek: () => void }) {
  useEffect(() => {
    if (following != null) peek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [following]);
  return null;
}

function StopsList({ model, d, color, now }: { model: LineModel; d: LineDetail; color: string; now: Instant }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const rail: RailSpec = { style: 'SOLID', color };
  const byGap = new Map<number, LineVehicle[]>();
  for (const v of model.vehicles) byGap.set(v.progress.lastPassed, [...(byGap.get(v.progress.lastPassed) ?? []), v]);
  const last = d.stops.length - 1;
  return (
    <BottomSheetFlatList
      data={d.stops}
      keyExtractor={(s: LineStop, i: number) => `${i}-${s.gtfsStopId}`}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 + insets.bottom }}
      testID="line_stops"
      renderItem={({ item: s, index: i }: { item: LineStop; index: number }) => {
        const arrivals = repo.arrivalsAt(d, model.vehicles, i, now);
        const next = arrivals[0];
        return (
          <View>
            {/* Vehicles approaching this stop (between stop i-1 and i). */}
            {(byGap.get(i - 1) ?? []).map((v) => (
              <VehicleRow key={mapId(v)} v={v} rail={rail} color={color} label={routeLabel(d.route)} mode={d.route.mode} now={now} onPress={() => model.setFollowing(mapId(v))} />
            ))}
            <TimelineRow
              above={i === 0 ? null : rail}
              below={i === last ? null : rail}
              node={i === 0 || i === last ? 'TERMINUS' : 'STOP'}
              nodeColor={color}
              timeWidth={12}
              onPress={() => model.toggleExpanded(i)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 11 }}>
                <View style={{ flex: 1 }}>
                  <Txt v="bodyLarge" numberOfLines={1}>
                    {s.name}
                  </Txt>
                  <Txt v="bodySmall" color={t.x.subtle}>
                    {[s.city, `#${s.code}`].filter((x) => x != null).join(' · ')}
                  </Txt>
                </View>
                {next != null && (
                  <View style={{ alignItems: 'flex-end' }}>
                    {/* Tapping a live time follows that vehicle on the map above. */}
                    <ArrivalTime
                      text={Fmt.relative(next.time, now)}
                      freshness={arrivalFreshness(next, now)}
                      v="titleSmall"
                      onPress={next.live ? () => model.follow(next.journeyRef) : undefined}
                    />
                    {!next.live && (
                      <Txt v="labelSmall" color={t.x.subtle}>
                        scheduled
                      </Txt>
                    )}
                  </View>
                )}
              </View>
              {model.expanded === i && (
                <View style={{ paddingBottom: 12 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {arrivals.map((a, k) => {
                      const f = arrivalFreshness(a, now);
                      const pill = <Pill text={(a.live ? '● ' : '') + Fmt.time(a.time)} color={a.live ? freshnessColor(f, t) : t.x.subtle} />;
                      return a.live ? (
                        <Pressable key={k} onPress={() => model.follow(a.journeyRef)} accessibilityHint="Show on map">
                          {pill}
                        </Pressable>
                      ) : (
                        <View key={k}>{pill}</View>
                      );
                    })}
                    {arrivals.length === 0 && (
                      <Txt v="bodySmall" color={t.x.subtle}>
                        No more trips today
                      </Txt>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-start', marginLeft: -12 }}>
                    <TextButton text="All departures from this stop" onPress={() => void model.openStop(s)} />
                  </View>
                </View>
              )}
            </TimelineRow>
          </View>
        );
      }}
    />
  );
}

function VehicleRow({
  v,
  rail,
  color,
  label,
  mode,
  now,
  onPress,
}: {
  v: LineVehicle;
  rail: RailSpec;
  color: string;
  label: string;
  mode: LineRoute['mode'];
  now: Instant;
  onPress: () => void;
}) {
  const t = useTheme();
  const f = progressFreshness(v.progress, now);
  const accent = readableAccent(color, t);
  return (
    <TimelineRow above={rail} below={rail} node="VEHICLE" nodeColor={color} timeWidth={12} nodeY={18} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }} accessibilityHint="Show on map">
        <View style={[styles.vehicleTag, { backgroundColor: alpha(color, 0.12) }]}>
          <Icon name={modeIcon(mode)} size={16} color={accent} />
          <Txt v="labelMedium" color={accent} style={{ marginLeft: 4, fontWeight: '700' }}>
            {label}
          </Txt>
        </View>
        <View style={{ width: 14 }} />
        <LiveSignal freshness={f} size={12} />
        {f === 'STALE' && (
          <Txt v="labelSmall" color={t.x.stale} style={{ marginLeft: 4 }}>{`last seen ${Fmt.time(v.vehicle.recordedAt)}`}</Txt>
        )}
      </View>
    </TimelineRow>
  );
}

function Timetable({ model, d, now }: { model: LineModel; d: LineDetail; now: Instant }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const liveRefs = new Set(model.vehicles.map((v) => v.ride?.journeyRef).filter((x) => x != null));
  const byHour = new Map<number, Ride[]>();
  for (const r of d.rides) {
    const h = localParts(r.departure).hour;
    byHour.set(h, [...(byHour.get(h) ?? []), r]);
  }
  const hours = [...byHour.keys()].sort((a, b) => a - b);
  const list = useRef<{ scrollToIndex: (o: { index: number; animated: boolean }) => void } | null>(null);
  // Open at the current hour (item 0 is the header).
  const currentHour = localParts(now).hour;
  const k = hours.findIndex((h) => h >= currentHour);
  const startIndex = k < 0 ? 0 : k + 1;
  useEffect(() => {
    if (startIndex > 0) setTimeout(() => list.current?.scrollToIndex({ index: startIndex, animated: false }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  type Item = { kind: 'head' } | { kind: 'hour'; hour: number };
  const items: Item[] = [{ kind: 'head' }, ...hours.map((h) => ({ kind: 'hour' as const, hour: h }))];
  return (
    <BottomSheetFlatList
      ref={list as never}
      data={items}
      keyExtractor={(i: Item) => (i.kind === 'head' ? 'head' : `h${i.hour}`)}
      onScrollToIndexFailed={() => {}}
      contentContainerStyle={{ padding: 16, paddingBottom: 16 + insets.bottom }}
      renderItem={({ item }: { item: Item }) =>
        item.kind === 'head' ? (
          <View>
            <Txt v="titleSmall" style={{ marginBottom: 12 }}>{`Departures from ${d.stops[0].name} · ${Fmt.day(d.route.date)}`}</Txt>
            {d.rides.length === 0 && <MessageBox title="No departures listed for today" />}
          </View>
        ) : (
          <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
            <Txt v="titleMedium" num color={t.x.subtle} style={{ width: 40, paddingTop: 4 }}>
              {String(item.hour).padStart(2, '0')}
            </Txt>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {(byHour.get(item.hour) ?? []).map((ride) => {
                const live = liveRefs.has(ride.journeyRef);
                const past = ride.departure < now && !live;
                return (
                  <Pressable
                    key={ride.journeyRef}
                    onPress={() => void model.openRide(ride)}
                    style={[styles.rideChip, { backgroundColor: live ? alpha(t.x.live, 0.14) : t.c.surfaceVariant, opacity: past ? 0.4 : 1 }]}
                    accessibilityRole="button"
                  >
                    {live && (
                      <View style={{ marginRight: 5 }}>
                        <LiveDot />
                      </View>
                    )}
                    <Txt v="bodyMedium" num>
                      {Fmt.time(ride.departure)}
                    </Txt>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingTop: 12 },
  indicator: { height: 3, width: 48, borderTopLeftRadius: 3, borderTopRightRadius: 3, marginTop: 10 },
  vehicleTag: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  rideChip: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
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
});
