/** Stations and Lines without a position: ask for location access only when it isn't granted (iOS I4). */
import { fireEvent, render, screen } from '@testing-library/react-native';
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
