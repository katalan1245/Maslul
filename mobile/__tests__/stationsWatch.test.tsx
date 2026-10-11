/** Stations follows the position while it shows (G11). Own file: the permission mocks in stationsNearby leak. */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import App from '../src/App';
import { repo } from '../src/state/services';

jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

it('follows the position while Stations shows, without Refresh (G11)', async () => {
  const Location = require('expo-location') as typeof import('expo-location');
  const spy = jest.spyOn(repo, 'nearbyStops');
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab_stations'));
  await screen.findByText('Arlozorov/Ibn Gabirol');
  const watch = jest.mocked(Location.watchPositionAsync).mock.calls.at(-1)!;
  expect(watch[0].timeInterval).toBe(10_000);
  const calls = spy.mock.calls.length;
  await act(async () => watch[1]({ coords: { latitude: 32.0997, longitude: 34.7818 }, timestamp: Date.now() } as never));
  expect(spy.mock.calls.length).toBe(calls + 1);
});
