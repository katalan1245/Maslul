import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GeoPoint, Place } from '../../data/models';
import { DEFAULT_LOCATION, useLastLocation } from '../../state/location';
import { repo } from '../../state/services';
import { Button, IconButton, Txt } from '../components/common';
import { Icon } from '../components/icons';
import { TransitMap } from '../map/TransitMap';
import { type RootStack, nav } from '../nav';
import { useTheme } from '../theme';

export function PickOnMapScreen({ route }: NativeStackScreenProps<RootStack, 'PickOnMap'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const user = useLastLocation();
  const [center, setCenter] = useState<GeoPoint | null>(null);
  const [label, setLabel] = useState<Place | null>(null);
  const [resolving, setResolving] = useState(false);
  const job = useRef(0);

  const onIdle = (p: GeoPoint) => {
    setCenter(p);
    const my = ++job.current;
    setResolving(true);
    setTimeout(async () => {
      if (my !== job.current) return;
      const l = await repo.reverseGeocode(p);
      if (my !== job.current) return;
      setLabel(l);
      setResolving(false);
    }, 250);
  };

  const confirm = () => {
    if (center == null) return;
    const p: Place = { name: label?.name ?? 'Pinned location', lat: center.lat, lon: center.lon, kind: 'PIN' };
    if (label?.subtitle != null) p.subtitle = label.subtitle;
    route.params.onPicked(p);
  };

  return (
    <View style={{ flex: 1 }} testID="pick_on_map_screen">
      <TransitMap
        style={StyleSheet.absoluteFill}
        user={user}
        initialCenter={user ?? DEFAULT_LOCATION}
        initialZoom={16}
        onCameraIdle={onIdle}
        compassStyle={{ top: insets.top + 16, right: 16 }}
      />
      <View pointerEvents="none" style={styles.pin}>
        <View style={{ marginTop: -40 }}>
          <Icon name="place" size={44} color={t.c.primary} />
        </View>
      </View>
      <View style={{ position: 'absolute', top: insets.top + 12, left: 12 }}>
        <IconButton icon="arrow-back" label="Back" onPress={nav.pop} filled color={t.c.onSurface} />
      </View>
      <View style={[styles.sheet, { backgroundColor: t.c.surface, paddingBottom: insets.bottom + 20 }]}>
        <Txt v="labelMedium" color={t.x.subtle}>
          Move the map to choose a spot
        </Txt>
        <Txt v="titleMedium" numberOfLines={1} style={{ marginTop: 6 }} testID="picked_label">
          {resolving ? 'Finding address…' : (label?.name ?? 'Pinned location')}
        </Txt>
        {label?.subtitle != null && (
          <Txt v="bodySmall" color={t.x.subtle}>
            {label.subtitle}
          </Txt>
        )}
        <Button text="Choose this location" onPress={confirm} disabled={center == null} style={{ marginTop: 14, height: 50 }} testID="choose_location" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
  },
});
