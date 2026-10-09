import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Freshness } from '../../data/freshness';
import type { GeoPoint, Place, TransitMode } from '../../data/models';
import { vehicle as vehicleWord } from '../../data/models';
import { type BoardCandidate, candidateKey } from '../../data/onBoard';
import type { Instant } from '../../data/time';
import { location } from '../../state/location';
import { repo } from '../../state/services';
import { Fmt, modeName } from '../fmt';
import { Chip, IconButton, LineBadge, LoadingBox, MessageBox, SearchBox, Txt } from '../components/common';
import { modeIcon } from '../components/icons';
import { LiveSignal, freshnessColor, useNow } from '../components/live';
import { Model, useModel } from '../model';
import { type RootStack, nav } from '../nav';
import { lineColorOf, useTheme } from '../theme';

/** "On bus 480 to Haifa", "On the train to Nahariya". */
export function boardName(c: BoardCandidate): string {
  const ride =
    c.lineLabel.toLowerCase() === modeName(c.mode).toLowerCase() || c.lineLabel === '—' ? `the ${vehicleWord(c.mode)}` : `${vehicleWord(c.mode)} ${c.lineLabel}`;
  return `On ${ride}` + (c.headsign.trim() !== '' ? ` to ${c.headsign}` : '');
}

/**
 * "Which ride are you on?": the buses and trains around the user, live ones nearest first,
 * to start a trip from. [onPicked] gets an ON_BOARD place for the chosen ride.
 */
class OnBoardModel extends Model {
  loading = true;
  error: string | null = null;
  candidates: BoardCandidate[] = [];
  query = '';
  mode: TransitMode | null = null;
  /** The candidate whose timetable is being looked up after a tap. */
  picking: string | null = null;
  private here: GeoPoint | null = null;
  /** Trips of live vehicles not on the timetable around you, by key; null when it has none. */
  private readonly resolved = new Map<string, string | null>();
  private resolving = 0;

  constructor(private readonly onPicked: (p: Place) => void) {
    super();
    void this.refresh();
  }

  override start() {
    // Vehicles move along with you: keep the list current.
    this.every(30_000, () => {
      if (this.picking == null) void this.refresh(true);
    });
  }

  refresh = async (quiet = false) => {
    if (!quiet) this.loading = true;
    this.error = null;
    this.changed();
    const p = (await location.current().catch(() => null)) ?? location.last;
    if (p == null) {
      this.error = "Your location is needed to find the ride you're on.";
      this.loading = false;
      this.changed();
      return;
    }
    this.here = p;
    try {
      this.candidates = this.tidy(await repo.boardCandidates(p));
      void this.resolveLoose();
    } catch {
      if (this.candidates.length === 0) this.error = "Couldn't look for rides. Check your connection.";
    }
    this.loading = false;
    this.changed();
  };

  /**
   * Live vehicles the timetable around you didn't account for, with what's known of their trips:
   * found ones get it, ones without one (often a bus that just ended its trip here) are left out,
   * and one that turns out to be a ride already listed from the timetable replaces that row.
   */
  private tidy(list: BoardCandidate[]): BoardCandidate[] {
    const withTrips = list.flatMap((c): BoardCandidate[] => {
      if (c.tripId != null || !this.resolved.has(candidateKey(c))) return [c];
      const trip = this.resolved.get(candidateKey(c));
      return trip != null ? [{ ...c, tripId: trip }] : [];
    });
    const live = new Set(withTrips.filter((c) => c.vehicle != null && c.tripId != null).map((c) => c.tripId));
    const kept = withTrips.filter((c) => c.vehicle != null || !live.has(c.tripId));
    return kept.filter((c, i) => kept.findIndex((x) => (x.tripId ?? candidateKey(x)) === (c.tripId ?? candidateKey(c))) === i);
  }

  /** Looks up the trips of live-only rows in the background, nearest first, so every row can be picked. */
  private async resolveLoose() {
    const job = ++this.resolving;
    for (const c of this.candidates.filter((x) => x.tripId == null && !this.resolved.has(candidateKey(x))).slice(0, 12)) {
      const trip = await repo.boardTripId(c).catch(() => null);
      if (job !== this.resolving || this.disposed) return;
      this.resolved.set(candidateKey(c), trip);
      this.candidates = this.tidy(this.candidates);
      this.changed();
    }
  }

  get modes(): TransitMode[] {
    return [...new Set(this.candidates.map((c) => c.mode))];
  }

  get shown(): BoardCandidate[] {
    const q = this.query.trim().toLowerCase();
    return this.candidates
      .filter((c) => this.mode == null || c.mode === this.mode)
      .filter((c) => q === '' || c.lineLabel.toLowerCase().includes(q) || c.headsign.toLowerCase().includes(q));
  }

  setQuery = (q: string) => {
    this.query = q;
    this.changed();
  };

  setMode = (m: TransitMode) => {
    this.mode = this.mode === m ? null : m;
    this.changed();
  };

  pick = async (c: BoardCandidate) => {
    if (this.picking != null) return;
    this.picking = candidateKey(c);
    this.changed();
    const tripId = c.tripId ?? this.resolved.get(candidateKey(c)) ?? (await repo.boardTripId(c).catch(() => null));
    this.picking = null;
    this.changed();
    const p = this.here;
    if (tripId == null || p == null) {
      this.error = `Couldn't find the timetable of ${modeName(c.mode)} ${c.lineLabel}. Try another, or refresh.`;
      this.changed();
      return;
    }
    this.onPicked({ name: boardName(c), lat: p.lat, lon: p.lon, kind: 'ON_BOARD', tripId });
  };
}

export function OnBoardScreen({ route }: NativeStackScreenProps<RootStack, 'OnBoard'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const model = useModel(() => new OnBoardModel(route.params.onPicked));
  const now = useNow(15_000);
  const shown = model.shown;
  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="onboard_screen">
      <View style={[styles.header, { backgroundColor: t.c.surface, paddingTop: insets.top + 4 }]}>
        <View style={styles.titleRow}>
          <IconButton icon="arrow-back" label="Back" onPress={nav.pop} />
          <View style={{ flex: 1 }}>
            <Txt v="titleLarge">Which ride are you on?</Txt>
            <Txt v="bodySmall" color={t.x.subtle}>
              Plan the rest of your trip from it
            </Txt>
          </View>
          <IconButton icon="refresh" label="Refresh" onPress={() => void model.refresh()} disabled={model.loading} />
        </View>
        <SearchBox query={model.query} onQuery={model.setQuery} placeholder="Line number or destination" testID="onboard_filter" />
        {model.modes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 10 }}>
            {model.modes.map((m) => (
              <Chip key={m} label={modeName(m)} icon={modeIcon(m)} selected={model.mode === m} onPress={() => model.setMode(m)} />
            ))}
          </ScrollView>
        )}
      </View>
      {model.loading ? (
        <LoadingBox text="Looking for rides around you…" />
      ) : model.candidates.length === 0 && model.error != null ? (
        <MessageBox title="Can't tell which ride" body={model.error} action="Try again" onAction={() => void model.refresh()} />
      ) : model.candidates.length === 0 ? (
        <MessageBox
          title="No rides found around you"
          body="Rides show up here while you're on a bus or train, or at a stop one is due at."
          icon="directions-bus"
          action="Refresh"
          onAction={() => void model.refresh()}
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={candidateKey}
          testID="onboard_list"
          ListHeaderComponent={
            <>
              {model.error != null && (
                <Txt v="bodySmall" color={t.x.late} style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
                  {model.error}
                </Txt>
              )}
              {shown.length === 0 && (
                <Txt v="bodyMedium" color={t.x.subtle} style={{ padding: 20 }}>
                  Nothing matches. Clear the filter to see every ride around you.
                </Txt>
              )}
            </>
          }
          renderItem={({ item }) => <CandidateRow c={item} now={now} busy={model.picking === candidateKey(item)} onPress={() => void model.pick(item)} />}
          ListFooterComponent={
            <Txt v="labelSmall" color={t.x.subtle} style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 + insets.bottom }}>
              Live buses closest to you come first. After you pick one, the trip is planned from its next stop: stay on, or where to get off and change.
            </Txt>
          }
        />
      )}
    </View>
  );
}

function CandidateRow({ c, now, busy, onPress }: { c: BoardCandidate; now: Instant; busy: boolean; onPress: () => void }) {
  const t = useTheme();
  const v = c.vehicle;
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button" testID="board_candidate">
      <LineBadge label={c.lineLabel} mode={c.mode} color={lineColorOf(c.mode, c.routeColor, c.agencyId, c.agencyName)} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt v="bodyLarge" style={{ fontWeight: '500' }} numberOfLines={1}>
          {c.headsign.trim() !== '' ? `to ${c.headsign}` : modeName(c.mode)}
        </Txt>
        {v != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <LiveSignal freshness={Freshness.of(v.recordedAt, now)} />
            <Txt v="bodySmall" color={freshnessColor(Freshness.of(v.recordedAt, now), t)} style={{ marginLeft: 4 }}>
              {`Live · ${Fmt.distance(c.distanceM)} from you`}
            </Txt>
          </View>
        ) : (
          <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>
            {([c.stopName != null ? `Due at ${c.stopName}` : null, c.stopTime != null ? Fmt.time(c.stopTime) : null].filter((x) => x != null).join(' · ') ||
              'Timetable') + ' · no live data'}
          </Txt>
        )}
      </View>
      {busy && <ActivityIndicator color={t.c.primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 10, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  titleRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
});
