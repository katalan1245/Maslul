import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GeoMath } from '../../data/geo';
import { type GeoPoint, type Place, placePoint } from '../../data/models';
import { location, useLastLocation } from '../../state/location';
import { repo } from '../../state/services';
import { useUserData } from '../../state/store';
import { Fmt } from '../fmt';
import { LoadingBox, MessageBox, PlaceRow, ProgressBar, SearchBox, SectionHeader, Txt } from '../components/common';
import { modeIcon } from '../components/icons';
import { Model, useModel } from '../model';
import { nav } from '../nav';
import { ModeColors, useTheme } from '../theme';

/** The Stations tab: find a stop or station, and your favourite and nearby ones. */
class StationsHomeModel extends Model {
  query = '';
  results: Place[] = [];
  loading = false;
  error: string | null = null;
  nearby: Place[] = [];
  nearbyLoading = false;
  private job = 0;

  onQuery = (q: string) => {
    this.query = q;
    const job = ++this.job;
    if (q.trim() === '') {
      this.results = [];
      this.loading = false;
      this.error = null;
      this.changed();
      return;
    }
    this.changed();
    setTimeout(async () => {
      if (job !== this.job) return;
      this.loading = true;
      this.error = null;
      this.changed();
      try {
        const r = await repo.searchStops(q.trim(), location.last);
        if (job === this.job) this.results = r;
      } catch {
        if (job === this.job) {
          this.error = "Couldn't search stations. Check your connection.";
          this.results = [];
        }
      }
      if (job === this.job) {
        this.loading = false;
        this.changed();
      }
    }, 350);
  };

  loadNearby = async () => {
    if (this.nearbyLoading) return;
    this.nearbyLoading = true;
    this.changed();
    const here = (await location.current().catch(() => null)) ?? location.last;
    const r = here ? await repo.nearbyStops(here).catch(() => null) : null;
    if (r) this.nearby = r.slice(0, 15);
    this.nearbyLoading = false;
    this.changed();
  };
}

type Row =
  | { kind: 'message'; key: string; title: string; body: string; icon?: 'near-me' }
  | { kind: 'loading'; key: string }
  | { kind: 'header'; key: string; text: string; refresh?: boolean }
  | { kind: 'station'; key: string; place: Place }
  | { kind: 'favorite'; key: string; place: Place };

export function StationsHomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const here = useLastLocation();
  const model = useModel(() => {
    const m = new StationsHomeModel();
    void m.loadNearby();
    return m;
  });
  const rows: Row[] = [];
  if (model.query.trim() !== '') {
    if (model.error != null) rows.push({ kind: 'message', key: 'err', title: 'Something went wrong', body: model.error });
    else if (!model.loading && model.results.length === 0) rows.push({ kind: 'message', key: 'none', title: 'No stations found', body: 'Search by stop name, station or stop number.' });
    model.results.forEach((p) => rows.push({ kind: 'station', key: `sr-${p.stopId}`, place: p }));
  } else {
    if (data.favoriteStops.length) {
      rows.push({ kind: 'header', key: 'hf', text: 'Favorite stops' });
      data.favoriteStops.forEach((p) => rows.push({ kind: 'favorite', key: `fs-${p.stopId}`, place: p }));
    }
    rows.push({ kind: 'header', key: 'hn', text: 'Nearby stations', refresh: true });
    if (model.nearby.length === 0) {
      if (model.nearbyLoading) rows.push({ kind: 'loading', key: 'loading' });
      else rows.push({ kind: 'message', key: 'nonear', title: 'No stops nearby', body: 'Allow location access to see stations around you.', icon: 'near-me' });
    }
    model.nearby.forEach((p) => rows.push({ kind: 'station', key: `nb-${p.stopId}`, place: p }));
  }
  const open = (p: Place) => nav.push('Stop', { place: p });
  const renderRow = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'message':
        return <MessageBox title={item.title} body={item.body} icon={item.icon} />;
      case 'loading':
        return <LoadingBox />;
      case 'header':
        return <SectionHeader text={item.text} action={item.refresh ? 'Refresh' : undefined} onAction={item.refresh ? model.loadNearby : undefined} />;
      case 'favorite':
        return <PlaceRow title={item.place.name} subtitle={item.place.subtitle} icon="star" iconTint={ModeColors.BUS} onPress={() => open(item.place)} />;
      case 'station':
        return <StationRow place={item.place} here={here} onPress={() => open(item.place)} />;
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="stations_screen">
      <View style={{ backgroundColor: t.c.surface, paddingTop: insets.top, paddingBottom: 10 }}>
        <Txt v="headlineSmall" style={{ paddingLeft: 20, paddingTop: 14, paddingBottom: 10 }} accessibilityRole="header">
          Stations
        </Txt>
        <SearchBox query={model.query} onQuery={model.onQuery} placeholder="Stop or station name" testID="station_search" />
      </View>
      <ProgressBar active={model.loading} />
      <FlatList data={rows} keyExtractor={(r) => r.key} renderItem={renderRow} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled" />
    </View>
  );
}

function StationRow({ place, here, onPress }: { place: Place; here: GeoPoint | null; onPress: () => void }) {
  const t = useTheme();
  return (
    <PlaceRow
      title={place.name}
      subtitle={place.subtitle}
      icon={modeIcon('BUS')}
      iconTint={ModeColors.BUS}
      trailing={
        here != null ? (
          <Txt v="labelMedium" color={t.x.subtle}>
            {Fmt.distance(GeoMath.distance(here, placePoint(place)))}
          </Txt>
        ) : undefined
      }
      onPress={onPress}
    />
  );
}
