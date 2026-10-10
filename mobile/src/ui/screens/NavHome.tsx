import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { type SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GeoMath } from '../../data/geo';
import { type GeoPoint, type Place, placeKey, placePoint } from '../../data/models';
import { S } from '../../i18n';
import type { SavedTrip, UserData } from '../../data/userStore';
import { DEFAULT_LOCATION, location, useLastLocation } from '../../state/location';
import { repo } from '../../state/services';
import { store, useUserData } from '../../state/store';
import { IconButton, PlaceRow, SectionHeader, Txt } from '../components/common';
import { type FavoriteDraft, FavoriteDialogHost, draftFor } from '../components/favorites';
import { FAVORITE_ICON_NAMES, Icon, type IconName } from '../components/icons';
import { MapSheet } from '../components/MapSheet';
import { TransitMap, useMapController } from '../map/TransitMap';
import { CURRENT_LOCATION, nav } from '../nav';
import { useTheme } from '../theme';
import { FavoriteStops } from './favoriteStops';

export function planTo(to: Place, from: Place = CURRENT_LOCATION) {
  store.addRecent(to);
  nav.push('Routes', { from, to });
}

/** Search for a place to set as Home or Work, or to save as a favourite. */
export function pickHomeOrWork(isHome: boolean) {
  nav.push('Search', {
    from: null,
    to: null,
    editing: 'TO',
    single: true,
    title: isHome ? S.home.setHome : S.home.setWork,
    onDone: (p) => {
      if (isHome) store.setHome(p);
      else store.setWork(p);
      nav.pop();
    },
  });
}

/** Already on a bus or train: pick it, then where to, and plan from its next stop. */
function onBoard() {
  nav.push('OnBoard', {
    onPicked: (p) =>
      nav.replace('Search', { from: p, to: null, editing: 'TO', onDone: (f, t) => nav.replace('Routes', { from: f, to: t! }) }),
  });
}

export function NavHomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const user = useLastLocation();
  const controller = useMapController();
  const [stops, setStops] = useState<Place[]>([]);
  const [draft, setDraft] = useState<FavoriteDraft | null>(null);
  const lastStopsCenter = useRef<GeoPoint | null>(null);
  const stopsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      if (await location.hasPermission()) {
        const p = await location.current();
        if (p && user == null) controller.current?.moveTo(p, 15);
      } else if (await location.requestPermission()) {
        const p = await location.current();
        if (p) controller.current?.moveTo(p, 15);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCameraIdle = (center: GeoPoint) => {
    const last = lastStopsCenter.current;
    if (last != null && GeoMath.distance(last, center) < 250) return;
    if (stopsTimer.current) clearTimeout(stopsTimer.current);
    stopsTimer.current = setTimeout(() => {
      repo.nearbyStops(center).then(
        (s) => {
          setStops(s);
          lastStopsCenter.current = center;
        },
        () => {},
      );
    }, 300);
  };

  const openSearch = () =>
    nav.push('Search', {
      from: CURRENT_LOCATION,
      to: null,
      editing: 'TO',
      onDone: (f, to) => nav.replace('Routes', { from: f, to: to! }),
    });

  const addFavorite = () =>
    nav.push('Search', {
      from: null,
      to: null,
      editing: 'TO',
      single: true,
      title: S.settings.addFavorite,
      onDone: (p) => {
        nav.pop();
        setDraft(draftFor(p));
      },
    });

  const myLocation = async () => {
    const p = (await location.current()) ?? user;
    if (p) controller.current?.moveTo(p, 15.5);
    else if (await location.requestPermission()) {
      const q = await location.current();
      if (q) controller.current?.moveTo(q, 15.5);
    }
  };

  return (
    <View style={{ flex: 1 }} testID="home_screen">
      <MapSheet
        peekFraction={0.45}
        peekMax={360}
        map={() => (
          <TransitMap
            style={StyleSheet.absoluteFill}
            markers={stops.map((s) => ({ point: placePoint(s), color: '#6B7280', kind: 'STOP_SMALL', id: s.stopId }))}
            user={user}
            initialCenter={user ?? DEFAULT_LOCATION}
            initialZoom={15}
            controller={controller}
            onMarkerPress={(id) => {
              const s = stops.find((x) => x.stopId === id);
              if (s) nav.push('Stop', { place: s });
            }}
            onLongPress={(p) => planTo({ name: S.home.droppedPin, lat: p.lat, lon: p.lon, kind: 'PIN' })}
            onCameraIdle={onCameraIdle}
            compassStyle={{ top: insets.top + 84, right: 16 }}
            // The sheet covers the bottom left.
            attributionPosition={{ top: insets.top + 84, left: 16 }}
          />
        )}
        overlay={(c) => (
          <>
            {/* Search card */}
            <View style={[styles.searchWrap, { paddingTop: insets.top + 10 }]}>
              <Pressable onPress={openSearch} style={[styles.searchCard, { backgroundColor: t.c.surface }]} accessibilityRole="search" testID="home_search">
                <Icon name="search" color={t.c.primary} />
                <Txt v="titleMedium" color={t.c.onSurfaceVariant} style={{ flex: 1, marginLeft: 12 }}>
                  {S.home.whereTo}
                </Txt>
                <IconButton icon="settings" label={S.settings.title} onPress={() => nav.push('Settings')} testID="settings_button" />
              </Pressable>
            </View>
            <SheetButtons
              position={c.position}
              hidden={c.mapOnly}
              height={c.height}
              bottomInset={insets.bottom}
              onBoardShown={data.settings.onBoard}
              onExpand={() => (c.mapOnly ? c.show() : c.hide())}
              onShowPlaces={c.show}
              onMyLocation={myLocation}
            />
          </>
        )}
        testID="home_sheet"
      >
        <HomePlaces data={data} here={user} onEdit={(p) => setDraft(draftFor(p))} onAddFavorite={addFavorite} />
      </MapSheet>
      <FavoriteDialogHost draft={draft} onClose={() => setDraft(null)} />
    </View>
  );
}

/** Buttons on the sheet's top edge (on the screen's bottom when the sheet is hidden). */
function SheetButtons({
  position,
  hidden,
  height,
  bottomInset,
  onBoardShown,
  onExpand,
  onShowPlaces,
  onMyLocation,
}: {
  position: SharedValue<number>;
  hidden: boolean;
  height: number;
  bottomInset: number;
  onBoardShown: boolean;
  onExpand: () => void;
  onShowPlaces: () => void;
  onMyLocation: () => void;
}) {
  const t = useTheme();
  const ROW = 64;
  const style = useAnimatedStyle(() => {
    // With the map expanded the row stays clear of the map's attribution (i), bottom left.
    const top = Math.min(position.value, height - bottomInset - 28) - ROW;
    // Pulled up past the middle, the buttons would crowd the search card: they step aside.
    return { transform: [{ translateY: position.value > height * 0.4 ? top : -1000 }] };
  });
  return (
    <Animated.View style={[styles.buttons, style]} pointerEvents="box-none">
      {/* Advanced: plan from the bus you're on. Hidden unless switched on in Settings. */}
      {onBoardShown && (
        <Pressable onPress={onBoard} style={[styles.onBoard, { backgroundColor: t.c.surface }]} testID="on_board" accessibilityRole="button">
          <Icon name="directions-bus" size={18} color={t.c.primary} />
          <Txt v="labelLarge" numberOfLines={1} style={{ marginLeft: 6, flexShrink: 1 }}>
            {S.home.onABus}
          </Txt>
        </Pressable>
      )}
      {/* With the map full screen, a way back to the places, on the same row as the buttons. */}
      <View style={{ flex: 1, alignItems: 'center', marginHorizontal: 8 }} pointerEvents="box-none">
        {hidden && (
          <Pressable onPress={onShowPlaces} style={[styles.places, { backgroundColor: t.c.surface }]} testID="home_show_places" accessibilityRole="button">
            <Icon name="expand-less" color={t.c.onSurface} />
            <Txt v="labelLarge" numberOfLines={1} style={{ marginLeft: 8, flexShrink: 1 }}>
              {S.settings.places}
            </Txt>
          </Pressable>
        )}
      </View>
      <SmallFab icon={hidden ? 'fullscreen-exit' : 'fullscreen'} label={hidden ? S.home.showPlaces : S.detail.expandMap} onPress={onExpand} testID="home_map_expand" />
      <View style={{ width: 8 }} />
      <SmallFab icon="my-location" label={S.common.myLocation} color={t.c.primary} onPress={onMyLocation} testID="home_my_location" />
    </Animated.View>
  );
}

function SmallFab({ icon, label, onPress, color, testID }: { icon: IconName; label: string; onPress: () => void; color?: string; testID?: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityLabel={label} accessibilityRole="button" style={[styles.smallFab, { backgroundColor: t.c.surface }]} testID={testID}>
      <Icon name={icon} color={color ?? t.c.onSurfaceVariant} />
    </Pressable>
  );
}

function HomePlaces({ data, here, onEdit, onAddFavorite }: { data: UserData; here: GeoPoint | null; onEdit: (p: Place) => void; onAddFavorite: () => void }) {
  const t = useTheme();
  return (
    <View>
      {/* Home and Work share the width; labelled favourites scroll beneath them. */}
      <View style={styles.quickRow}>
        <QuickPlace
          title={S.settings.home}
          subtitle={data.home?.name ?? S.home.setLocation}
          icon="home"
          onPress={() => (data.home ? planTo(data.home) : pickHomeOrWork(true))}
          onEdit={() => pickHomeOrWork(true)}
        />
        <QuickPlace
          title={S.settings.work}
          subtitle={data.work?.name ?? S.home.setLocation}
          icon="work"
          onPress={() => (data.work ? planTo(data.work) : pickHomeOrWork(false))}
          onEdit={() => pickHomeOrWork(false)}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {data.favoritePlaces.map((f) => (
          <Pressable
            key={placeKey(f.place)}
            onPress={() => planTo(f.place)}
            onLongPress={() => onEdit(f.place)}
            accessibilityHint={S.home.longPressToEdit}
            style={[styles.favChip, { backgroundColor: t.c.surfaceVariant }]}
          >
            <Icon name={FAVORITE_ICON_NAMES[f.icon]} size={18} color={t.c.primary} />
            <Txt v="labelLarge" numberOfLines={1} style={{ marginLeft: 6, flexShrink: 1 }}>
              {f.label}
            </Txt>
          </Pressable>
        ))}
        <Pressable onPress={onAddFavorite} style={[styles.addChip, { borderColor: t.c.outlineVariant }]} testID="add_favorite" accessibilityRole="button">
          <Icon name="add" size={18} color={t.c.primary} />
          <Txt v="labelLarge" color={t.c.primary} style={{ marginLeft: 6 }}>
            {data.favoritePlaces.length === 0 ? S.settings.addFavoritePlace : S.home.add}
          </Txt>
        </Pressable>
      </ScrollView>
      <FavoriteStops favorites={data.favoriteStops} here={here} />
      {data.savedTrips.length > 0 && (
        <>
          <SectionHeader text={S.home.savedTrips} />
          {data.savedTrips.map((s) => (
            <SavedTripRow key={placeKey(s.from) + placeKey(s.to)} trip={s} />
          ))}
        </>
      )}
      <SectionHeader text={S.home.recent} />
      {data.recents.length === 0 && (
        <Txt v="bodyMedium" color={t.x.subtle} style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
          {S.home.recentHint}
        </Txt>
      )}
      {data.recents.slice(0, 6).map((p) => (
        <PlaceRow
          key={placeKey(p)}
          title={p.name}
          subtitle={p.subtitle}
          icon="history"
          trailing={<IconButton icon="close" label={S.home.remove} size={18} color={t.x.subtle} onPress={() => store.removeRecent(p)} />}
          onLongPress={() => onEdit(p)}
          onPress={() => planTo(p)}
        />
      ))}
    </View>
  );
}

function QuickPlace({ title, subtitle, icon, onPress, onEdit }: { title: string; subtitle: string; icon: IconName; onPress: () => void; onEdit: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.quick, { backgroundColor: t.c.surfaceVariant }]} accessibilityRole="button" testID={`quick_${icon}`}>
      <Icon name={icon} size={20} color={t.c.primary} />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Txt v="labelLarge" numberOfLines={1}>
          {title}
        </Txt>
        <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>
          {subtitle}
        </Txt>
      </View>
      <IconButton icon="edit" label={S.home.edit(title)} size={16} color={t.x.subtle} onPress={onEdit} />
    </Pressable>
  );
}

function SavedTripRow({ trip }: { trip: SavedTrip }) {
  const t = useTheme();
  return (
    <PlaceRow
      title={trip.label ?? trip.to.name}
      subtitle={S.home.fromPlace(trip.from.kind === 'CURRENT_LOCATION' ? S.common.currentLocation : trip.from.name)}
      icon="swap-calls"
      iconTint={t.c.primary}
      onPress={() => planTo(trip.to, trip.from)}
    />
  );
}

const elevated = {
  elevation: 4,
  shadowColor: '#000',
  shadowOpacity: 0.15,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
};

const styles = StyleSheet.create({
  searchWrap: { position: 'absolute', left: 16, right: 16, top: 0 },
  searchCard: { flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: 18, paddingLeft: 18, paddingRight: 4, ...elevated, elevation: 6 },
  buttons: { position: 'absolute', left: 0, right: 0, top: 0, height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  onBoard: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, paddingLeft: 12, paddingRight: 14, ...elevated },
  smallFab: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', ...elevated },
  places: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, paddingLeft: 12, paddingRight: 16, ...elevated },
  quickRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 16, paddingLeft: 12, paddingVertical: 6 },
  chips: { gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  favChip: { flexDirection: 'row', alignItems: 'center', height: 40, maxWidth: 180, borderRadius: 20, paddingLeft: 12, paddingRight: 14 },
  addChip: { flexDirection: 'row', alignItems: 'center', height: 40, borderRadius: 20, borderWidth: 1, paddingLeft: 10, paddingRight: 14 },
});
