/** Stations' nearby list follows the user (W4). */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import App from '../src/App';
import { location } from '../src/state/location';
import { repo } from '../src/state/services';

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
