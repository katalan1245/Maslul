import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Freshness } from '../../data/freshness';
import type { GeoPoint, Place, TransitMode } from '../../data/models';
import { vehicleKind } from '../../data/models';
import { S } from '../../i18n';
import { type BoardCandidate, OnBoard, candidateKey } from '../../data/onBoard';
import { type Instant, nowSec } from '../../data/time';
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
  const named = c.lineLabel.toLowerCase() !== modeName(c.mode).toLowerCase() && c.lineLabel !== '—';
  return S.onBoard.ride(vehicleKind(c.mode), named ? c.lineLabel : null, c.headsign.trim() !== '' ? c.headsign : null);
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
  /** Which way you're moving (degrees from north), once it's known: rides going the other way go last. */
  heading: number | null = null;
  private here: GeoPoint | null = null;
  /** Trips of live vehicles not on the timetable around you, by key; null when it has none. */
  private readonly resolved = new Map<string, string | null>();
  private resolving = 0;

  constructor(private readonly onPicked: (p: Place) => void) {
    super();
    void this.refresh();
  }

  override start() {
    // Follows your position while the list is open, to learn which way you're going.
    let stop: (() => void) | null = null;
    void location
      .watch(2000, (p) => {
        this.here = p;
        const h = location.heading();
        if (h != null && h !== this.heading) {
          this.heading = h;
          this.changed();
        }
      })
      .then((s) => (this.disposed ? s() : (stop = s)));
    this.onDispose(() => stop?.());
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
      this.error = S.onBoard.needLocation;
      this.loading = false;
      this.changed();
      return;
    }
    this.here = p;
    this.heading = location.heading() ?? this.heading;
    try {
      this.candidates = this.tidy(await repo.boardCandidates(p));
      void this.resolveLoose();
    } catch {
      if (this.candidates.length === 0) this.error = S.onBoard.loadFailed;
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
    return OnBoard.rank(this.candidates, nowSec(), this.heading)
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
      this.error = S.onBoard.noTimetable(`${modeName(c.mode)} ${c.lineLabel}`);
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
          <IconButton icon="arrow-back" label={S.common.back} onPress={nav.pop} />
          <View style={{ flex: 1 }}>
            <Txt v="titleLarge">{S.onBoard.title}</Txt>
            <Txt v="bodySmall" color={t.x.subtle}>
              {S.onBoard.subtitle}
            </Txt>
          </View>
          <IconButton icon="refresh" label={S.common.refresh} onPress={() => void model.refresh()} disabled={model.loading} />
        </View>
        <SearchBox query={model.query} onQuery={model.setQuery} placeholder={S.onBoard.filter} testID="onboard_filter" />
        {model.modes.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingTop: 10 }}>
            {model.modes.map((m) => (
              <Chip key={m} label={modeName(m)} icon={modeIcon(m)} selected={model.mode === m} onPress={() => model.setMode(m)} />
            ))}
          </ScrollView>
        )}
      </View>
      {model.loading ? (
        <LoadingBox text={S.onBoard.looking} />
      ) : model.candidates.length === 0 && model.error != null ? (
        <MessageBox title={S.onBoard.cantTell} body={model.error} action={S.routes.tryAgain} onAction={() => void model.refresh()} />
      ) : model.candidates.length === 0 ? (
        <MessageBox
          title={S.onBoard.noneFound}
          body={S.onBoard.noneFoundHint}
          icon="directions-bus"
          action={S.common.refresh}
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
                  {S.onBoard.noMatch}
                </Txt>
              )}
            </>
          }
          renderItem={({ item }) => <CandidateRow c={item} now={now} busy={model.picking === candidateKey(item)} otherWay={OnBoard.against(item, model.heading)} onPress={() => void model.pick(item)} />}
          ListFooterComponent={
            <Txt v="labelSmall" color={t.x.subtle} style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 + insets.bottom }}>
              {S.onBoard.footer}
            </Txt>
          }
        />
      )}
    </View>
  );
}

function CandidateRow({ c, now, busy, otherWay, onPress }: { c: BoardCandidate; now: Instant; busy: boolean; otherWay: boolean; onPress: () => void }) {
  const t = useTheme();
  const v = c.vehicle;
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button" testID="board_candidate">
      <LineBadge label={c.lineLabel} mode={c.mode} color={lineColorOf(c.mode, c.routeColor, c.agencyId, c.agencyName)} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt v="bodyLarge" style={{ fontWeight: '500' }} numberOfLines={1}>
          {c.headsign.trim() !== '' ? S.common.toward(c.headsign) : modeName(c.mode)}
        </Txt>
        {v != null ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <LiveSignal freshness={Freshness.of(v.recordedAt, now)} />
              <Txt v="bodySmall" color={freshnessColor(Freshness.of(v.recordedAt, now), t)} style={{ marginLeft: 4 }}>
                {S.onBoard.liveFromYou(Fmt.distance(c.distanceM))}
              </Txt>
            </View>
            {/* Where it calls and then: both directions stop here, so this tells them apart. */}
            {c.stopName != null && c.nextStopName != null && (
              <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>
                {S.onBoard.fromTo(c.stopName, c.nextStopName)}
              </Txt>
            )}
          </>
        ) : (
          <Txt v="bodySmall" color={t.x.subtle} numberOfLines={2}>
            {([
              c.stopName != null ? S.onBoard.dueAt(c.nextStopName != null ? S.onBoard.fromTo(c.stopName, c.nextStopName) : c.stopName) : null,
              c.stopTime != null ? Fmt.time(c.stopTime) : null,
            ]
              .filter((x) => x != null)
              .join(' · ') || S.onBoard.timetable) + S.onBoard.noLiveData}
          </Txt>
        )}
        {otherWay && (
          <Txt v="bodySmall" color={t.x.late} testID="other_way">
            {S.onBoard.otherWay}
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
