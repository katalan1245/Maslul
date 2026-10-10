/**
 * The app in Hebrew: the first launch turns the layout right-to-left, and no English UI text is
 * left on the main screens. Place and stop names come from the (English) fake data, so only the
 * app's own strings are checked: any English string of en.ts that he.ts words differently.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';
import App from '../src/App';
import { S } from '../src/i18n';
import { deviceLang } from '../src/i18n/device';
import { en } from '../src/i18n/en';
import { he } from '../src/i18n/he';
import { MIGRATED_KEY, STORE_KEY } from '../src/state/persist';

jest.mock('expo', () => ({ ...jest.requireActual('expo'), reloadAppAsync: jest.fn(async () => {}) }));
jest.mock('../modules/maslul-native/src/MaslulNativeModule', () => ({
  __esModule: true,
  default: { readLegacyStore: async () => null, fetchSiriVehicles: async () => null, updateTripNotification: async () => false },
}));
jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

/** English strings that should never show in Hebrew. */
function english(e: unknown, h: unknown, out = new Set<string>()): Set<string> {
  if (typeof e === 'string') {
    if (e !== h && /[A-Za-z]{3}/.test(e)) out.add(e.trim());
  } else if (e != null && typeof e === 'object') {
    for (const k of Object.keys(e)) english((e as Record<string, unknown>)[k], (h as Record<string, unknown>)[k], out);
  }
  return out;
}
const ENGLISH = english(en, he);

/** Every text and label on screen. */
function shown(): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (typeof n === 'string') out.push(n.trim());
    else if (Array.isArray(n)) n.forEach(walk);
    else if (n != null && typeof n === 'object') {
      const { props, children } = n as { props?: Record<string, unknown>; children?: unknown };
      for (const k of ['accessibilityLabel', 'accessibilityHint', 'placeholder']) if (typeof props?.[k] === 'string') out.push((props[k] as string).trim());
      walk(children);
    }
  };
  walk(screen.toJSON());
  return out;
}

const leaks = () => shown().filter((s) => ENGLISH.has(s));

async function launchHebrew(reloadedJustNow: boolean, data: object = {}) {
  await AsyncStorage.clear();
  await AsyncStorage.setItem(MIGRATED_KEY, '1');
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify({ ...data, settings: { language: 'HE' } }));
  // As after the reload that turned the layout right-to-left (the test renderer can't flip it).
  if (reloadedJustNow) await AsyncStorage.setItem('direction_reload_v1', `rtl:${Date.now()}`);
  await render(<App />);
}

it('the first launch in Hebrew turns the layout right-to-left and reloads', async () => {
  const force = jest.spyOn(I18nManager, 'forceRTL');
  await launchHebrew(false);
  await waitFor(() => expect(reloadAppAsync).toHaveBeenCalled());
  expect(force).toHaveBeenCalledWith(true);
});

it('shows the main screens without English UI text', async () => {
  await launchHebrew(true);
  await screen.findByText(he.home.whereTo);
  expect(S).toBe(he);
  expect(leaks()).toEqual([]);

  // Settings, with the credits the licences ask for.
  await fireEvent.press(screen.getByTestId('settings_button'));
  const about = await screen.findByTestId('about_credits');
  expect(leaks()).toEqual([]);
  for (const credit of ['GNU AGPL v3', 'Transitous', 'Open Bus', 'Stride', 'Photon', 'Nominatim', 'OpenFreeMap', '© OpenStreetMap contributors'])
    expect(about).toHaveTextContent(credit, { exact: false });
  await fireEvent.press(screen.getByLabelText(he.common.back));

  // Routes and a route's details.
  await fireEvent.press(await screen.findByText(he.home.whereTo));
  await fireEvent.changeText(screen.getByTestId('field_to'), 'dizengoff center');
  expect(leaks()).toEqual([]);
  await fireEvent.press(await screen.findByText('Dizengoff Center', { exact: false }));
  await screen.findAllByTestId('route_card');
  expect(leaks()).toEqual([]);
  await fireEvent.press(screen.getByTestId('options_chip'));
  await screen.findByTestId('options_sheet');
  expect(leaks()).toEqual([]);
  await fireEvent.press(screen.getByText(he.sheets.showRoutes));
  await fireEvent.press((await screen.findAllByTestId('route_card'))[0]);
  await screen.findByTestId('start_button');
  expect(leaks()).toEqual([]);
});

it('shows the lines and stations tabs without English UI text', async () => {
  await launchHebrew(true);
  await screen.findByText(he.home.whereTo);
  await fireEvent.press(screen.getByTestId('tab_lines'));
  await fireEvent.changeText(await screen.findByTestId('line_search'), '480');
  await fireEvent.press((await screen.findAllByTestId('line_row'))[0]);
  await screen.findByTestId('line_stops');
  expect(leaks()).toEqual([]);
  await fireEvent.press(screen.getByText(he.line.timetable));
  expect(leaks()).toEqual([]);
  await fireEvent.press(screen.getByLabelText(he.common.back));
  await fireEvent.press(screen.getByTestId('tab_stations'));
  await screen.findByTestId('station_search');
  expect(leaks()).toEqual([]);
});

it('words Hebrew counts and days naturally', () => {
  expect(he.cards.transfers(1)).toBe('החלפה אחת');
  expect(he.cards.transfers(2)).toBe('2 החלפות');
  expect(he.cards.stopsAway(1)).toBe('עוד תחנה אחת');
  expect(he.cards.isClose('BUS')).toBe('האוטובוס קרוב');
  expect(he.cards.isClose('TRAIN')).toBe('הרכבת קרובה');
  expect(he.shuttles.stillNeeded(['שם', 'שעות יציאה'])).toBe('עוד חסר: שם ושעות יציאה.');
  // Sunday first, as the week goes in Israel.
  expect(he.shuttles.days[7]).toBe('א׳');
  expect(he.routes.lastToday('23:40', 'ארלוזורוב')).toBe('האחרון להיום יוצא ב-23:40 מהתחנה ארלוזורוב');
  expect(en.cards.transfers(1)).toBe('1 transfer');
});

it('takes Hebrew from the phone however the platform writes it', () => {
  const ids = (id: string) => {
    jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ ...I18nManager.getConstants(), localeIdentifier: id });
    return deviceLang();
  };
  expect(['he_IL', 'iw_IL', 'he-IL', 'he'].map(ids)).toEqual(['he', 'he', 'he', 'he']);
  expect(['en_US', 'hello'].map(ids)).toEqual(['en', 'en']);
});

it('takes the language iOS gives the app over React Native locale, which missed Hebrew on a Hebrew iPhone', () => {
  const native = (require('../modules/maslul-native/src/MaslulNativeModule') as { default: { preferredLanguage?: string } }).default;
  jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ ...I18nManager.getConstants(), localeIdentifier: 'en_US' });
  native.preferredLanguage = 'he-IL';
  try {
    expect(deviceLang()).toBe('he');
  } finally {
    delete native.preferredLanguage;
  }
  expect(deviceLang()).toBe('en');
});

it('words the saved-routes banner and "all left" in Hebrew', async () => {
  const fake = (require('../src/state/services') as { repo: { plan: unknown } }).repo;
  const plan = fake.plan;
  await launchHebrew(true);
  await fireEvent.press(await screen.findByText(he.home.whereTo));
  await fireEvent.changeText(screen.getByTestId('field_to'), 'dizengoff center');
  await fireEvent.press(await screen.findByText('Dizengoff Center', { exact: false }));
  await screen.findAllByTestId('route_card');
  await waitFor(async () => expect(await AsyncStorage.getItem('saved_routes_v1')).not.toBeNull());
  fake.plan = async () => {
    throw new TypeError('Network request failed');
  };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await fireEvent.press(screen.getByTestId('refresh_chip'));
    await screen.findByTestId('saved_routes_banner');
    expect(screen.getByText(/^אין מסלולים חדשים, מוצגים המסלולים שנשמרו ב-\d\d:\d\d$/)).toBeTruthy();
    expect(leaks()).toEqual([]);
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 3600_000);
    await fireEvent.press(screen.getByTestId('refresh_chip'));
    await screen.findByText(/המסלולים שנשמרו ב-\d\d:\d\d כבר יצאו\./);
    expect(leaks()).toEqual([]);
  } finally {
    fake.plan = plan;
    jest.restoreAllMocks();
  }
});

it('shows the starred stops on Home without English UI text', async () => {
  await launchHebrew(true, { favoriteStops: [{ name: 'Arlozorov/Ibn Gabirol', lat: 32.0866, lon: 34.7818, kind: 'STOP', stopId: 'il-Israel-MOT_21437' }] });
  await screen.findByText(he.stations.favorites);
  await screen.findByTestId('board_row');
  expect(leaks()).toEqual([]);
});

it('offers the stop reminder in Hebrew', async () => {
  await launchHebrew(true);
  await fireEvent.press(await screen.findByTestId('tab_stations'));
  await fireEvent.press(await screen.findByText('Arlozorov/Ibn Gabirol'));
  await fireEvent(await screen.findByTestId('board_row'), 'longPress');
  await screen.findByText(he.stopBoard.remindLeave);
  expect(leaks()).toEqual([]);
});
