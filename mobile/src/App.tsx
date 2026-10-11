import AsyncStorage from '@react-native-async-storage/async-storage';
import { type BottomTabNavigationOptions, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { Fragment, useEffect, useState } from 'react';
import { AppState, Linking, LogBox, Platform, Pressable, StyleSheet, View, useColorScheme, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Place } from './data/models';
import { END_TRIP_URL, activeTrip, useActiveTrip } from './live/liveTrip';
import { rescheduleReminders, setUpNotifications } from './live/notifications';
import MaslulNative from '../modules/maslul-native/src/MaslulNativeModule';
import { readLegacyStore } from './native';
import { navMemory } from './ui/navMemory';
import { S, lang } from './i18n';
import { applyLanguage, backToSettings } from './i18n/device';
import { repo } from './state/services';
import { store, useUserData } from './state/store';
import { Txt } from './ui/components/common';
import { Icon, type IconName } from './ui/components/icons';
import { ToastHost } from './ui/components/overlays';
import { type RootStack, type Tabs, nav, navigationRef } from './ui/nav';
import { LineScreen } from './ui/screens/Line';
import { LinesHomeScreen } from './ui/screens/LinesHome';
import { NavHomeScreen } from './ui/screens/NavHome';
import { OnBoardScreen } from './ui/screens/OnBoard';
import { PickOnMapScreen } from './ui/screens/PickOnMap';
import { RouteDetailScreen } from './ui/screens/RouteDetail';
import { RoutesScreen } from './ui/screens/Routes';
import { SearchScreen } from './ui/screens/Search';
import { SettingsScreen } from './ui/screens/Settings';
import { ShuttleEditScreen, ShuttlesScreen } from './ui/screens/Shuttles';
import { StationsHomeScreen } from './ui/screens/StationsHome';
import { StopScreen } from './ui/screens/Stop';
import { TripScreen } from './ui/screens/Trip';
import { SimpleHomeScreen, SimpleRoutesScreen, SimpleSearchScreen, SimpleSettingsScreen, SimpleTripScreen } from './ui/simple/SimpleScreens';
import { ThemeContext, darkTheme, lightTheme, useTheme } from './ui/theme';

// Screens hand each other callbacks (a search's onDone, like the Kotlin app's models did); the
// navigation state is never persisted or deep-linked, so that's fine.
LogBox.ignoreLogs(['Non-serializable values were found in the navigation state']);

void SplashScreen.preventAutoHideAsync().catch(() => {});

const Stack = createNativeStackNavigator<RootStack>();
const Tab = createBottomTabNavigator<Tabs>();

const tabIcon =
  (name: IconName): BottomTabNavigationOptions['tabBarIcon'] =>
  ({ color, size }) => <Icon name={name} color={color} size={size} />;

function TabsScreen() {
  const t = useTheme();
  return (
    <Tab.Navigator
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.c.primary,
        tabBarInactiveTintColor: t.c.onSurfaceVariant,
        tabBarStyle: { backgroundColor: t.c.surface, borderTopColor: t.x.divider },
      }}
    >
      <Tab.Screen name="Navigate" component={NavHomeScreen} options={{ tabBarIcon: tabIcon('directions'), tabBarLabel: S.tabs.navigate, tabBarButtonTestID: 'tab_navigate' }} />
      <Tab.Screen name="Lines" component={LinesHomeScreen} options={{ tabBarIcon: tabIcon('timeline'), tabBarLabel: S.lines.title, tabBarButtonTestID: 'tab_lines' }} />
      <Tab.Screen name="Stations" component={StationsHomeScreen} options={{ tabBarIcon: tabIcon('place'), tabBarLabel: S.stations.title, tabBarButtonTestID: 'tab_stations' }} />
    </Tab.Navigator>
  );
}

/** Ongoing live trip, reachable from anywhere but its own route screen. */
function LiveTripBanner({ routeName }: { routeName: string | undefined }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const s = useActiveTrip();
  if (s == null || routeName === 'RouteDetail') return null;
  const open = () => {
    const legs = s.itinerary.legs;
    const first = legs[0].from;
    const last = legs[legs.length - 1].to;
    const from: Place = { name: first.name.trim() || S.common.start, lat: first.lat, lon: first.lon, kind: 'PIN' };
    const to: Place = { name: s.destination, lat: last.lat, lon: last.lon, kind: 'PIN' };
    nav.push('RouteDetail', { itinerary: s.itinerary, from, to });
  };
  return (
    <Pressable
      onPress={open}
      style={[styles.banner, { backgroundColor: t.c.primary, bottom: insets.bottom + (routeName === 'Tabs' || routeName == null ? 64 : 12) }]}
      accessibilityRole="button"
      testID="live_trip_banner"
    >
      <Icon name="navigation" color={t.c.onPrimary} />
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Txt v="titleSmall" color={t.c.onPrimary} numberOfLines={1}>
          {s.state?.title ?? S.notify.liveDirections}
        </Txt>
        <Txt v="bodySmall" color={t.c.onPrimary} numberOfLines={1} style={{ opacity: 0.85 }}>
          {s.state?.text ?? s.destination}
        </Txt>
      </View>
    </Pressable>
  );
}

function Root() {
  const data = useUserData();
  const system = useColorScheme();
  const simple = data.settings.simpleMode;
  const { fontScale } = useWindowDimensions();
  // Places and stop names come in the app's language, which can change without a restart.
  repo.language = lang();
  const dark = data.settings.theme === 'SYSTEM' ? system === 'dark' : data.settings.theme === 'DARK';
  const theme = dark ? darkTheme : lightTheme;
  const [routeName, setRouteName] = useState<string | undefined>(undefined);
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(theme.c.background).catch(() => {});
  }, [theme]);
  const navTheme = {
    ...(dark ? DarkTheme : DefaultTheme),
    colors: { ...(dark ? DarkTheme : DefaultTheme).colors, background: theme.c.background, card: theme.c.surface, primary: theme.c.primary, text: theme.c.onSurface },
  };
  return (
    <ThemeContext.Provider value={theme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {/* Screens already drawn keep their old text sizes when the phone's text size changes (seen on
          iOS: clipped labels), so everything is drawn again, on the same screens. */}
      {/* So is a change between languages written the same way round (English and Russian). */}
      <Fragment key={`${fontScale}:${lang()}`}>
      <NavigationContainer
        ref={navigationRef}
        initialState={navigationRef.isReady() ? navigationRef.getRootState() : navMemory.state}
        theme={navTheme}
        onStateChange={(state) => {
          navMemory.state = state;
          setRouteName(navigationRef.getCurrentRoute()?.name);
        }}>
        {/* Simple Maslul is its own app, without the tab bar: switching remounts the navigator at its home. */}
        <Stack.Navigator key={simple ? 'simple' : 'full'} screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          {simple ? (
            <>
              <Stack.Screen name="SimpleHome" component={SimpleHomeScreen} />
              <Stack.Screen name="SimpleSearch" component={SimpleSearchScreen} />
              <Stack.Screen name="SimpleRoutes" component={SimpleRoutesScreen} />
              <Stack.Screen name="SimpleTrip" component={SimpleTripScreen} />
              <Stack.Screen name="SimpleSettings" component={SimpleSettingsScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Tabs" component={TabsScreen} />
              <Stack.Screen name="Search" component={SearchScreen} />
              <Stack.Screen name="PickOnMap" component={PickOnMapScreen} />
              <Stack.Screen name="Routes" component={RoutesScreen} />
              <Stack.Screen name="RouteDetail" component={RouteDetailScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="OnBoard" component={OnBoardScreen} />
              <Stack.Screen name="Shuttles" component={ShuttlesScreen} />
              <Stack.Screen name="ShuttleEdit" component={ShuttleEditScreen} />
              <Stack.Screen name="Line" component={LineScreen} />
              <Stack.Screen name="Stop" component={StopScreen} />
              <Stack.Screen name="Trip" component={TripScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
      {/* Its route screen is the full app's. */}
      {!simple && <LiveTripBanner routeName={routeName === 'Navigate' || routeName === 'Lines' || routeName === 'Stations' ? 'Tabs' : routeName} />}
      </Fragment>
      <ToastHost />
    </ThemeContext.Provider>
  );
}

/** App mounts again in the same JS runtime when Android rebuilds its screen (language, text size). */
let mounts = 0;

export default function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const again = mounts++ > 0;
    (async () => {
      // The first launch after the Kotlin app moves its saved places and settings over.
      await store.load(AsyncStorage, readLegacyStore).catch(() => {});
      // Before anything is drawn; when the layout direction has to change, the app reloads (splash stays up).
      if (await applyLanguage(store.value.settings.language, again)) return;
      if (await backToSettings()) {
        const simple = store.value.settings.simpleMode;
        navMemory.state = { index: 1, routes: simple ? [{ name: 'SimpleHome' }, { name: 'SimpleSettings' }] : [{ name: 'Tabs' }, { name: 'Settings' }] } as unknown as typeof navMemory.state;
      }
      repo.language = lang();
      setUpNotifications();
      await activeTrip.restore().catch(() => {});
      setReady(true);
      await SplashScreen.hideAsync().catch(() => {});
    })();
  }, []);
  // Reminders set before "Alarms & reminders" was allowed stay inexact: set them again once it is.
  // Taking it away cancels the alarms (and stops the app) while the reminders stay listed: set them again on launch.
  useEffect(() => {
    if (Platform.OS === 'android') void rescheduleReminders();
    let exact = MaslulNative?.canScheduleExactAlarms?.() ?? true;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = MaslulNative?.canScheduleExactAlarms?.() ?? true;
      if (now && !exact) void rescheduleReminders();
      exact = now;
    });
    return () => sub.remove();
  }, []);
  // The live-directions notification's "End trip".
  useEffect(() => {
    const handle = (url: string | null) => {
      if (url === END_TRIP_URL) void activeTrip.stop();
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Root />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
