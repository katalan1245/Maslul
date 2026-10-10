/**
 * Simple Maslul (upstream 1.2.0): big buttons for a few places, and plain step-by-step directions
 * from where you are. It plans with the full app's RoutesModel and speaks the app's language; the
 * app's layout direction already follows it (Hebrew right to left).
 */
import { useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, type TextProps, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Combine } from '../../data/combine';
import { type Itinerary, type Leg, type Place, firstTransit, itinDurationSec, rideKey, transitLegs } from '../../data/models';
import { type Instant, dayOfWeek, localDate, nowSec, plusDays } from '../../data/time';
import { type SimpleButton, type SimpleIcon, SIMPLE_ICONS, simpleSlots } from '../../data/userStore';
import { type LanguageSetting, S, lang } from '../../i18n';
import { changeLanguage } from '../../i18n/device';
import { location } from '../../state/location';
import { repo } from '../../state/services';
import { store, useUserData } from '../../state/store';
import { LineBadge, LiveDot, TextButton } from '../components/common';
import { Icon, type IconName, modeIcon } from '../components/icons';
import { useNow } from '../components/live';
import { Dialog } from '../components/overlays';
import { Fmt } from '../fmt';
import { useModel } from '../model';
import { CURRENT_LOCATION, type RootStack, nav } from '../nav';
import { lineColor } from '../screens/routeCards';
import { RoutesModel } from '../screens/routesModel';
import { textDirection, useTheme } from '../theme';

/** Aligned by the app's direction on iOS too (see [textDirection]). */
const Text = ({ style, ...rest }: TextProps) => <RNText {...rest} style={[textDirection, style]} />;
import { type SimpleStep, simpleLine, simpleMinutes, simpleSteps } from './steps';

/** The same pictures as the full app's favourites, plus family, friends and work. */
const ICONS: Record<SimpleIcon, IconName> = {
  HOME: 'home', FAMILY: 'family-restroom', WORK: 'work', HEALTH: 'local-hospital', SHOPPING: 'shopping-cart', FRIENDS: 'groups', PARK: 'park',
  STAR: 'star', HEART: 'favorite', SCHOOL: 'school', CAFE: 'local-cafe', POOL: 'pool', RESTAURANT: 'restaurant', GYM: 'fitness-center', SPORTS: 'sports-soccer',
};

/** One strong colour per button, so each is easy to tell apart (white text reads on all of them). */
const SLOT_COLORS = ['#1F6FEB', '#C92A5E', '#0E7C6B', '#6741D9', '#C2410C'];
const slotColor = (i: number) => SLOT_COLORS[i % SLOT_COLORS.length];
/** The search button's colour, set apart from the place buttons. */
const SEARCH_COLOR = '#374151';
/** Longest walk offered as a way there on its own. */
const WALK_OPTION_SEC = 20 * 60;

/** A button's name: the one given, else its picture's name in the current language. */
export const buttonTitle = (b: SimpleButton) => b.label.trim() || S.simple.iconName[b.icon];

/** A place with its city, "Weizmann 14, Tel Aviv", so it's clear which one was picked. */
const withCity = (p: Place) => [p.name, p.subtitle?.trim() && p.subtitle !== p.name ? p.subtitle : null].filter(Boolean).join(', ');

/** Today, tomorrow (null) or another day's ISO weekday, in Israel. */
function dayOf(t: Instant, now: Instant): 'today' | number | null {
  const d = localDate(t);
  const today = localDate(now);
  return d === today ? 'today' : d === plusDays(today, 1) ? null : dayOfWeek(d);
}

/**
 * "Leave now", "Leave in 6 min", "Leave at 14:05", or "Leave tomorrow at 17:59": on Friday
 * evening the next bus is often after Shabbat, and that has to be plain.
 */
export function leaveText(start: Instant, now: Instant): string {
  const sec = start - now;
  if (sec < 45) return S.simple.leaveNow;
  if (sec < 3600) return S.simple.leaveIn(Math.floor((sec + 30) / 60));
  const d = dayOf(start, now);
  return d === 'today' ? S.simple.leaveAt(Fmt.time(start)) : S.simple.leaveOn(d, Fmt.time(start));
}

/** A clock time, with the day added when it isn't today: "17:59 tomorrow". */
function timeText(t: Instant, now: Instant = nowSec()): string {
  const d = dayOf(t, now);
  return d === 'today' ? Fmt.time(t) : `${Fmt.time(t)} ${S.simple.onDay(d)}`;
}

/** Big, plainly worded title row with a back button that says "Back". */
function TopBar({ title, back = true, trailing }: { title: string; back?: boolean; trailing?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8 }}>
      {back && (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Pressable
            onPress={() => nav.pop()}
            style={[styles.back, { backgroundColor: t.c.surfaceVariant }]}
            accessibilityRole="button"
            testID="simple_back"
          >
            <Icon name="arrow-back" size={28} color={t.c.onSurface} />
            <Text style={[styles.backText, { color: t.c.onSurface }]}>{S.simple.back}</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {trailing}
        </View>
      )}
      <Text style={[styles.title, { color: t.c.onSurface }]} numberOfLines={3} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** A wide, tall button with large text, for the actions that matter on a screen. */
function WideButton({ text, onPress, icon, color, content, testID }: { text: string; onPress: () => void; icon?: IconName; color?: string; content?: string; testID?: string }) {
  const t = useTheme();
  const fg = content ?? t.c.onPrimary;
  return (
    <Pressable onPress={onPress} style={[styles.wide, { backgroundColor: color ?? t.c.primary }]} accessibilityRole="button" testID={testID}>
      {icon && <Icon name={icon} size={28} color={fg} />}
      <Text style={{ color: fg, fontSize: 22, fontWeight: '600', marginStart: icon ? 10 : 0 }}>{text}</Text>
    </Pressable>
  );
}

// ---- Home ----

/** Simple Maslul's home: five place buttons and one for any other address. */
export function SimpleHomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const slots = simpleSlots(data);

  // Directions start from where you are, so ask for location straight away.
  useEffect(() => {
    void location.hasPermission().then((ok) => ok || location.requestPermission());
  }, []);

  /** Goes to button i's place, or asks for its address first if it has none. */
  const open = (i: number, title: string) => {
    const place = slots[i]?.place;
    if (place != null) {
      store.addRecent(place);
      nav.push('SimpleRoutes', { to: place, title });
    } else {
      nav.push('SimpleSearch', {
        title: S.simple.whereIs(title),
        onPick: (p) => {
          const b = store.value.simpleButtons[i];
          if (b) store.setSimpleButton(i, { ...b, place: p });
          nav.pop();
        },
      });
    }
  };
  const search = () =>
    nav.push('SimpleSearch', {
      title: null,
      onPick: (p) => {
        store.addRecent(p);
        nav.replace('SimpleRoutes', { to: p, title: p.name });
      },
    });

  const cells = [
    ...slots.map((b, i) => {
      const title = buttonTitle(b);
      return { title, hint: b.place == null ? S.simple.tapToSet : null, icon: ICONS[b.icon], color: slotColor(i), testID: `simple_slot_${i}`, onPress: () => open(i, title) };
    }),
    { title: S.simple.otherAddress, hint: null, icon: 'search' as IconName, color: SEARCH_COLOR, testID: 'simple_search', onPress: search },
  ];
  const rows = [0, 2, 4].map((k) => cells.slice(k, k + 2));

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background, paddingBottom: insets.bottom }}>
      <TopBar title={S.simple.whereTo} back={false} />
      <View style={{ flex: 1, paddingHorizontal: 16, gap: 12 }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flex: 1, flexDirection: 'row', gap: 12 }}>
            {row.map((c) => (
              <Pressable key={c.testID} onPress={c.onPress} style={[styles.big, { backgroundColor: c.color }]} accessibilityRole="button" testID={c.testID}>
                <Icon name={c.icon} size={52} color="#FFFFFF" />
                <Text style={styles.bigTitle} numberOfLines={2}>
                  {c.title}
                </Text>
                {c.hint != null && (
                  <Text style={styles.bigHint} numberOfLines={2}>
                    {c.hint}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      {/* Settings is there, but kept small and out of the way. */}
      <Pressable onPress={() => nav.push('SimpleSettings')} style={styles.settingsLink} accessibilityRole="button" testID="simple_settings">
        <Icon name="settings" size={22} color={t.c.onSurfaceVariant} />
        <Text style={{ fontSize: 18, color: t.c.onSurfaceVariant, marginStart: 8 }}>{S.simple.settings}</Text>
      </Pressable>
    </View>
  );
}

// ---- Search ----

/** One big search box; picking a result calls onPick. A null title asks "Where to?". */
export function SimpleSearchScreen({ route }: NativeStackScreenProps<RootStack, 'SimpleSearch'>) {
  const { title, onPick } = route.params;
  const t = useTheme();
  const data = useUserData();
  const [text, setText] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const query = useRef(0);

  const onText = (v: string) => {
    setText(v);
    const q = v.trim();
    const n = ++query.current;
    setFailed(false);
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setTimeout(async () => {
      if (n !== query.current) return;
      setLoading(true);
      const near = location.last ?? (await location.current().catch(() => null));
      try {
        const r = await repo.searchPlaces(q, near);
        if (n === query.current) setResults(r);
      } catch {
        if (n === query.current) setFailed(true);
      }
      if (n === query.current) setLoading(false);
    }, 350);
  };

  const searching = text.trim().length >= 2;
  const rows = searching ? results.map((p) => ({ p, icon: 'location-on' as IconName })) : data.recents.slice(0, 6).map((p) => ({ p, icon: 'history' as IconName }));
  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }}>
      <TopBar title={title ?? S.simple.searchTitle} />
      <View style={[styles.field, { borderColor: t.c.outline }]}>
        <TextInput
          value={text}
          onChangeText={onText}
          placeholder={S.simple.searchHint}
          placeholderTextColor={t.x.subtle}
          autoFocus
          returnKeyType="search"
          style={[textDirection, { flex: 1, fontSize: 22, color: t.c.onSurface, paddingVertical: 14 }]}
          accessibilityLabel={S.simple.searchHint}
          testID="simple_search_field"
        />
        {loading && <ActivityIndicator size="large" color={t.c.primary} />}
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" testID="simple_search_results">
        {searching && failed && <Text style={[styles.message, { color: t.c.onSurfaceVariant }]}>{S.simple.searchFailed}</Text>}
        {searching && !failed && !loading && results.length === 0 && <Text style={[styles.message, { color: t.c.onSurfaceVariant }]}>{S.simple.noResults}</Text>}
        {!searching && rows.length > 0 && <Text style={[styles.recent, { color: t.c.onSurfaceVariant }]}>{S.simple.recent}</Text>}
        {rows.map(({ p, icon }, i) => (
          <Pressable key={`${i}-${p.name}`} onPress={() => onPick(p)} style={[styles.result, { borderBottomColor: t.x.divider }]} accessibilityRole="button">
            <Icon name={icon} size={32} color={t.c.primary} />
            <View style={{ flex: 1, marginStart: 16 }}>
              <Text style={{ fontSize: 22, fontWeight: '600', color: t.c.onSurface }} numberOfLines={2}>
                {p.name}
              </Text>
              {!!p.subtitle?.trim() && (
                <Text style={{ fontSize: 17, color: t.c.onSurfaceVariant }} numberOfLines={2}>
                  {p.subtitle}
                </Text>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ---- Routes ----

/** Re-renders when a model made by another screen changes. */
function useWatch(m: RoutesModel) {
  useSyncExternalStore(m.subscribe, m.getVersion);
}

const expectedOf = (planner: RoutesModel, itin: Itinerary) => Combine.expected(itin, (l) => planner.rideLive.get(rideKey(l)));
const isLive = (planner: RoutesModel, itin: Itinerary) => {
  const f = firstTransit(itin);
  return f != null && planner.rideLive.get(rideKey(f))?.status === 'LIVE';
};

/** Ways from here to a place, planned by the full app's RoutesModel and shown plainly. */
export function SimpleRoutesScreen({ route }: NativeStackScreenProps<RootStack, 'SimpleRoutes'>) {
  const { to, title } = route.params;
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const planner = useModel(() => new RoutesModel(CURRENT_LOCATION, to));
  const now = useNow(15_000);
  const [showAll, setShowAll] = useState(false);

  // Still catchable, and no car rides.
  const options = planner.itineraries.filter((i) => !i.legs.some((l) => l.mode === 'CAR') && expectedOf(planner, i).start >= now - 60);
  const walkOnly = planner.walkOnly;
  const walk = walkOnly != null && (options.length === 0 || itinDurationSec(walkOnly) <= WALK_OPTION_SEC) ? walkOnly : null;
  // Every option has left while the screen sat open: look again from now.
  const allLeft = !planner.loading && options.length === 0 && planner.itineraries.length > 0;
  useEffect(() => {
    if (allLeft) planner.refreshNow();
  }, [allLeft, planner]);

  const walkFirst = walk != null && (options.length === 0 || walk.end <= expectedOf(planner, options[0]).end);
  const shown = showAll ? options : options.slice(0, 3);
  const open = (itin: Itinerary) => nav.push('SimpleTrip', { planner, initial: itin });

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }}>
      <TopBar title={S.simple.toPlace(title)} />
      {options.length === 0 && walk == null && planner.errorKind == null ? (
        // Still looking (or about to look again): only a search that failed says so.
        <View style={{ alignItems: 'center', padding: 32 }}>
          <ActivityIndicator size="large" color={t.c.primary} />
          <Text style={{ fontSize: 22, marginTop: 16, textAlign: 'center', color: t.c.onSurface }}>{S.simple.finding}</Text>
        </View>
      ) : options.length === 0 && walk == null ? (
        <View style={{ padding: 20 }} testID="simple_error">
          <Text style={{ fontSize: 22, lineHeight: 28, color: t.c.onSurface, marginBottom: 20 }}>
            {planner.errorKind === 'LOCATION' ? S.simple.errLocation : planner.errorKind === 'NETWORK' ? S.simple.errNetwork : S.simple.errNoRoutes}
          </Text>
          <WideButton text={S.simple.tryAgain} onPress={planner.refreshNow} icon="refresh" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 16 }} testID="simple_routes">
          {/* A short walk beats waiting for a bus: offer it first. */}
          {walk != null && walkFirst && <WalkCard itin={walk} onPress={() => open(walk)} />}
          {shown.map((itin, i) => (
            <OptionCard key={itin.id} itin={expectedOf(planner, itin)} best={i === 0} live={isLive(planner, itin)} now={now} onPress={() => open(itin)} />
          ))}
          {walk != null && !walkFirst && <WalkCard itin={walk} onPress={() => open(walk)} />}
          {!showAll && options.length > shown.length && (
            <WideButton text={S.simple.moreOptions} onPress={() => setShowAll(true)} icon="expand-more" color={t.c.surfaceVariant} content={t.c.onSurface} testID="simple_more" />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function LiveMark({ size = 16 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <LiveDot size={10} />
      <Text style={{ fontSize: size, color: t.x.live, fontWeight: '600', marginStart: 4 }}>{S.simple.live}</Text>
    </View>
  );
}

function OptionCard({ itin, best, live, now, onPress }: { itin: Itinerary; best: boolean; live: boolean; now: Instant; onPress: () => void }) {
  const t = useTheme();
  const rides = transitLegs(itin);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: t.c.surface }, best && { borderWidth: 3, borderColor: t.c.primary }]}
      accessibilityRole="button"
      testID="simple_option"
    >
      {best && <Text style={{ fontSize: 16, fontWeight: '700', color: t.c.primary, marginBottom: 4 }}>{S.simple.best}</Text>}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Text style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', color: t.c.onSurface, flexShrink: 1 }}>{leaveText(itin.start, now)}</Text>
        {live && <LiveMark size={15} />}
      </View>
      {/* The rides in order, as big line badges: [🚌 18] › [🚆]. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginVertical: 12 }}>
        {rides.map((l, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {i > 0 && <Icon name="chevron-right" size={28} color={t.c.onSurfaceVariant} />}
            <LineBadge label={simpleLine(l) || S.simple.mode[l.mode]} mode={l.mode} color={lineColor(l)} large />
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 21, fontWeight: '600', color: t.c.onSurface }}>{S.simple.arriveAt(timeText(itin.end, now))}</Text>
      <Text style={{ fontSize: 18, color: t.c.onSurfaceVariant }}>{S.simple.changes(Math.max(rides.length - 1, 0))}</Text>
    </Pressable>
  );
}

function WalkCard({ itin, onPress }: { itin: Itinerary; onPress: () => void }) {
  const t = useTheme();
  const sec = itinDurationSec(itin);
  return (
    <Pressable onPress={onPress} style={[styles.card, { backgroundColor: t.c.surface, flexDirection: 'row', alignItems: 'center' }]} accessibilityRole="button" testID="simple_walk">
      <Icon name="directions-walk" size={40} color={t.c.primary} />
      <View style={{ marginStart: 14, flex: 1 }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: t.c.onSurface }}>{S.simple.walkThere(simpleMinutes(sec))}</Text>
        <Text style={{ fontSize: 19, color: t.c.onSurfaceVariant }}>{S.simple.arriveAt(Fmt.time(nowSec() + sec))}</Text>
      </View>
    </Pressable>
  );
}

// ---- Trip ----

/** One way there, as numbered plain steps that follow the buses live. */
export function SimpleTripScreen({ route }: NativeStackScreenProps<RootStack, 'SimpleTrip'>) {
  const { planner, initial } = route.params;
  useWatch(planner);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // The option as it stands now: the planner may have moved it to a bus that's coming sooner.
  const itin = expectedOf(planner, planner.itineraries.find((i) => i.id === initial.id) ?? initial);
  const steps = simpleSteps(itin);
  const liveRide = (l: Leg) => planner.rideLive.get(rideKey(l))?.status === 'LIVE';
  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }}>
      <TopBar title={S.simple.howToGetThere} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 16 }} testID="simple_steps">
        {steps.map((s, i) => (
          <Step key={i} n={i + 1} step={s} live={s.kind === 'ride' && liveRide(s.leg)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Step({ n, step, live }: { n: number; step: SimpleStep; live: boolean }) {
  const t = useTheme();
  switch (step.kind) {
    case 'walkToStop':
      return <StepCard n={n} icon="directions-walk" color={t.x.walk} title={S.simple.walkToStop(step.stop)} lines={[S.simple.aboutMin(step.minutes)]} />;
    case 'walkToEnd':
      return <StepCard n={n} icon="directions-walk" color={t.x.walk} title={S.simple.walkToDestination} lines={[S.simple.aboutMin(step.minutes)]} />;
    case 'arrive':
      return <StepCard n={n} icon="flag" color={t.c.primary} title={S.simple.arrived} lines={[S.simple.arriveAt(timeText(step.at))]} />;
    case 'ride': {
      const color = lineColor(step.leg);
      const lines = [
        ...(step.leg.headsign?.trim() ? [S.simple.towards(step.leg.headsign)] : []),
        S.simple.leavesAt(timeText(step.departs)),
        ...(step.platform != null ? [S.simple.platform(step.platform)] : []),
        ...(step.others.length > 0 ? [S.simple.orLines(step.others.join(', '))] : []),
      ];
      return (
        <View style={{ gap: 12 }}>
          <StepCard n={n} icon={modeIcon(step.leg.mode)} color={color} title={S.simple.take(step.leg.mode, step.line)} lines={lines} live={live} />
          <StepCard icon="flag" color={color} title={S.simple.getOffAt(step.getOff)} lines={[S.simple.rideStops(step.stops)]} />
        </View>
      );
    }
  }
}

function StepCard({ n, icon, color, title, lines, live = false }: { n?: number; icon: IconName; color: string; title: string; lines: string[]; live?: boolean }) {
  const t = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: t.c.surface, flexDirection: 'row', padding: 18 }]} testID="simple_step">
      <View style={[styles.stepIcon, { backgroundColor: color }]}>
        <Icon name={icon} size={30} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, marginStart: 16 }}>
        {n != null && <Text style={{ fontSize: 16, fontWeight: '700', color: t.c.onSurfaceVariant }}>{n}</Text>}
        <Text style={{ fontSize: 23, lineHeight: 28, fontWeight: '700', color: t.c.onSurface }}>{title}</Text>
        {lines.map((l, i) => (
          <Text key={i} style={{ fontSize: 19, lineHeight: 24, color: t.c.onSurfaceVariant }}>
            {l}
          </Text>
        ))}
        {live && (
          <View style={{ marginTop: 4 }}>
            <LiveMark />
          </View>
        )}
      </View>
    </View>
  );
}

// ---- Settings ----

/** Simple Maslul's own few settings: language, the buttons, and the way back to the full app. */
export function SimpleSettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const focused = useIsFocused();
  const current = lang().toUpperCase() as LanguageSetting;
  const [confirmFull, setConfirmFull] = useState(false);
  const [editing, setEditing] = useState<{ index: number; draft: SimpleButton } | null>(null);

  const setLanguage = (l: LanguageSetting) => {
    store.updateSettings((s) => ({ ...s, language: l }));
    void changeLanguage(l);
  };
  const save = () => {
    if (editing) store.setSimpleButton(editing.index, editing.draft);
    setEditing(null);
  };
  const pickAddress = () => {
    if (!editing) return;
    nav.push('SimpleSearch', {
      title: S.simple.whereIs(buttonTitle(editing.draft)),
      onPick: (p) => {
        setEditing((e) => e && { ...e, draft: { ...e.draft, place: p } });
        nav.pop();
      },
    });
  };
  const draft = editing?.draft;

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }}>
      <TopBar title={S.simple.settings} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 16 }}>
        <Text style={[styles.header, { color: t.c.primary }]}>{S.simple.language}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['EN', 'HE', 'RU'] as const).map((l) => {
            const on = l === current;
            return (
              <Pressable
                key={l}
                onPress={() => setLanguage(l)}
                style={[styles.lang, { backgroundColor: on ? t.c.primary : t.c.surfaceVariant }]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                testID={`simple_lang_${l.toLowerCase()}`}
              >
                {on && <Icon name="check" size={20} color={t.c.onPrimary} />}
                <Text style={{ fontSize: 19, fontWeight: '600', color: on ? t.c.onPrimary : t.c.onSurface, marginStart: on ? 4 : 0 }}>{S.settings.languages[l]}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.header, { color: t.c.primary, marginTop: 20 }]}>{S.simple.buttons}</Text>
        <Text style={{ fontSize: 17, color: t.c.onSurfaceVariant, marginBottom: 6 }}>{S.simple.editHint}</Text>
        {simpleSlots(data).map((b, i) => (
          <Pressable
            key={i}
            onPress={() => setEditing({ index: i, draft: b })}
            style={[styles.card, { backgroundColor: t.c.surface, flexDirection: 'row', alignItems: 'center', padding: 14, marginVertical: 5 }]}
            accessibilityRole="button"
            testID={`simple_edit_${i}`}
          >
            <View style={[styles.slotIcon, { backgroundColor: slotColor(i) }]}>
              <Icon name={ICONS[b.icon]} size={28} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1, marginStart: 14 }}>
              <Text style={{ fontSize: 21, fontWeight: '600', color: t.c.onSurface }}>{buttonTitle(b)}</Text>
              <Text style={{ fontSize: 17, color: t.c.onSurfaceVariant }} numberOfLines={1}>
                {b.place ? withCity(b.place) : S.simple.notSet}
              </Text>
            </View>
            <Icon name="edit" color={t.c.onSurfaceVariant} />
          </Pressable>
        ))}

        <Pressable onPress={() => setConfirmFull(true)} style={[styles.fullApp, { borderColor: t.c.outline }]} accessibilityRole="button" testID="simple_full_app">
          <Icon name="apps" color={t.c.primary} />
          <Text style={{ fontSize: 19, color: t.c.primary, marginStart: 8 }}>{S.simple.fullApp}</Text>
        </Pressable>
      </ScrollView>

      <Dialog
        visible={confirmFull}
        title={S.simple.fullApp}
        onDismiss={() => setConfirmFull(false)}
        actions={
          <>
            <TextButton text={S.simple.cancel} onPress={() => setConfirmFull(false)} />
            <TextButton
              text={S.simple.fullAppConfirm}
              onPress={() => {
                setConfirmFull(false);
                store.updateSettings((s) => ({ ...s, simpleMode: false }));
              }}
              testID="simple_full_confirm"
            />
          </>
        }
      >
        <Text style={{ fontSize: 18, color: t.c.onSurface }}>{S.simple.fullAppBody}</Text>
      </Dialog>

      {/* Hidden while the address search is open on top (a modal would cover it). */}
      <Dialog
        visible={draft != null && focused}
        title={draft ? buttonTitle(draft) : ''}
        onDismiss={() => setEditing(null)}
        actions={
          <>
            <TextButton text={S.simple.cancel} onPress={() => setEditing(null)} />
            <TextButton text={S.simple.save} onPress={save} testID="simple_edit_save" />
          </>
        }
        testID="simple_edit_dialog"
      >
        {draft && (
          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 15, color: t.c.onSurfaceVariant }}>{S.simple.name}</Text>
            <TextInput
              value={draft.label}
              onChangeText={(v) => setEditing((e) => e && { ...e, draft: { ...e.draft, label: v } })}
              placeholder={S.simple.iconName[draft.icon]}
              placeholderTextColor={t.x.subtle}
              style={[textDirection, styles.nameField, { borderColor: t.c.outline, color: t.c.onSurface }]}
              accessibilityLabel={S.simple.name}
              testID="simple_edit_name"
            />
            <Text style={{ fontSize: 16, fontWeight: '600', color: t.c.onSurface, marginTop: 14, marginBottom: 6 }}>{S.simple.picture}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {SIMPLE_ICONS.map((ic) => {
                const on = ic === draft.icon;
                return (
                  <Pressable
                    key={ic}
                    onPress={() => setEditing((e) => e && { ...e, draft: { ...e.draft, icon: ic } })}
                    style={[styles.iconChoice, { backgroundColor: on ? t.c.primaryContainer : t.c.surfaceVariant }, on && { borderWidth: 2, borderColor: t.c.primary }]}
                    accessibilityRole="button"
                    accessibilityLabel={S.simple.iconName[ic]}
                    accessibilityState={{ selected: on }}
                  >
                    <Icon name={ICONS[ic]} size={26} color={on ? t.c.onPrimaryContainer : t.c.onSurfaceVariant} />
                  </Pressable>
                );
              })}
            </View>
            <Text style={{ fontSize: 16, fontWeight: '600', color: t.c.onSurface, marginTop: 14 }}>{S.simple.address}</Text>
            <Text style={{ fontSize: 18, color: t.c.onSurface }}>{draft.place ? withCity(draft.place) : S.simple.notSet}</Text>
            <View style={{ flexDirection: 'row' }}>
              <TextButton text={S.simple.changeAddress} onPress={pickAddress} testID="simple_edit_address" />
              {draft.place != null && <TextButton text={S.simple.clear} onPress={() => setEditing((e) => e && { ...e, draft: { ...e.draft, place: null } })} />}
            </View>
          </ScrollView>
        )}
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 56, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12 },
  backText: { fontSize: 20, fontWeight: '600', marginStart: 8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  wide: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 64, borderRadius: 18, paddingHorizontal: 20, paddingVertical: 16 },
  big: { flex: 1, borderRadius: 24, padding: 10, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  bigTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 28, fontWeight: '700', textAlign: 'center', marginTop: 8 },
  bigHint: { color: 'rgba(255,255,255,0.9)', fontSize: 15, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  settingsLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, marginVertical: 8 },
  field: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14 },
  message: { fontSize: 20, padding: 20 },
  recent: { fontSize: 18, fontWeight: '600', paddingHorizontal: 20, paddingVertical: 8 },
  result: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  card: { borderRadius: 22, padding: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  stepIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  header: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  lang: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 16, paddingVertical: 18 },
  slotIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  fullApp: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 60, borderRadius: 30, borderWidth: 1, marginTop: 28 },
  nameField: { fontSize: 20, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginTop: 4 },
  iconChoice: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
