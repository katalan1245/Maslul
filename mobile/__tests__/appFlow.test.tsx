/**
 * The Kotlin app's AppFlowTest scenarios, run offline against a fake repository: whole-app renders
 * driven through the same test ids and texts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import App from '../src/App';
import { store } from '../src/state/store';
import { ABOUT } from '../src/ui/screens/Settings';
import { makeFakeRepo } from './support/fakeRepo';

jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

const fake = (require('../src/state/services') as { repo: ReturnType<typeof makeFakeRepo> }).repo;

beforeEach(async () => {
  await AsyncStorage.clear();
  fake.planCalls.length = 0;
});

async function start() {
  await render(<App />);
  return screen.findByText('Where to?');
}

async function planToDizengoff() {
  await fireEvent.press(await start());
  await fireEvent.changeText(screen.getByTestId('field_to'), 'dizengoff center');
  await fireEvent.press(await screen.findByText('Dizengoff Center', { exact: false }));
  await screen.findByTestId('routes_list');
  await screen.findAllByTestId('route_card');
}

it('searches a line and opens it', async () => {
  await start();
  await fireEvent.press(screen.getByTestId('tab_lines'));
  await fireEvent.changeText(await screen.findByTestId('line_search'), '480');
  await fireEvent.press((await screen.findAllByTestId('line_row'))[0]);
  await screen.findByTestId('line_stops');
  await fireEvent.press(screen.getByText('Timetable'));
});

it('plans a trip to a place and counts down to leaving', async () => {
  await planToDizengoff();
  // A route card: "06:10 – 06:42"; the first ride is 12 minutes away, so it says when to leave.
  expect(screen.getAllByText(/\d\d:\d\d – \d\d:\d\d/).length).toBeGreaterThan(0);
  expect(screen.getAllByTestId('leave_in').length).toBeGreaterThan(0);
});

it('closing Options untouched keeps the routes; changing one searches again', async () => {
  await planToDizengoff();
  const searches = fake.planCalls.length;
  await fireEvent.press(screen.getByTestId('options_chip'));
  await fireEvent.press(await screen.findByText('Show routes'));
  await waitFor(() => expect(screen.queryByTestId('options_sheet')).toBeNull());
  expect(fake.planCalls.length).toBe(searches);
  expect(screen.getAllByTestId('route_card').length).toBeGreaterThan(0);

  await fireEvent.press(screen.getByTestId('options_chip'));
  await fireEvent.press(await screen.findByText('Brisk'));
  await fireEvent.press(screen.getByText('Show routes'));
  await waitFor(() => expect(fake.planCalls.length).toBeGreaterThan(searches));
  await screen.findAllByTestId('route_card');
});

it('keeps the advanced tools out of the way until switched on', async () => {
  await planToDizengoff();
  expect(screen.queryByTestId('ride_chip')).toBeNull();
  await act(() => store.updateSettings((s) => ({ ...s, rides: true })));
  await fireEvent.press(await screen.findByTestId('ride_chip'));
  await screen.findByText('Getting a ride (טרמפ)?');
});

it('shows the on-board button only when switched on, and lists the rides around', async () => {
  await start();
  expect(screen.queryByTestId('on_board')).toBeNull();
  await act(() => store.updateSettings((s) => ({ ...s, onBoard: true })));
  await fireEvent.press(await screen.findByTestId('on_board'));
  await screen.findByText('Which ride are you on?');
  await screen.findByText('No rides found around you');
});

async function openNewShuttle() {
  await start();
  await fireEvent.press(screen.getByTestId('settings_button'));
  await fireEvent.press(await screen.findByTestId('my_shuttles'));
  await fireEvent.press(await screen.findByTestId('add_shuttle'));
  await screen.findByText('New shuttle');
}

const setRide = (minutes: number) => fireEvent(screen.getByTestId('shuttle_ride_slider'), 'onValueChange', minutes);

it("says what a shuttle is missing, the ride time included", async () => {
  await openNewShuttle();
  expect(screen.getByTestId('shuttle_ride')).toHaveTextContent('Not set');
  await fireEvent.press(screen.getByTestId('shuttle_save'));
  expect(screen.getByText('New shuttle')).toBeTruthy();
  expect(screen.getByTestId('shuttle_missing')).toHaveTextContent(
    'Still needed: a name, where it leaves from, where it goes, departure times and how long the ride takes.',
  );
  expect(screen.getByText('Add at least one departure time')).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId('shuttle_name'), 'Office');
  await fireEvent.changeText(screen.getByTestId('shuttle_times'), '07:30, soon');
  expect(screen.getByText('Use 24-hour times', { exact: false })).toBeTruthy();
  expect(screen.getByTestId('shuttle_missing')).toHaveTextContent(/departure times like 07:30/);
  await fireEvent.changeText(screen.getByTestId('shuttle_times'), '07:30, 17:00');
  expect(screen.getByText('2 departures a day')).toBeTruthy();
  await setRide(60);
  expect(screen.getByTestId('shuttle_ride')).toHaveTextContent('60 min');
  expect(screen.getByTestId('shuttle_missing')).toHaveTextContent('Still needed: where it leaves from and where it goes.');
  await fireEvent.press(screen.getByText('Save and add the way back'));
  expect(screen.getByText('New shuttle')).toBeTruthy();
});

async function pickStop(row: string, query: string, pick: string) {
  await fireEvent.press(screen.getByText(row));
  await fireEvent.changeText(await screen.findByTestId('field_to'), query);
  await fireEvent.press(await screen.findByText(pick));
  await screen.findByText('New shuttle');
}

it('saves, edits and deletes a complete shuttle', async () => {
  await openNewShuttle();
  await fireEvent.changeText(screen.getByTestId('shuttle_name'), 'Test shuttle');
  await pickStop('From', 'dizengoff center', 'Dizengoff Center');
  await pickStop('To', 'azrieli center', 'Azrieli Center');
  await fireEvent.changeText(screen.getByTestId('shuttle_times'), '8:15 07:30');
  await setRide(120);
  expect(screen.getByTestId('shuttle_ride')).toHaveTextContent('120 min');
  expect(screen.queryByTestId('shuttle_missing')).toBeNull();
  await fireEvent.press(screen.getByTestId('shuttle_save'));
  await screen.findByText('Test shuttle');
  expect(screen.getByText('07:30, 08:15 · Sun–Thu')).toBeTruthy();
  const saved = store.value.shuttles.find((s) => s.name === 'Test shuttle');
  expect(saved?.times).toEqual([450, 495]);
  expect(saved?.rideMinutes).toBe(120);

  await fireEvent.press(screen.getByText('Test shuttle'));
  await screen.findByText('Edit shuttle');
  expect(screen.getByTestId('shuttle_ride')).toHaveTextContent('120 min');
  await fireEvent.press(screen.getByText('Delete'));
  await waitFor(() => expect(screen.queryByText('Test shuttle')).toBeNull());
  expect(store.value.shuttles).toHaveLength(0);
});

it('credits the data sources in Settings → About', async () => {
  await start();
  await fireEvent.press(screen.getByTestId('settings_button'));
  const about = await screen.findByTestId('about_credits');
  expect(about).toHaveTextContent(ABOUT);
  for (const credit of ['GNU AGPL v3', 'Transitous', 'Open Bus', 'Hasadna', 'Stride', 'Photon', 'Nominatim', 'OpenFreeMap', '© OpenStreetMap contributors'])
    expect(ABOUT).toContain(credit);
});

// The home sheet's hide/drag/bring-back scenario needs real sheet positions: a device (Maestro) check.
