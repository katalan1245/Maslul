import { BottomSheetFlatList } from '@gorhom/bottom-sheet';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S } from '../../i18n';
import { bestTime } from '../../data/eta';
import { callFreshness, callRecordedAt } from '../../data/freshness';
import { type Place, platformLabel, placePoint } from '../../data/models';
import type { Instant } from '../../data/time';
import type { BoardEntry } from '../../data/transitRepository';
import { WALK_SPEEDS } from '../../data/userStore';
import { canNotify } from '../../live/notifications';
import { location, useLastLocation } from '../../state/location';
import { repo } from '../../state/services';
import { store, useUserData } from '../../state/store';
import { Fmt, modeLine } from '../fmt';
import { Hairline, IconButton, LineBadge, LoadingBox, MessageBox, ProgressBar, Txt } from '../components/common';
import { FAVORITE_GOLD } from '../components/favorites';
import { Icon } from '../components/icons';
import { ArrivalTime, freshnessColor, useNow } from '../components/live';
import { MapSheet } from '../components/MapSheet';
import { Menu } from '../components/overlays';
import { ExactAlarmDialog, setReminder, stopReminderAt } from '../components/reminders';
import { TransitMap } from '../map/TransitMap';
import { Model, useModel } from '../model';
import { CURRENT_LOCATION, type RootStack, nav } from '../nav';
import { ModeColors, lineColorOf, useTheme } from '../theme';

class StopModel extends Model {
  entries: BoardEntry[] = [];
  loading = true;
  error: string | null = null;

  constructor(readonly place: Place) {
    super();
  }

  override start() {
    void this.refresh();
    this.every(30_000, () => void this.refresh());
  }

  refresh = async () => {
    const id = this.place.stopId;
    if (id == null) {
      this.error = S.stopBoard.unknown;
      this.loading = false;
      this.changed();
      return;
    }
    try {
      this.entries = await repo.stopBoard(id);
      this.error = null;
    } catch {
      if (this.entries.length === 0) this.error = S.stopBoard.loadFailed;
    }
    this.loading = false;
    this.changed();
  };

  /** After a reminder was set without "Alarms & reminders": offer to allow it. */
  askExactAlarm = false;

  async remind(e: BoardEntry) {
    if (await remindToLeave(e, this.place)) {
      this.askExactAlarm = true;
      this.changed();
    }
  }

  closeExactAlarm = () => {
    this.askExactAlarm = false;
    this.changed();
  };

  /** Opens the trip; with [focusVehicle] its map zooms to the live vehicle and follows it. */
  open = (e: BoardEntry, focusVehicle = false) => nav.push('Trip', { tripId: e.departure.tripId, boardStopId: this.place.stopId, focusVehicle });
}

/** Departures grouped per line+direction, next few times each. */
export interface BoardGroup {
  key: string;
  entries: BoardEntry[];
}

/** A reminder to leave for [e] at [stop], the walk there from the last location included; true to offer exact alarms. */
export async function remindToLeave(e: BoardEntry, stop: Place): Promise<boolean> {
  await canNotify(true);
  const settings = store.value.settings;
  const departs = entryTime(e);
  const { leaveAt, at } = stopReminderAt(departs, placePoint(stop), location.last, WALK_SPEEDS[settings.walkSpeed].mps, settings.reminderMinutes);
  const d = e.departure;
  const text = S.detail.reminder(Fmt.time(leaveAt), modeLine(d.mode, d.lineLabel), stop.name, Fmt.time(departs));
  return setReminder(at, S.detail.reminderTitle(stop.name), text);
}

export const entryTime = (e: BoardEntry) => (e.live ? bestTime(e.live) : e.departure.scheduled);

export function boardGroups(entries: BoardEntry[]): BoardGroup[] {
  const groups: BoardGroup[] = [];
  for (const e of entries) {
    const key = `${e.departure.routeId}|${e.departure.headsign}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.entries.push(e);
    else groups.push({ key, entries: [e] });
  }
  return groups.sort((a, b) => entryTime(a.entries[0]) - entryTime(b.entries[0]));
}

export function StopScreen({ route }: NativeStackScreenProps<RootStack, 'Stop'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const user = useLastLocation();
  const model = useModel(() => new StopModel(route.params.place));
  const now = useNow(10_000);
  const place = model.place;
  const fav = data.favoriteStops.some((s) => s.stopId === place.stopId);
  const [menuFor, setMenuFor] = useState<BoardEntry | null>(null);
  const groups = boardGroups(model.entries);

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="stop_screen">
      <View style={[styles.header, { backgroundColor: t.c.surface, paddingTop: insets.top + 4 }]}>
        <IconButton icon="arrow-back" label={S.common.back} onPress={nav.pop} />
        <View style={{ flex: 1 }}>
          <Txt v="titleMedium" numberOfLines={1}>
            {place.name}
          </Txt>
          {place.subtitle != null && (
            <Txt v="bodySmall" color={t.x.subtle}>
              {place.subtitle}
            </Txt>
          )}
        </View>
        <IconButton
          icon={fav ? 'star' : 'star-border'}
          label={S.stopBoard.favorite}
          selected={fav}
          color={fav ? FAVORITE_GOLD : t.c.onSurfaceVariant}
          onPress={() => store.toggleFavoriteStop(place)}
          testID="favorite_stop"
        />
      </View>
      {/* The map, with the departures in a sheet over it that can be dragged down (or hidden) to enlarge the map, as on a line. */}
      <MapSheet
        peekFraction={0.7}
        topGap={8}
        scroll={false}
        map={(c) => (
          <TransitMap
            style={StyleSheet.absoluteFill}
            markers={[{ point: placePoint(place), color: ModeColors[place.mode ?? 'BUS'], kind: 'STOP', id: place.stopId }]}
            user={user}
            initialCenter={placePoint(place)}
            initialZoom={16}
            // The stop stays in the middle of what's in view: above the sheet, or the whole map.
            fitPoints={[placePoint(place)]}
            fitKey={`${place.stopId}-${c.mapOnly}`}
            contentPadding={{ top: 0, bottom: c.mapOnly ? 72 : c.peekHeight }}
            compassStyle={{ top: 64, right: 12 }}
          />
        )}
        overlay={(c) => (
          <>
            <View style={{ position: 'absolute', top: 8, right: 8 }}>
              <IconButton
                icon={c.mapOnly ? 'fullscreen-exit' : 'fullscreen'}
                label={c.mapOnly ? S.stopBoard.showDepartures : S.detail.expandMap}
                onPress={() => (c.mapOnly ? c.show() : c.hide())}
                filled
                testID="stop_map_expand"
              />
            </View>
            {c.mapOnly && (
              <Pressable onPress={c.show} style={[styles.fab, { left: 16, backgroundColor: t.c.surface, bottom: insets.bottom + 16 }]} accessibilityRole="button">
                <Icon name="expand-less" color={t.c.onSurface} />
                <Txt v="labelLarge" style={{ marginLeft: 8 }}>
                  {S.stopBoard.showDepartures}
                </Txt>
              </Pressable>
            )}
          </>
        )}
      >
        <View style={{ flex: 1 }}>
          <ProgressBar active={model.loading} />
          {model.loading && model.entries.length === 0 ? (
            <LoadingBox text={S.stopBoard.loading} />
          ) : model.error != null ? (
            <MessageBox title={S.stopBoard.noDepartures} body={model.error} action={S.common.retry} onAction={() => void model.refresh()} />
          ) : groups.length === 0 ? (
            <MessageBox title={S.stopBoard.noUpcoming} body={S.stopBoard.noUpcomingHint} />
          ) : (
            <BottomSheetFlatList
              data={groups}
              keyExtractor={(g: BoardGroup) => g.key}
              renderItem={({ item }: { item: BoardGroup }) => (
                <>
                  <BoardRow
                    group={item}
                    now={now}
                    onTimePress={() => model.open(item.entries[0], true)}
                    onPress={() => model.open(item.entries[0])}
                    onLongPress={() => setMenuFor(item.entries[0])}
                  />
                  <Hairline start={20} />
                </>
              )}
              contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
              testID="stop_board"
            />
          )}
        </View>
      </MapSheet>
      <Pressable
        onPress={() => nav.push('Routes', { from: CURRENT_LOCATION, to: place })}
        style={[styles.fab, { right: 16, backgroundColor: t.c.primaryContainer, bottom: insets.bottom + 16 }]}
        accessibilityRole="button"
        testID="stop_directions"
      >
        <Icon name="directions" color={t.c.onPrimaryContainer} />
        <Txt v="labelLarge" color={t.c.onPrimaryContainer} style={{ marginLeft: 8 }}>
          {S.stopBoard.directions}
        </Txt>
      </Pressable>
      <Menu
        visible={menuFor != null}
        onDismiss={() => setMenuFor(null)}
        items={[{ text: S.stopBoard.remindLeave, icon: 'alarm-add', onPress: () => menuFor && void model.remind(menuFor), testID: 'remind_leave' }]}
      />
      <ExactAlarmDialog visible={model.askExactAlarm} onClose={model.closeExactAlarm} />
    </View>
  );
}


/** The ride after the first, at a later minute (two trips can share one, F15). */
export const nextEntry = (entries: BoardEntry[]): BoardEntry | null =>
  entries.slice(1).find((e) => Fmt.time(entryTime(e)) !== Fmt.time(entryTime(entries[0]))) ?? null;

export function BoardRow({
  group,
  now,
  onTimePress,
  onPress,
  onLongPress,
}: {
  group: BoardGroup;
  now: Instant;
  onTimePress: () => void;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const t = useTheme();
  const first = group.entries[0];
  const d = first.departure;
  const live = first.live;
  const time = entryTime(first);
  const next = nextEntry(group.entries);
  const nextLive = next?.live?.status === 'LIVE' ? next.live : null;
  const freshness = callFreshness(live, now);
  let sub: string;
  if (live?.status === 'LIVE') {
    const rec = callRecordedAt(live);
    const away = live.stopsAway != null && live.stopsAway >= 1 && live.stopsAway <= 40 ? live.stopsAway : null;
    sub = freshness === 'STALE' && rec != null ? Fmt.ago(rec, now).toLowerCase() : away != null ? S.cards.stopsAway(away) : S.stopBoard.live;
  } else if (live?.status === 'UNTRACKED') sub = S.stopBoard.noLiveData;
  else sub = time - now < 3600 ? Fmt.time(time) : S.stopBoard.scheduled;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityHint={onLongPress ? S.stopBoard.remindHint : undefined}
      // Spelled out: the live time inside is its own button, which left this row unlabelled for TalkBack.
      accessibilityLabel={[d.lineLabel, d.headsign, Fmt.relative(time, now), sub].join(', ')}
      style={styles.row}
      accessibilityRole="button"
      testID="board_row"
    >
      <View style={{ minWidth: 64 }}>
        <LineBadge label={d.lineLabel} mode={d.mode} color={lineColorOf(d.mode, d.routeColor, d.agencyId, d.agency)} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt v="bodyMedium" style={{ fontWeight: '500' }} numberOfLines={1}>
          {d.headsign}
        </Txt>
        <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>
          {[platformLabel(d.stop), d.agency].filter((x) => x != null).join(' · ')}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
        {/* Tapping a live time shows that vehicle on the trip map; timetable times just open the trip. */}
        <ArrivalTime text={Fmt.relative(time, now)} freshness={freshness} onPress={live?.vehicle != null && live.status === 'LIVE' ? onTimePress : undefined} />
        <Txt v="labelSmall" color={t.x.subtle}>
          {sub}
        </Txt>
        {/* And the one after it, live when tracked. */}
        {next != null && (
          <Txt v="labelMedium" color={nextLive != null ? freshnessColor(callFreshness(nextLive, now), t) : t.x.subtle} style={{ marginTop: 2 }} testID="next_arrival">
            {S.common.then(Fmt.relative(nextLive != null ? bestTime(nextLive) : next.departure.scheduled, now))}
          </Txt>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  fab: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 20,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
