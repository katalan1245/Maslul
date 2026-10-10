/** Stations and Lines without a position: ask for location access only when it isn't granted (iOS I4). */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import * as Location from 'expo-location';
import App from '../src/App';
import { en } from '../src/i18n/en';

jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

const noFix = () => {
  jest.mocked(Location.getCurrentPositionAsync).mockRejectedValue(new Error('no fix'));
  jest.mocked(Location.getLastKnownPositionAsync).mockResolvedValue(null);
};

it('says to try again when access is granted but no position came, and to allow access when it is not', async () => {
  noFix();
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab_stations'));
  await screen.findByText(en.common.tryRefresh);
  expect(screen.queryByText(en.stations.noneNearbyHint)).toBeNull();

  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({ granted: false, status: 'denied', canAskAgain: true, expires: 'never' } as never);
  await fireEvent.press(screen.getByText(en.common.refresh));
  await screen.findByText(en.stations.noneNearbyHint);

  await fireEvent.press(screen.getByTestId('tab_lines'));
  await screen.findByText(en.lines.noneNearbyHint);
});

it('shows the nearby stops once location is allowed again and the app comes back, without Refresh (F3)', async () => {
  const { AppState } = require('react-native') as typeof import('react-native');
  const handlers: ((s: string) => void)[] = [];
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, h: (s: string) => void) => {
    if (type === 'change') handlers.push(h);
    return { remove: () => {} };
  }) as never);
  noFix();
  const denied = { granted: false, status: 'denied', canAskAgain: true, expires: 'never' } as never;
  jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(denied);
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue(denied);
  try {
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('tab_stations'));
    await screen.findByText(en.stations.noneNearbyHint);
    // Allowed in the phone's settings; then back to the app.
    const granted = { granted: true, status: 'granted', canAskAgain: true, expires: 'never' } as never;
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(granted);
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({ coords: { latitude: 32.0853, longitude: 34.7818 }, timestamp: Date.now() } as never);
    await act(async () => handlers.forEach((h) => h('active')));
    await screen.findByText('Arlozorov/Ibn Gabirol');
    expect(screen.queryByText(en.stations.noneNearbyHint)).toBeNull();
  } finally {
    spy.mockRestore();
  }
});
