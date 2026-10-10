import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { S } from '../../i18n';
import { type Line, type LineRoute, type TransitMode, routeDestination, routeLabel, routeOrigin } from '../../data/models';
import { Operators } from '../../data/operators';
import type { Instant } from '../../data/time';
import type { NearbyLine } from '../../data/transitRepository';
import { location } from '../../state/location';
import { repo } from '../../state/services';
import { useUserData } from '../../state/store';
import { Fmt, modeName } from '../fmt';
import { Chip, LineBadge, LoadingBox, MessageBox, ProgressBar, SearchBox, SectionHeader, Txt } from '../components/common';
import { Icon, modeIcon } from '../components/icons';
import { useNow } from '../components/live';
import { showToast } from '../components/overlays';
import { Model, useModel } from '../model';
import { nav } from '../nav';
import { ModeColors, hex, lineColorOf, useTheme } from '../theme';
import { FAVORITE_GOLD } from '../components/favorites';

export const routeColor = (r: LineRoute) => {
  const op = Operators.findByRef(r.operatorRef, r.agency);
  return op != null ? hex(op.color) : ModeColors[r.mode];
};

class LinesHomeModel extends Model {
  query = '';
  mode: TransitMode | null = null;
  results: Line[] = [];
  loading = false;
  error: string | null = null;
  nearbyLoading = false;
  nearbyLines: NearbyLine[] = [];
  linesLoading = false;
  private job = 0;

  get showsResults() {
    return this.query.trim() !== '' || this.mode === 'TRAIN' || this.mode === 'LIGHT_RAIL';
  }

  onQuery = (q: string) => {
    this.query = q;
    this.search(true);
  };

  onMode = (m: TransitMode) => {
    this.mode = this.mode === m ? null : m;
    this.search(false);
  };

  private search(debounce: boolean) {
    const job = ++this.job;
    if (!this.showsResults) {
      this.results = [];
      this.loading = false;
      this.error = null;
      this.changed();
      return;
    }
    this.changed();
    setTimeout(
      async () => {
        if (job !== this.job) return;
        this.loading = true;
        this.error = null;
        this.changed();
        try {
          const r = await repo.searchLines(this.query, this.mode);
          if (job === this.job) this.results = r;
        } catch {
          if (job === this.job) {
            this.error = S.lines.loadFailed;
            this.results = [];
          }
        }
        if (job === this.job) {
          this.loading = false;
          this.changed();
        }
      },
      debounce ? 350 : 0,
    );
  }

  noPermission = false;

  loadNearby = async () => {
    if (this.nearbyLoading) return;
    this.nearbyLoading = true;
    this.changed();
    const here = (await location.current().catch(() => null)) ?? location.last;
    // Without a fix the permission may still be granted (the position just didn't come).
    this.noPermission = here == null && !(await location.hasPermission().catch(() => false));
    const stops = here ? await repo.nearbyStops(here).catch(() => null) : null;
    this.nearbyLoading = false;
    this.changed();
    if (here && stops) {
      this.linesLoading = true;
      this.changed();
      this.nearbyLines = await repo.nearbyLines(here, stops).catch(() => this.nearbyLines);
      this.linesLoading = false;
      this.changed();
    }
  };

  openLine = async (l: NearbyLine) => {
    const r = await repo.lineRoute(l.departure.routeId).catch(() => null);
    if (r) nav.push('Line', { route: r });
    else showToast(S.lines.detailsUnavailable);
  };
}

type Row =
  | { kind: 'message'; key: string; title: string; body: string; icon?: 'near-me' | 'search-off' }
  | { kind: 'loading'; key: string }
  | { kind: 'header'; key: string; text: string; refresh?: boolean }
  | { kind: 'line'; key: string; route: LineRoute; variants: number; favorite: boolean }
  | { kind: 'nearby'; key: string; line: NearbyLine };

export function LinesHomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const model = useModel(() => {
    const m = new LinesHomeModel();
    void m.loadNearby();
    return m;
  });
  const now = useNow(20_000);
  const rows: Row[] = [];
  if (model.showsResults) {
    if (model.error != null) rows.push({ kind: 'message', key: 'err', title: S.common.somethingWrong, body: model.error });
    else if (!model.loading && model.results.length === 0) {
      rows.push({ kind: 'message', key: 'none', title: S.lines.noneFound, body: S.lines.noneFoundHint, icon: 'search-off' });
    }
    model.results.forEach((l) =>
      rows.push({ kind: 'line', key: `${l.routes[0].operatorRef}-${l.routes[0].mkt}-${l.routes[0].gtfsRouteId}`, route: l.routes[0], variants: l.routes.length, favorite: false }),
    );
  } else {
    if (data.favoriteLines.length) {
      rows.push({ kind: 'header', key: 'hf', text: S.lines.favorites });
      data.favoriteLines.forEach((r) => rows.push({ kind: 'line', key: `fav-${r.operatorRef}-${r.mkt}`, route: r, variants: 1, favorite: true }));
    }
    const lines = model.nearbyLines.filter((l) => model.mode == null || l.departure.mode === model.mode);
    rows.push({ kind: 'header', key: 'hn', text: S.lines.nearby, refresh: true });
    if (lines.length === 0) {
      if (model.nearbyLoading || model.linesLoading) rows.push({ kind: 'loading', key: 'loading' });
      else rows.push({ kind: 'message', key: 'nonear', title: S.lines.noneNearby, body: model.noPermission ? S.lines.noneNearbyHint : S.common.tryRefresh, icon: 'near-me' });
    }
    lines.slice(0, 10).forEach((l) => rows.push({ kind: 'nearby', key: `nl-${l.departure.routeId}-${l.departure.headsign}`, line: l }));
  }

  const renderRow = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'message':
        return <MessageBox title={item.title} body={item.body} icon={item.icon} />;
      case 'loading':
        return <LoadingBox />;
      case 'header':
        return <SectionHeader text={item.text} action={item.refresh ? S.common.refresh : undefined} onAction={item.refresh ? model.loadNearby : undefined} />;
      case 'line':
        return <LineRow route={item.route} variants={item.variants} favorite={item.favorite} onPress={() => nav.push('Line', { route: item.route })} />;
      case 'nearby':
        return <NearbyLineRow line={item.line} now={now} onPress={() => void model.openLine(item.line)} />;
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="lines_screen">
      <View style={{ backgroundColor: t.c.surface, paddingTop: insets.top }}>
        <Txt v="headlineSmall" style={styles.title} accessibilityRole="header">
          {S.lines.title}
        </Txt>
        <SearchBox query={model.query} onQuery={model.onQuery} placeholder={S.lines.searchHint} testID="line_search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {(['BUS', 'TRAIN', 'LIGHT_RAIL', 'CABLE_CAR'] as const).map((m) => (
            <Chip key={m} label={modeName(m)} icon={modeIcon(m)} iconColor={ModeColors[m]} selected={model.mode === m} onPress={() => model.onMode(m)} />
          ))}
        </ScrollView>
      </View>
      <ProgressBar active={model.loading} />
      <FlatList data={rows} keyExtractor={(r) => r.key} renderItem={renderRow} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled" />
    </View>
  );
}

function NearbyLineRow({ line, now, onPress }: { line: NearbyLine; now: Instant; onPress: () => void }) {
  const t = useTheme();
  const d = line.departure;
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <View style={{ minWidth: 64 }}>
        <LineBadge label={d.lineLabel} mode={d.mode} color={lineColorOf(d.mode, d.routeColor, d.agencyId, d.agency)} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Txt v="bodyMedium" numberOfLines={1}>{S.common.toward(d.headsign)}</Txt>
        <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>{`${Fmt.distance(line.distanceM)} · ${line.stop.name}`}</Txt>
      </View>
      <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
        <Txt v="titleSmall" num>
          {Fmt.relative(line.next[0], now)}
        </Txt>
        {line.next[1] != null && (
          <Txt v="labelSmall" num color={t.x.subtle}>{S.common.then(Fmt.time(line.next[1]))}</Txt>
        )}
      </View>
    </Pressable>
  );
}

export function LineRow({ route, variants = 1, favorite = false, onPress }: { route: LineRoute; variants?: number; favorite?: boolean; onPress: () => void }) {
  const t = useTheme();
  const dest = routeDestination(route);
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button" testID="line_row">
      <View style={{ minWidth: 64 }}>
        <LineBadge label={routeLabel(route)} mode={route.mode} color={routeColor(route)} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        {dest.trim() !== '' ? (
          <>
            <Txt v="bodyMedium" numberOfLines={1}>
              {dest}
            </Txt>
            <Txt v="bodySmall" color={t.x.subtle} numberOfLines={1}>
              {routeOrigin(route)}
            </Txt>
          </>
        ) : (
          <Txt v="bodyMedium" numberOfLines={2}>
            {route.longName}
          </Txt>
        )}
        <Txt v="labelMedium" color={t.x.subtle}>
          {route.agency + (variants > 2 ? `  ·  ${variants} variants` : '')}
        </Txt>
      </View>
      {favorite && <Icon name="star" size={18} color={FAVORITE_GOLD} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { paddingLeft: 20, paddingTop: 14, paddingBottom: 10 },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
});
