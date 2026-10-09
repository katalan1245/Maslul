/** First launch after replacing the Kotlin app: its saved data shows up, and is moved over only once. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';
import App from '../src/App';
import { MIGRATED_KEY, STORE_KEY } from '../src/state/persist';
import { store } from '../src/state/store';

// The Kotlin app's SharedPreferences, as the native module hands them over (kotlinx: defaults left out).
const OLD = JSON.stringify({
  home: { name: 'הרצל 10', lat: 32.0853, lon: 34.7818, kind: 'HOME' },
  favoritePlaces: [{ place: { name: 'Gym', lat: 32.1, lon: 34.8 }, label: 'Gym', icon: 'GYM' }],
  settings: { onBoard: true },
});
const mockReadLegacyStore = jest.fn(async (): Promise<string | null> => OLD);

jest.mock('../modules/maslul-native/src/MaslulNativeModule', () => ({
  __esModule: true,
  default: { readLegacyStore: () => mockReadLegacyStore(), fetchSiriVehicles: async () => null, updateTripNotification: async () => false },
}));
jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

test("the old app's places and settings are there on first launch", async () => {
  await render(<App />);
  await screen.findByText('Where to?');
  expect(mockReadLegacyStore).toHaveBeenCalledTimes(1);
  expect(store.value.home?.name).toBe('הרצל 10');
  expect(store.value.settings.onBoard).toBe(true);
  // The on-board button is a setting the old app had switched on; the favourite is on the home sheet.
  expect(screen.getByTestId('on_board')).toBeTruthy();
  expect(screen.getByText('Gym')).toBeTruthy();
  expect(JSON.parse((await AsyncStorage.getItem(STORE_KEY))!).home.name).toBe('הרצל 10');
  expect(await AsyncStorage.getItem(MIGRATED_KEY)).toBe('1');
});
