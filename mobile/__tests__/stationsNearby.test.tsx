/** Stations' nearby list follows the user (W4). */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import App from '../src/App';
import { location } from '../src/state/location';
import { repo } from '../src/state/services';
import { en } from '../src/i18n/en';

jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

it('looks up the nearby stops again after moving on', async () => {
  const spy = jest.spyOn(repo, 'nearbyStops');
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab_stations'));
  await screen.findByText('Arlozorov/Ibn Gabirol');
  const calls = spy.mock.calls.length;
  // A few metres: the same stops.
  await act(async () => location.report({ lat: 32.0854, lon: 34.7819 }));
  expect(spy.mock.calls.length).toBe(calls);
  // 1.6 km on.
  await act(async () => location.report({ lat: 32.0997, lon: 34.7818 }));
  expect(spy.mock.calls.length).toBe(calls + 1);
});

it('drops the nearby stops when location is taken away (iOS)', async () => {
  const Location = require('expo-location') as typeof import('expo-location');
  const { AppState } = require('react-native') as typeof import('react-native');
  const handlers: ((s: string) => void)[] = [];
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((type: string, h: (s: string) => void) => {
    if (type === 'change') handlers.push(h);
    return { remove: () => {} };
  }) as never);
  try {
    await render(<App />);
    await fireEvent.press(await screen.findByTestId('tab_stations'));
    await screen.findByText('Arlozorov/Ibn Gabirol');
    const denied = { granted: false, status: 'denied', canAskAgain: true, expires: 'never' } as never;
    jest.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue(denied);
    await act(async () => handlers.forEach((h) => h('active')));
    await screen.findByText(en.stations.noneNearbyHint);
    expect(screen.queryByText('Arlozorov/Ibn Gabirol')).toBeNull();
  } finally {
    spy.mockRestore();
  }
});
