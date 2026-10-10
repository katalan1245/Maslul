/**
 * The app in Russian (left to right, like English): no English UI text on the main screens, plurals
 * by Russian rules, and a Kotlin 1.2.1 user who picked Russian there keeps it after the update.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { I18nManager } from 'react-native';
import App from '../src/App';
import { S } from '../src/i18n';
import { deviceLang } from '../src/i18n/device';
import { en } from '../src/i18n/en';
import { plural, ru } from '../src/i18n/ru';
import { MIGRATED_KEY, STORE_KEY } from '../src/state/persist';

jest.mock('expo', () => ({ ...jest.requireActual('expo'), reloadAppAsync: jest.fn(async () => {}) }));
let mockLegacy: string | null = null;
jest.mock('../modules/maslul-native/src/MaslulNativeModule', () => ({
  __esModule: true,
  default: { readLegacyStore: async () => mockLegacy, fetchSiriVehicles: async () => null, updateTripNotification: async () => false },
}));
jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

/** English strings that should never show in Russian. */
function english(e: unknown, r: unknown, out = new Set<string>()): Set<string> {
  if (typeof e === 'string') {
    if (e !== r && /[A-Za-z]{3}/.test(e)) out.add(e.trim());
  } else if (e != null && typeof e === 'object') {
    for (const k of Object.keys(e)) english((e as Record<string, unknown>)[k], (r as Record<string, unknown>)[k], out);
  }
  return out;
}
const ENGLISH = english(en, ru);

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

async function launch(store: string | null, legacyStore: string | null = null) {
  await AsyncStorage.clear();
  mockLegacy = legacyStore;
  if (store != null) {
    await AsyncStorage.setItem(MIGRATED_KEY, '1');
    await AsyncStorage.setItem(STORE_KEY, store);
  }
  await render(<App />);
}

it('shows the main screens in Russian, left to right, without English UI text', async () => {
  const force = jest.spyOn(I18nManager, 'forceRTL');
  await launch(JSON.stringify({ settings: { language: 'RU' } }));
  await screen.findByText(ru.home.whereTo);
  expect(S).toBe(ru);
  expect(force).not.toHaveBeenCalledWith(true);
  expect(leaks()).toEqual([]);

  await fireEvent.press(screen.getByTestId('settings_button'));
  await screen.findByTestId('about_credits');
  expect(leaks()).toEqual([]);
  await fireEvent.press(screen.getByLabelText(ru.common.back));

  await fireEvent.press(await screen.findByText(ru.home.whereTo));
  await fireEvent.changeText(screen.getByTestId('field_to'), 'dizengoff center');
  await fireEvent.press(await screen.findByText('Dizengoff Center', { exact: false }));
  await screen.findAllByTestId('route_card');
  expect(leaks()).toEqual([]);
  await fireEvent.press((await screen.findAllByTestId('route_card'))[0]);
  await screen.findByTestId('start_button');
  expect(leaks()).toEqual([]);
});

it('a Kotlin 1.2.1 user who picked Russian there gets the app in Russian', async () => {
  await launch(null, JSON.stringify({ settings: { simpleLanguage: 'RU' } }));
  await screen.findByText(ru.home.whereTo);
  expect(S).toBe(ru);
});

it('follows a Russian phone', () => {
  jest.spyOn(I18nManager, 'getConstants').mockReturnValue({ ...I18nManager.getConstants(), localeIdentifier: 'ru_RU' });
  expect(deviceLang()).toBe('ru');
});

it('words Russian counts by its plural rules', () => {
  expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, 'остановка', 'остановки', 'остановок'))).toEqual([
    'остановка', 'остановки', 'остановок', 'остановок', 'остановок', 'остановка', 'остановки', 'остановок', 'остановок',
  ]);
  expect(ru.cards.transfers(3)).toBe('3 пересадки');
  expect(ru.detail.goThisWay(5, 'BUS')).toBe('5 автобусов в эту сторону');
  expect(ru.cards.stopsAway(2)).toBe('в 2 остановках отсюда');
});

it('shows Simple Maslul in Russian without English UI text', async () => {
  await launch(JSON.stringify({ settings: { language: 'RU', simpleMode: true } }));
  await screen.findByText(ru.simple.whereTo);
  expect(leaks()).toEqual([]);
  await fireEvent.press(screen.getByTestId('simple_search'));
  await fireEvent.changeText(screen.getByTestId('simple_search_field'), 'dizengoff');
  await fireEvent.press(await screen.findByText('Dizengoff Center', {}, { timeout: 2000 }));
  await fireEvent.press((await screen.findAllByTestId('simple_option'))[0]);
  await screen.findByText(ru.simple.howToGetThere);
  expect(leaks()).toEqual([]);
});
