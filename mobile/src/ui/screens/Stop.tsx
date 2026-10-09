import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bestTime } from '../../data/eta';
import { callFreshness, callRecordedAt } from '../../data/freshness';
import { type Place, platformLabel, placePoint } from '../../data/models';
import type { Instant } from '../../data/time';
import type { BoardEntry } from '../../data/transitRepository';
import { useLastLocation } from '../../state/location';
import { repo } from '../../state/services';
import { store, useUserData } from '../../state/store';
import { Fmt } from '../fmt';
import { Hairline, IconButton, LineBadge, LoadingBox, MessageBox, ProgressBar, Txt } from '../components/common';
import { FAVORITE_GOLD } from '../components/favorites';
import { Icon } from '../components/icons';
import { ArrivalTime, useNow } from '../components/live';
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
      this.error = 'Unknown stop';
      this.loading = false;
      this.changed();
      return;
    }
    try {
      this.entries = await repo.stopBoard(id);
      this.error = null;
    } catch {
      if (this.entries.length === 0) this.error = "Couldn't load departures";
    }
    this.loading = false;
    this.changed();
  };

  /** Opens the trip; with [focusVehicle] its map zooms to the live vehicle and follows it. */
  open = (e: BoardEntry, focusVehicle = false) => nav.push('Trip', { tripId: e.departure.tripId, boardStopId: this.place.stopId, focusVehicle });
}

/** Departures grouped per line+direction, next few times each. */
interface BoardGroup {
  key: string;
  entries: BoardEntry[];
}

const entryTime = (e: BoardEntry) => (e.live ? bestTime(e.live) : e.departure.scheduled);

export function StopScreen({ route }: NativeStackScreenProps<RootStack, 'Stop'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const user = useLastLocation();
  const model = useModel(() => new StopModel(route.params.place));
  const now = useNow(10_000);
  const place = model.place;
  const fav = data.favoriteStops.some((s) => s.stopId === place.stopId);
  const groups: BoardGroup[] = [];
  for (const e of model.entries) {
    const key = `${e.departure.routeId}|${e.departure.headsign}`;
    const g = groups.find((x) => x.key === key);
    if (g) g.entries.push(e);
    else groups.push({ key, entries: [e] });
  }
  groups.sort((a, b) => entryTime(a.entries[0]) - entryTime(b.entries[0]));

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="stop_screen">
      <View style={[styles.header, { backgroundColor: t.c.surface, paddingTop: insets.top + 4 }]}>
        <IconButton icon="arrow-back" label="Back" onPress={nav.pop} />
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
          label="Favorite stop"
          color={fav ? FAVORITE_GOLD : t.c.onSurfaceVariant}
          onPress={() => store.toggleFavoriteStop(place)}
          testID="favorite_stop"
        />
      </View>
      <TransitMap
        style={{ height: 160 }}
        markers={[{ point: placePoint(place), color: ModeColors.BUS, kind: 'STOP', id: place.stopId }]}
        user={user}
        initialCenter={placePoint(place)}
        initialZoom={16}
        compassStyle={{ bottom: 8, right: 8 }}
      />
      <ProgressBar active={model.loading} />
      {model.loading && model.entries.length === 0 ? (
        <LoadingBox text="Loading departures…" />
      ) : model.error != null ? (
        <MessageBox title="No departures" body={model.error} action="Retry" onAction={() => void model.refresh()} />
      ) : groups.length === 0 ? (
        <MessageBox title="No upcoming departures" body="Nothing scheduled from this stop in the next hours." />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.key}
          renderItem={({ item }) => (
            <>
              <BoardRow group={item} now={now} onTimePress={() => model.open(item.entries[0], true)} onPress={() => model.open(item.entries[0])} />
              <Hairline start={20} />
            </>
          )}
          contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
          testID="stop_board"
        />
      )}
      <Pressable
        onPress={() => nav.push('Routes', { from: CURRENT_LOCATION, to: place })}
        style={[styles.fab, { backgroundColor: t.c.primaryContainer, bottom: insets.bottom + 16 }]}
        accessibilityRole="button"
        testID="stop_directions"
      >
        <Icon name="directions" color={t.c.onPrimaryContainer} />
        <Txt v="labelLarge" color={t.c.onPrimaryContainer} style={{ marginLeft: 8 }}>
          Directions
        </Txt>
      </Pressable>
    </View>
  );
}

function BoardRow({ group, now, onTimePress, onPress }: { group: BoardGroup; now: Instant; onTimePress: () => void; onPress: () => void }) {
  const t = useTheme();
  const first = group.entries[0];
  const d = first.departure;
  const later = group.entries
    .slice(1, 3)
    .map((e) => Fmt.time(entryTime(e)))
    .join('  ');
  const live = first.live;
  const time = entryTime(first);
  const freshness = callFreshness(live, now);
  let sub: string;
  if (live?.status === 'LIVE') {
    const rec = callRecordedAt(live);
    sub = freshness === 'STALE' && rec != null ? Fmt.ago(rec, now).toLowerCase() : 'live';
  } else if (live?.status === 'UNTRACKED') sub = 'no live data';
  else sub = time - now < 3600 ? Fmt.time(time) : 'scheduled';
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button" testID="board_row">
      <View style={{ minWidth: 64 }}>
        <LineBadge label={d.lineLabel} mode={d.mode} color={lineColorOf(d.mode, d.routeColor, d.agencyId, d.agency)} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt v="bodyMedium" style={{ fontWeight: '500' }} numberOfLines={1}>
          {d.headsign}
        </Txt>
        <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>
          {[platformLabel(d.stop), d.agency, later.trim() !== '' ? `then ${later}` : null].filter((x) => x != null).join(' · ')}
        </Txt>
      </View>
      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
        {/* Tapping a live time shows that vehicle on the trip map; timetable times just open the trip. */}
        <ArrivalTime text={Fmt.relative(time, now)} freshness={freshness} onPress={live?.vehicle != null && live.status === 'LIVE' ? onTimePress : undefined} />
        <Txt v="labelSmall" color={t.x.subtle}>
          {sub}
        </Txt>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  fab: {
    position: 'absolute',
    right: 16,
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
