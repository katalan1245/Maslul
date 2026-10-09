import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, I18nManager, Image, Linking, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line as SvgLine, Path, Rect } from 'react-native-svg';
import { THEME_MODES, type ThemeMode, favoriteKey } from '../../data/userStore';
import { LANGUAGES, type LanguageSetting, S } from '../../i18n';
import { changeLanguage } from '../../i18n/device';
import { store, useUserData } from '../../state/store';
import { APP_VERSION } from '../../version';
import { Chip, IconButton, PlaceRow, SectionHeader, Segmented, SettingSwitch, TextButton, Txt } from '../components/common';
import { type FavoriteDraft, FavoriteDialogHost, draftFor } from '../components/favorites';
import { FAVORITE_ICON_NAMES, Icon } from '../components/icons';
import { nav } from '../nav';
import { BRAND, useTheme } from '../theme';
import { pickHomeOrWork } from './NavHome';

const SOURCE_URL = 'https://github.com/Tom-stack3/Maslul';


export function SettingsScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  const s = data.settings;
  const [draft, setDraft] = useState<FavoriteDraft | null>(null);
  const [taps, setTaps] = useState(0);
  const [drives, setDrives] = useState(0);

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

  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="settings_screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <IconButton icon="arrow-back" label={S.common.back} onPress={nav.pop} />
        <Txt v="titleLarge" accessibilityRole="header">
          {S.settings.title}
        </Txt>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <SectionHeader text={S.settings.places} />
        <PlaceRow
          title={S.settings.home}
          subtitle={data.home?.name ?? S.common.notSet}
          icon="home"
          trailing={data.home ? <IconButton icon="close" label={S.common.clear} onPress={() => store.setHome(null)} /> : undefined}
          onPress={() => pickHomeOrWork(true)}
        />
        <PlaceRow
          title={S.settings.work}
          subtitle={data.work?.name ?? S.common.notSet}
          icon="work"
          trailing={data.work ? <IconButton icon="close" label={S.common.clear} onPress={() => store.setWork(null)} /> : undefined}
          onPress={() => pickHomeOrWork(false)}
        />

        <SectionHeader text={S.settings.favoritePlaces} />
        {data.favoritePlaces.map((f, i) => (
          <PlaceRow
            key={favoriteKey(f)}
            title={f.label}
            subtitle={f.place.name}
            icon={FAVORITE_ICON_NAMES[f.icon]}
            iconTint={t.c.primary}
            trailing={
              <View style={{ flexDirection: 'row' }}>
                <IconButton icon="keyboard-arrow-up" label={S.common.moveUp} disabled={i === 0} onPress={() => store.moveFavorite(favoriteKey(f), -1)} />
                <IconButton
                  icon="keyboard-arrow-down"
                  label={S.common.moveDown}
                  disabled={i === data.favoritePlaces.length - 1}
                  onPress={() => store.moveFavorite(favoriteKey(f), 1)}
                />
              </View>
            }
            onPress={() => setDraft({ place: f.place, existing: f })}
          />
        ))}
        <PlaceRow title={S.settings.addFavoritePlace} subtitle={S.settings.addFavoriteHint} icon="add" iconTint={t.c.primary} onPress={addFavorite} />

        <SectionHeader text={S.settings.appearance} />
        <View style={{ paddingHorizontal: 20 }}>
          <Segmented<ThemeMode>
            options={THEME_MODES.map((m) => ({ value: m, label: S.settings.themes[m] }))}
            value={s.theme}
            onChange={(m) => store.updateSettings((st) => ({ ...st, theme: m }))}
            testID="theme"
          />
        </View>

        <SectionHeader text={S.settings.language} />
        <View style={{ paddingHorizontal: 20 }}>
          <Segmented<LanguageSetting>
            options={LANGUAGES.map((m) => ({ value: m, label: S.settings.languages[m] }))}
            value={s.language}
            onChange={(m) => {
              store.updateSettings((st) => ({ ...st, language: m }));
              void changeLanguage(m);
            }}
            testID="language"
          />
        </View>

        <SectionHeader text={S.settings.reminders} />
        <Txt v="bodyMedium" color={t.x.subtle} style={{ paddingHorizontal: 20 }}>
          {S.settings.remindersHint}
        </Txt>
        <View style={styles.chips}>
          {[2, 5, 10, 15].map((m) => (
            <Chip key={m} label={S.fmt.min(m)} selected={s.reminderMinutes === m} onPress={() => store.updateSettings((st) => ({ ...st, reminderMinutes: m }))} />
          ))}
        </View>

        <SectionHeader text={S.settings.advanced} />
        <SettingSwitch
          title={S.settings.rides}
          subtitle={S.settings.ridesHint}
          value={s.rides}
          onChange={(c) => store.updateSettings((st) => ({ ...st, rides: c }))}
          testID="rides_switch"
        />
        <SettingSwitch
          title={S.settings.onBoard}
          subtitle={S.settings.onBoardHint}
          value={s.onBoard}
          onChange={(c) => store.updateSettings((st) => ({ ...st, onBoard: c }))}
          testID="on_board_switch"
        />
        <PlaceRow
          title={S.settings.myShuttles}
          subtitle={
            data.shuttles.length === 0
              ? S.settings.shuttlesNone
              : data.shuttles.length === 1
                ? data.shuttles[0].name
                : S.settings.shuttlesCount(data.shuttles.length)
          }
          icon="directions-bus"
          iconTint={t.c.primary}
          onPress={() => nav.push('Shuttles')}
          testID="my_shuttles"
        />

        <SectionHeader text={S.settings.about} />
        <Pressable
          onPress={() => {
            const n = taps + 1;
            setTaps(n);
            if (n % 7 === 0) setDrives(drives + 1);
          }}
          style={styles.about}
          accessible={false}
        >
          <View style={[styles.logo, { backgroundColor: BRAND }]}>
            <Image source={require('../../../assets/adaptive-icon.png')} style={{ width: 56, height: 56 }} accessibilityIgnoresInvertColors />
          </View>
          <View style={{ marginLeft: 12 }}>
            <Txt v="titleMedium">Maslul</Txt>
            <Txt v="bodySmall" color={t.x.subtle}>{S.settings.version(APP_VERSION)}</Txt>
          </View>
        </Pressable>
        <Txt v="bodyMedium" color={t.x.subtle} style={{ paddingHorizontal: 20, paddingVertical: 8 }} testID="about_credits">
          {S.settings.credits}
        </Txt>
        <Pressable onPress={() => Linking.openURL(SOURCE_URL)} style={styles.source} accessibilityRole="link">
          <Icon name="code" size={18} color={t.c.primary} />
          <Txt v="labelLarge" color={t.c.primary} style={{ marginLeft: 8 }}>
            {S.settings.sourceCode}
          </Txt>
        </Pressable>
        <View style={{ alignItems: 'flex-start', paddingHorizontal: 8 }}>
          <TextButton text={S.settings.madeBy} color={t.x.subtle} onPress={() => Linking.openURL(`${SOURCE_URL}/graphs/contributors`)} />
        </View>
      </ScrollView>
      {drives > 0 && <DrivingBus key={drives} bottom={insets.bottom + 12} />}
      <FavoriteDialogHost draft={draft} onClose={() => setDraft(null)} />
    </View>
  );
}

/** Seven taps on the About row send a little bus across the screen. */
function DrivingBus({ bottom }: { bottom: number }) {
  const { width } = useWindowDimensions();
  const w = 104;
  const h = 52;
  const x = useRef(new Animated.Value(-w)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false);
  useEffect(() => {
    const drive = Animated.timing(x, { toValue: width + w, duration: 2800, easing: Easing.linear, useNativeDriver: true });
    const b = Animated.loop(Animated.sequence([Animated.timing(bob, { toValue: -2, duration: 160, useNativeDriver: true }), Animated.timing(bob, { toValue: 0, duration: 160, useNativeDriver: true })]));
    const sp = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 500, easing: Easing.linear, useNativeDriver: true }));
    b.start();
    sp.start();
    drive.start(() => setDone(true));
    return () => {
      drive.stop();
      b.stop();
      sp.stop();
    };
  }, [x, bob, spin, width]);
  if (done) return null;
  const u = w / 26;
  const wheel = (cx: number) => (
    <Animated.View
      key={cx}
      style={{ position: 'absolute', left: cx - 2.6 * u, top: 10.3 * u - 2.6 * u, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}
    >
      <Svg width={5.2 * u} height={5.2 * u}>
        <Circle cx={2.6 * u} cy={2.6 * u} r={2.6 * u} fill="#263238" />
        <Circle cx={2.6 * u} cy={2.6 * u} r={1.1 * u} fill="#B0BEC5" />
        <SvgLine x1={2.6 * u} y1={2.6 * u} x2={2.6 * u} y2={1.5 * u} stroke="#263238" strokeWidth={0.5 * u} />
      </Svg>
    </Animated.View>
  );
  return (
    // Right to left in Hebrew, facing that way; its parts stay laid out as drawn.
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        bottom,
        width: w,
        height: h,
        direction: 'ltr',
        transform: I18nManager.isRTL ? [{ translateX: Animated.multiply(x, -1) }, { translateY: bob }, { scaleX: -1 }] : [{ translateX: x }, { translateY: bob }],
      }}
    >
      <Svg width={w} height={h}>
        {/* Body, with a slanted windscreen at the front (right). */}
        <Rect x={0} y={0} width={24 * u} height={10 * u} rx={2.5 * u} fill={BRAND} />
        <Path d={`M${22 * u} 0 L${24 * u} 0 L${26 * u} ${6 * u} L${26 * u} ${10 * u} L${22 * u} ${10 * u} Z`} fill={BRAND} />
        {/* Side windows and windscreen. */}
        {[0, 1, 2, 3, 4].map((i) => (
          <Rect key={i} x={(1.5 + i * 4) * u} y={1.5 * u} width={3 * u} height={3.5 * u} rx={0.6 * u} fill="#D6E6FF" />
        ))}
        <Path d={`M${22.3 * u} ${1.5 * u} L${23.6 * u} ${1.5 * u} L${25.2 * u} ${5 * u} L${22.3 * u} ${5 * u} Z`} fill="#D6E6FF" />
        <Rect x={0} y={6.5 * u} width={26 * u} height={0.6 * u} fill="rgba(255,255,255,0.5)" />
      </Svg>
      {wheel(6 * u)}
      {wheel(20 * u)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 4 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  about: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
  logo: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  source: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
});
