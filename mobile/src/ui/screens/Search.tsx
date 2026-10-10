import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Place, type PlaceKind, placeKey } from '../../data/models';
import { S } from '../../i18n';
import { favoriteFor } from '../../data/userStore';
import { location } from '../../state/location';
import { repo } from '../../state/services';
import { store, useUserData } from '../../state/store';
import { IconButton, MessageBox, PlaceRow, ProgressBar, SectionHeader, Txt } from '../components/common';
import { type FavoriteDraft, FavoriteDialogHost, FavoriteStar, draftFor } from '../components/favorites';
import { FAVORITE_ICON_NAMES, Icon, kindIcon } from '../components/icons';
import { CURRENT_LOCATION, type RootStack, type SearchField, nav } from '../nav';
import { ModeColors, type Theme, inputType, useTheme } from '../theme';

/** A chosen place's name as field text; "Current location" isn't text to edit, so it leaves the field empty. */
const fieldText = (p: Place | null) => (p != null && p.kind !== 'CURRENT_LOCATION' ? p.name : '');

export function kindTint(k: PlaceKind, t: Theme): string {
  if (k === 'STOP') return ModeColors.BUS;
  if (k === 'CURRENT_LOCATION') return t.c.primary;
  return t.c.onSurfaceVariant;
}

type Row =
  | { kind: 'message'; key: string; title: string; body: string; icon?: 'place' }
  | { kind: 'place'; key: string; place: Place; icon?: 'history'; star: boolean }
  | { kind: 'header'; key: string; text: string }
  | { kind: 'action'; key: string; title: string; subtitle?: string; icon: 'my-location' | 'directions-bus' | 'map' | 'home' | 'work'; tint?: boolean; onPress: () => void }
  | { kind: 'favorite'; key: string; place: Place; label: string; icon: keyof typeof FAVORITE_ICON_NAMES };

export function SearchScreen({ route }: NativeStackScreenProps<RootStack, 'Search'>) {
  const { single = false, title, onDone } = route.params;
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const [from, setFrom] = useState<Place | null>(route.params.from);
  const [to, setTo] = useState<Place | null>(route.params.to);
  const [editing, setEditing] = useState<SearchField>(route.params.editing);
  const [fromText, setFromText] = useState(fieldText(route.params.from));
  const [toText, setToText] = useState(fieldText(route.params.to));
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<FavoriteDraft | null>(null);
  const job = useRef(0);
  const list = useRef<FlatList<Row>>(null);
  const fromInput = useRef<TextInput>(null);
  const toInput = useRef<TextInput>(null);

  const text = editing === 'FROM' ? fromText : toText;
  const chosen = editing === 'FROM' ? from : to;
  const query = chosen != null && chosen.name === text ? '' : text.trim();

  useEffect(() => {
    const id = setTimeout(() => (editing === 'FROM' ? fromInput : toInput).current?.focus(), 100);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // New results replace the list, so show them from the top.
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [results]);

  const onText = (field: SearchField, v: string) => {
    if (field === 'FROM') setFromText(v);
    else setToText(v);
    setEditing(field);
    const c = field === 'FROM' ? from : to;
    const q = c != null && c.name === v ? '' : v.trim();
    const my = ++job.current;
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setTimeout(async () => {
      if (my !== job.current) return;
      setLoading(true);
      setFailed(false);
      const near = location.last ?? (await location.current().catch(() => null));
      try {
        const r = await repo.searchPlaces(q, near);
        if (my === job.current) setResults(r);
      } catch {
        if (my === job.current) setFailed(true);
      }
      if (my === job.current) setLoading(false);
    }, 280);
  };

  // Kept in a ref so callbacks from the map picker or the on-board screen see the latest fields.
  const choose = useRef<(p: Place) => void>(() => {});
  choose.current = (p: Place) => {
    if (single) {
      onDone(p, null);
      return;
    }
    let f = from;
    let to2 = to;
    if (editing === 'FROM') {
      f = p;
      setFrom(p);
      setFromText(fieldText(p));
    } else {
      to2 = p;
      setTo(p);
      setToText(fieldText(p));
    }
    job.current++;
    setResults([]);
    setLoading(false);
    if (f != null && to2 != null) {
      if (to2.kind !== 'CURRENT_LOCATION') store.addRecent(to2);
      onDone(f, to2);
    } else {
      setEditing(f == null ? 'FROM' : 'TO');
      (f == null ? fromInput : toInput).current?.focus();
    }
  };
  const pick = (p: Place) => choose.current(p);

  const swap = () => {
    setFrom(to);
    setTo(from);
    setFromText(toText);
    setToText(fromText);
  };

  const rows: Row[] = [];
  if (query.length >= 2) {
    if (failed) rows.push({ kind: 'message', key: 'failed', title: S.search.failed, body: S.search.failedHint });
    else if (!loading && results.length === 0) {
      rows.push({ kind: 'message', key: 'none', title: S.search.noResults, body: S.search.noResultsHint, icon: 'place' });
    }
    results.forEach((p) => rows.push({ kind: 'place', key: `r${placeKey(p)}${p.kind}`, place: p, star: !single }));
  } else {
    if (!single) {
      rows.push({ kind: 'action', key: 'here', title: S.common.currentLocation, icon: 'my-location', tint: true, onPress: () => pick(CURRENT_LOCATION) });
      if (editing === 'FROM' && data.settings.onBoard) {
        rows.push({
          kind: 'action',
          key: 'onboard',
          title: S.search.onBoard,
          subtitle: S.search.onBoardHint,
          icon: 'directions-bus',
          tint: true,
          onPress: () => nav.push('OnBoard', { onPicked: (p) => (nav.pop(), pick(p)) }),
        });
      }
    }
    rows.push({ kind: 'action', key: 'map', title: S.search.chooseOnMap, icon: 'map', onPress: () => nav.push('PickOnMap', { onPicked: (p) => (nav.pop(), pick(p)) }) });
    if (!single) {
      const home = data.home;
      const work = data.work;
      if (home) rows.push({ kind: 'action', key: 'home', title: S.settings.home, subtitle: home.name, icon: 'home', onPress: () => pick(home) });
      if (work) rows.push({ kind: 'action', key: 'work', title: S.settings.work, subtitle: work.name, icon: 'work', onPress: () => pick(work) });
    }
    if (data.favoritePlaces.length) rows.push({ kind: 'header', key: 'hf', text: S.search.favorites });
    data.favoritePlaces.forEach((f) => rows.push({ kind: 'favorite', key: `f${placeKey(f.place)}`, place: f.place, label: f.label, icon: f.icon }));
    if (data.recents.length) rows.push({ kind: 'header', key: 'hr', text: S.home.recent });
    data.recents.forEach((p) => rows.push({ kind: 'place', key: `h${placeKey(p)}`, place: p, icon: 'history', star: !single }));
  }

  const renderRow = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'message':
        return <MessageBox title={item.title} body={item.body} icon={item.icon} />;
      case 'header':
        return <SectionHeader text={item.text} />;
      case 'action':
        return (
          <PlaceRow
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            iconTint={item.tint ? t.c.primary : undefined}
            onPress={item.onPress}
            testID={`search_${item.key}`}
          />
        );
      case 'favorite':
        return (
          <PlaceRow
            title={item.label}
            subtitle={item.label === item.place.name ? item.place.subtitle : item.place.name}
            icon={FAVORITE_ICON_NAMES[item.icon]}
            iconTint={t.c.primary}
            onLongPress={() => setDraft(draftFor(item.place))}
            onPress={() => pick(item.place)}
          />
        );
      case 'place':
        return (
          <PlaceRow
            title={item.place.name}
            subtitle={item.place.subtitle}
            icon={item.icon ?? kindIcon(item.place.kind)}
            iconTint={item.icon ? undefined : kindTint(item.place.kind, t)}
            trailing={item.star ? <FavoriteStar saved={favoriteFor(data, item.place) != null} onPress={() => setDraft(draftFor(item.place))} /> : undefined}
            onLongPress={() => setDraft(draftFor(item.place))}
            onPress={() => pick(item.place)}
          />
        );
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { backgroundColor: t.c.surface, paddingTop: insets.top + 4 }]}>
        <View style={styles.titleRow}>
          <IconButton icon="arrow-back" label={S.common.back} onPress={nav.pop} />
          {(single || title != null) && <Txt v="titleMedium">{title ?? S.search.title}</Txt>}
        </View>
        <View style={styles.fields}>
          <View style={{ flex: 1 }}>
            {!single && (
              <Field
                inputRef={fromInput}
                value={fromText}
                placeholder={from?.kind === 'CURRENT_LOCATION' ? S.common.currentLocation : S.search.startingPoint}
                hollow
                dot={t.c.onSurface}
                active={editing === 'FROM'}
                testID="field_from"
                onFocus={() => setEditing('FROM')}
                onChange={(v) => onText('FROM', v)}
              />
            )}
            <Field
              inputRef={toInput}
              value={toText}
              placeholder={single ? S.search.addressOrPlace : to?.kind === 'CURRENT_LOCATION' ? S.common.currentLocation : S.home.whereTo}
              dot={t.c.primary}
              active={editing === 'TO'}
              testID="field_to"
              onFocus={() => setEditing('TO')}
              onChange={(v) => onText('TO', v)}
            />
          </View>
          {!single ? <IconButton icon="swap-vert" label={S.common.swap} onPress={swap} testID="swap" /> : <View style={{ width: 12 }} />}
        </View>
      </View>
      <ProgressBar active={loading} />
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        testID="search_results"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
      />
      <FavoriteDialogHost draft={draft} onClose={() => setDraft(null)} />
    </KeyboardAvoidingView>
  );
}

function Field({
  inputRef,
  value,
  placeholder,
  dot,
  hollow,
  active,
  testID,
  onFocus,
  onChange,
}: {
  inputRef: React.RefObject<TextInput | null>;
  value: string;
  placeholder: string;
  dot: string;
  hollow?: boolean;
  active: boolean;
  testID: string;
  onFocus: () => void;
  onChange: (v: string) => void;
}) {
  const t = useTheme();
  const bg = active ? t.c.surfaceContainerHighest : t.c.surfaceVariant;
  return (
    <View style={[styles.field, { backgroundColor: bg }]}>
      <View style={[styles.dot, { backgroundColor: dot }]}>{hollow && <View style={[styles.hole, { backgroundColor: bg }]} />}</View>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={t.x.subtle}
        returnKeyType="search"
        style={[inputType('bodyLarge'), { flex: 1, marginLeft: 12, color: t.c.onSurface, paddingVertical: 0 }]}
        accessibilityLabel={placeholder}
        testID={testID}
      />
      {active && value !== '' && (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel={S.common.clear}>
          <Icon name="close" size={18} color={t.x.subtle} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingBottom: 12, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  fields: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4 },
  field: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 14, paddingHorizontal: 14, marginBottom: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  hole: { width: 5, height: 5, borderRadius: 2.5 },
});
