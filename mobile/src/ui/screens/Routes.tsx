import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { AppState, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Combine } from '../../data/combine';
import { WiderWalk } from '../../data/grace';
import { type Itinerary, type Leg, type Place, itinDurationSec, placeKey, rideKey, walkSec } from '../../data/models';
import { localDate, today } from '../../data/time';
import { DEFAULT_MAX_WALK_MINUTES, type Settings, favoriteFor } from '../../data/userStore';
import { S } from '../../i18n';
import { useUserData } from '../../state/store';
import { Chip, IconButton, LoadingBox, MessageBox, ProgressBar, TextButton, Txt } from '../components/common';
import { FAVORITE_GOLD, type FavoriteDraft, FavoriteDialogHost, draftFor } from '../components/favorites';
import { FAVORITE_ICON_NAMES, Icon } from '../components/icons';
import { useNow } from '../components/live';
import { Menu } from '../components/overlays';
import { Fmt } from '../fmt';
import { useModel } from '../model';
import { type RootStack, nav } from '../nav';
import { useTheme } from '../theme';
import { ItineraryCard, WalkOnlyCard, rideLabel, timeLabel } from './routeCards';
import { OptionsSheet, RideSheet, TimeSheet } from './routeSheets';
import { RoutesModel } from './routesModel';

type Item = { kind: 'saved'; at: number } | { kind: 'last'; ride: Leg } | { kind: 'earlier' } | { kind: 'wider' } | { kind: 'walk'; itin: Itinerary } | { kind: 'itin'; itin: Itinerary } | { kind: 'later' } | { kind: 'credit' };

export function RoutesScreen({ route }: NativeStackScreenProps<RootStack, 'Routes'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const model = useModel(() => new RoutesModel(route.params.from, route.params.to));
  const now = useNow(15_000);
  const [showTime, setShowTime] = useState(false);
  const [showRide, setShowRide] = useState(false);
  /** The options as they were when the sheet opened (null while it's closed). */
  const [optionsBefore, setOptionsBefore] = useState<Settings | null>(null);
  const list = useRef<FlatList<Item>>(null);
  const offset = useRef(0);
  model.scrollToTop = () => list.current?.scrollToOffset({ offset: 0, animated: false });
  model.atTop = () => offset.current < 200;

  // Coming back to a "leave now" search after a while re-runs it.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && model.refreshIfStale());
    return () => sub.remove();
  }, [model]);

  const liveOf = (l: Leg) => model.rideLive.get(rideKey(l));
  const expectedOf = (i: Itinerary) => Combine.expected(i, liveOf);
  // Leaving now: options whose connection a late bus has made impossible aren't options (unless nothing else is left).
  const connected = model.timeMode !== 'NOW' ? model.itineraries : model.itineraries.filter((i) => Combine.connects(i, now, liveOf));
  const itineraries = connected.length ? connected : model.itineraries;
  const fastest = itineraries.length ? itineraries.reduce((a, b) => (itinDurationSec(expectedOf(b)) < itinDurationSec(expectedOf(a)) ? b : a)).id : null;
  const leastWalk = itineraries.length > 2 ? itineraries.reduce((a, b) => (walkSec(b) < walkSec(a) ? b : a)).id : null;

  const s = data.settings;
  const todayDate = today();
  const askedDay = model.timeMode !== 'NOW' && model.time != null ? localDate(model.time) : todayDate;
  const custom =
    s.modes.length < 6 || s.maxWalkMinutes !== DEFAULT_MAX_WALK_MINUTES || s.wheelchair || s.walkSpeed !== 'NORMAL' || s.railPreference !== 'NONE' || s.routeSort !== 'FASTEST';

  const items: Item[] = [
    ...(model.savedAt != null ? [{ kind: 'saved', at: model.savedAt } as const] : []),
    // Said up top once it's close: a card further down could be missed.
    ...(model.last != null && model.last.ride.start - now < 3600 ? [{ kind: 'last', ride: model.last.ride } as const] : []),
    ...(model.canPage ? [{ kind: 'earlier' } as const] : []),
    ...(model.widerWalk.size > 0 ? [{ kind: 'wider' } as const] : []),
    ...(model.walkOnly ? [{ kind: 'walk', itin: model.walkOnly } as const] : []),
    ...itineraries.map((itin) => ({ kind: 'itin', itin }) as const),
    ...(model.canPage ? [{ kind: 'later' } as const] : []),
    { kind: 'credit' },
  ];

  const renderItem = ({ item }: { item: Item }) => {
    switch (item.kind) {
      case 'saved':
        return (
          <View style={styles.saved} testID="saved_routes_banner">
            <Icon name="cloud-off" size={20} color={t.x.subtle} />
            <Txt v="bodySmall" color={t.x.subtle} style={{ flex: 1, marginHorizontal: 10 }}>
              {S.routes.savedShown(Fmt.when(item.at, now))}
            </Txt>
            <TextButton text={S.routes.tryAgain} onPress={() => model.search()} />
          </View>
        );
      case 'last':
        return (
          <View style={styles.last} testID="last_bus_banner">
            <Icon name="schedule" size={20} color={t.c.error} />
            <Txt v="bodyMedium" color={t.c.error} style={{ flex: 1, marginStart: 10 }}>
              {S.routes.lastToday(Fmt.time(item.ride.start), item.ride.from.name)}
            </Txt>
          </View>
        );
      case 'earlier':
        return (
          <View style={{ alignItems: 'flex-start', paddingLeft: 8 }}>
            <TextButton text={S.routes.earlier} onPress={() => model.more(false)} disabled={model.loadingMore} />
          </View>
        );
      case 'wider':
        // Why some options walk further than the options sheet allows: nothing leaves soon within it.
        return (
          <View style={[styles.wider, { backgroundColor: t.c.primaryContainer }]} testID="wider_walk_note">
            <Icon name="directions-walk" size={18} color={t.c.onPrimaryContainer} />
            <Txt v="bodySmall" color={t.c.onPrimaryContainer} style={{ flex: 1, marginStart: 10 }}>
              {S.routes.widerWalkNote(s.maxWalkMinutes, WiderWalk.MINUTES)}
            </Txt>
          </View>
        );
      case 'walk':
        return <WalkOnlyCard itin={item.itin} now={now} onPress={() => model.open(item.itin)} />;
      case 'later':
        return model.loadingMore ? (
          <LoadingBox />
        ) : (
          <View style={{ alignItems: 'center' }}>
            <TextButton text={S.routes.later} onPress={() => model.more(true)} />
          </View>
        );
      case 'credit':
        return (
          <Txt v="labelSmall" color={t.x.subtle} style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: insets.bottom }}>
            {S.routes.credit}
          </Txt>
        );
      case 'itin': {
        const itin = item.itin;
        const tags: string[] = [];
        // Ranked list: the first card is the one the chosen sort puts first.
        if (itin === itineraries[0] && itineraries.length > 1)
          tags.push(s.routeSort === 'BEST' ? S.routes.best : model.timeMode === 'ARRIVE' ? S.routes.leavesLast : S.routes.arrivesFirst);
        if (itin.id === fastest) tags.push(S.routes.fastest);
        if (itin.id === leastWalk && itin.id !== fastest) tags.push(S.routes.leastWalking);
        if (itin.id === model.last?.itinId) tags.push(S.routes.lastTag);
        if (model.widerWalk.has(itin.id) || model.overWalk(itin)) tags.push(S.routes.longerWalk);
        if (model.overLift(itin)) tags.push(S.routes.longerRide);
        // Late at night or on Shabbat the options can be tomorrow's: say so, not just the time.
        const day = localDate(itin.start);
        if (day !== askedDay) tags.push(Fmt.day(day, todayDate));
        // Transfer slack as the rides are expected to run, late ones included.
        const risk = model.riskiest(expectedOf(itin));
        return (
          <ItineraryCard
            itin={itin}
            live={model.live.get(itin.id)}
            now={now}
            tags={tags}
            risk={risk}
            missed={risk ? model.nextIfMissed(risk) : null}
            rideLive={model.rideLive}
            onLiveClick={() => model.openLive(itin)}
            onBoardTripId={model.onBoardTripId}
            onPress={() => model.open(itin)}
            testID="route_card"
          />
        );
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="routes_screen">
      <View style={[styles.header, { backgroundColor: t.c.surface, paddingTop: insets.top + 4 }]}>
        <View style={styles.headerRow}>
          <IconButton icon="arrow-back" label={S.common.back} onPress={nav.pop} />
          <View style={[styles.endpoints, { backgroundColor: t.c.surfaceVariant }]}>
            <EndpointRow text={nameOf(model.from)} hollow onPress={() => model.edit('FROM')} testID="routes_from" />
            <EndpointRow text={nameOf(model.to)} onPress={() => model.edit('TO')} testID="routes_to" />
          </View>
          <View>
            <IconButton icon="swap-vert" label={S.routes.swap} onPress={model.swap} disabled={model.onBoardTripId != null} />
            <SaveMenu model={model} />
          </View>
        </View>
        {/* Chips scroll; Refresh is a fixed icon button so it always stays reachable. */}
        <View style={styles.chipRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingLeft: 16, paddingRight: 8 }} style={{ flex: 1 }}>
            {/* On board, the trip starts when the bus gets to its next stop. */}
            {model.onBoardTripId == null && (
              <Chip label={timeLabel(model.timeMode, model.time)} icon="schedule" selected={model.timeMode !== 'NOW'} onPress={() => setShowTime(true)} testID="time_chip" />
            )}
            {/* Getting a ride (טרמפ): an advanced tool, so only offered once it's switched on. */}
            {(model.ride != null || (s.rides && model.onBoardTripId == null)) && (
              <Chip label={rideLabel(model.ride)} icon="directions-car" selected={model.ride != null} onPress={() => setShowRide(true)} maxWidth={200} testID="ride_chip" />
            )}
            <Chip label={S.routes.options} icon="tune" selected={custom} onPress={() => setOptionsBefore(data.settings)} testID="options_chip" />
            {s.wheelchair && <Chip label={S.routes.accessible} icon="accessible" selected onPress={() => setOptionsBefore(data.settings)} />}
          </ScrollView>
          <IconButton icon="refresh" label={S.routes.refresh} onPress={model.refreshNow} disabled={model.loading} testID="refresh_chip" />
        </View>
      </View>
      <ProgressBar active={model.refining && !model.loading} testID="refining" />
      {model.loading ? (
        <LoadingBox text={S.routes.finding} />
      ) : model.error != null && model.itineraries.length === 0 && model.walkOnly == null ? (
        <MessageBox title={S.routes.noRoutes} body={model.error} action={S.routes.tryAgain} onAction={() => model.search()} />
      ) : (
        <FlatList
          ref={list}
          data={items}
          renderItem={renderItem}
          keyExtractor={(i, k) => (i.kind === 'itin' || i.kind === 'walk' ? i.itin.id : `${i.kind}${k}`)}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: 24 }}
          onScroll={(e) => (offset.current = e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={100}
          testID="routes_list"
        />
      )}
      {showTime && (
        <TimeSheet
          mode={model.timeMode}
          time={model.time}
          onDismiss={() => setShowTime(false)}
          onApply={(mode, time) => {
            setShowTime(false);
            model.setTime(mode, time);
          }}
        />
      )}
      {showRide && (
        <RideSheet
          current={model.ride}
          when={timeLabel(model.timeMode, model.time)}
          onPickTime={() => {
            setShowRide(false);
            setShowTime(true);
          }}
          onDismiss={() => setShowRide(false)}
          onPickDestination={() => {
            setShowRide(false);
            model.pickDriverDestination();
          }}
          onApply={(r) => {
            setShowRide(false);
            model.useRide(r);
          }}
        />
      )}
      {optionsBefore != null && (
        <OptionsSheet
          onDismiss={() => {
            const before = optionsBefore;
            setOptionsBefore(null);
            model.optionsClosed(before);
          }}
        />
      )}
    </View>
  );
}

/** Star menu: save the whole trip, and/or save the destination as a labelled favourite place. */
function SaveMenu({ model }: { model: RoutesModel }) {
  const t = useTheme();
  const data = useUserData();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FavoriteDraft | null>(null);
  const tripSaved = data.savedTrips.some((s) => placeKey(s.from) === placeKey(model.from) && placeKey(s.to) === placeKey(model.to));
  // A trip from the bus you're on now isn't one to come back to.
  const canSaveTrip = model.from.kind !== 'ON_BOARD';
  const canFavorite = model.to.kind !== 'CURRENT_LOCATION';
  const favorite = favoriteFor(data, model.to);
  const items = [
    ...(canSaveTrip ? [{ text: tripSaved ? S.routes.removeSavedTrip : S.routes.saveTrip, icon: 'swap-calls' as const, onPress: model.toggleSaved, testID: 'save_trip' }] : []),
    ...(canFavorite
      ? [
          {
            text: favorite ? S.routes.editFavorite(favorite.label) : S.routes.saveDestination,
            icon: favorite ? FAVORITE_ICON_NAMES[favorite.icon] : ('star-border' as const),
            onPress: () => setDraft(draftFor(model.to)),
            testID: 'save_destination',
          },
        ]
      : []),
  ];
  const saved = tripSaved || favorite != null;
  return (
    <>
      <IconButton icon={saved ? 'star' : 'star-border'} label={S.common.save} color={saved ? FAVORITE_GOLD : t.c.onSurfaceVariant} onPress={() => setOpen(true)} testID="save_menu" />
      <Menu visible={open} onDismiss={() => setOpen(false)} items={items} />
      <FavoriteDialogHost draft={draft} onClose={() => setDraft(null)} />
    </>
  );
}

/** A saved "Current location" keeps the name it had in the language it was saved in. */
const nameOf = (p: Place) => (p.kind === 'CURRENT_LOCATION' ? S.common.currentLocation : p.name);

function EndpointRow({ text, hollow, onPress, testID }: { text: string; hollow?: boolean; onPress: () => void; testID: string }) {
  const t = useTheme();
  const c = hollow ? t.c.onSurface : t.c.primary;
  return (
    <Pressable onPress={onPress} style={styles.endpoint} accessibilityRole="button" testID={testID}>
      <View style={[styles.dot, { backgroundColor: c }]}>{hollow && <View style={[styles.hole, { backgroundColor: t.c.surfaceVariant }]} />}</View>
      <Txt v="bodyLarge" numberOfLines={1} style={{ marginLeft: 12, flex: 1 }}>
        {text}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  saved: { flexDirection: 'row', alignItems: 'center', paddingStart: 20, paddingEnd: 8, paddingVertical: 4 },
  last: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
  wider: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginVertical: 5, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  header: { paddingBottom: 10, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  endpoints: { flex: 1, borderRadius: 14, paddingVertical: 4 },
  endpoint: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  hole: { width: 5, height: 5, borderRadius: 2.5 },
  chipRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 6, paddingRight: 4 },
});

