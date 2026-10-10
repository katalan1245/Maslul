/**
 * The Kotlin app's AppFlowTest scenarios, run offline against a fake repository: whole-app renders
 * driven through the same test ids and texts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import App from '../src/App';
import { store } from '../src/state/store';
import { S } from '../src/i18n';
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

it('offers the advanced tools by default, and hides them when switched off', async () => {
  await act(() => store.updateSettings((s) => ({ ...s, rides: false })));
  await planToDizengoff();
  expect(screen.queryByTestId('ride_chip')).toBeNull();
  await act(() => store.updateSettings((s) => ({ ...s, rides: true })));
  await fireEvent.press(await screen.findByTestId('ride_chip'));
  await screen.findByText('Getting a ride (טרמפ)?');
});

it('shows the on-board button only when switched on, and lists the rides around', async () => {
  await act(() => store.updateSettings((s) => ({ ...s, onBoard: false })));
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
  // Delete asks first: Cancel keeps it.
  await fireEvent.press(screen.getByTestId('shuttle_delete'));
  await fireEvent.press(await screen.findByText('Cancel'));
  expect(store.value.shuttles).toHaveLength(1);
  await fireEvent.press(screen.getByTestId('shuttle_delete'));
  await fireEvent.press(await screen.findByTestId('shuttle_delete_confirm'));
  await waitFor(() => expect(screen.queryByText('Test shuttle')).toBeNull());
  expect(store.value.shuttles).toHaveLength(0);
});

it('credits the data sources in Settings → About', async () => {
  await start();
  await fireEvent.press(screen.getByTestId('settings_button'));
  const about = await screen.findByTestId('about_credits');
  expect(about).toHaveTextContent(S.settings.credits);
  for (const credit of ['GNU AGPL v3', 'Transitous', 'Open Bus', 'Hasadna', 'Stride', 'Photon', 'Nominatim', 'OpenFreeMap', '© OpenStreetMap contributors'])
    expect(S.settings.credits).toContain(credit);
});

// The home sheet's hide/drag/bring-back scenario needs real sheet positions: a device (Maestro) check.

it('opens a route and the ride on it', async () => {
  await planToDizengoff();
  await fireEvent.press(screen.getAllByTestId('route_card')[0]);
  await screen.findByTestId('route_detail_screen');
  expect(screen.getByTestId('start_button')).toBeTruthy();
  await fireEvent.press(screen.getAllByTestId('open_trip')[0]);
  await screen.findByTestId('trip_screen');
  await screen.findByText('Bat Yam', { exact: false });
});

it('finds a nearby stop, its departures, and a trip from there', async () => {
  await start();
  await fireEvent.press(screen.getByTestId('tab_stations'));
  await fireEvent.press(await screen.findByText('Arlozorov/Ibn Gabirol'));
  await screen.findByTestId('stop_screen');
  await fireEvent.press(await screen.findByTestId('board_row'));
  await screen.findByTestId('trip_screen');
});

it('picks a destination on the map', async () => {
  await fireEvent.press(await start());
  await fireEvent.press(await screen.findByText('Choose on map'));
  await screen.findByTestId('pick_on_map_screen');
  // The map settling reports its centre, which is then looked up as an address.
  await fireEvent(screen.getByTestId('maplibre_map'), 'onRegionDidChange', { nativeEvent: { center: [34.7703, 32.0631], zoom: 16, bearing: 0, pitch: 0 } });
  await waitFor(() => expect(screen.getByTestId('picked_label')).toHaveTextContent('Rothschild 1'));
  await fireEvent.press(screen.getByTestId('choose_location'));
  await screen.findByTestId('routes_list');
});

it('shows the last routes for the trip when a search fails, and says when all of them have left', async () => {
  await planToDizengoff();
  const cards = screen.getAllByTestId('route_card').length;
  await waitFor(async () => expect(await AsyncStorage.getItem('saved_routes_v1')).not.toBeNull());
  const plan = fake.plan;
  fake.plan = async () => {
    throw new TypeError('Network request failed');
  };
  try {
    await fireEvent.press(screen.getByTestId('refresh_chip'));
    await screen.findByTestId('saved_routes_banner');
    expect(screen.getByText(/No new routes, showing the ones saved at \d\d:\d\d/)).toBeTruthy();
    expect(await screen.findAllByTestId('route_card')).toHaveLength(cards);
    // The saved buses have left: say so instead of showing them.
    const later = Date.now() + 3600_000;
    jest.spyOn(Date, 'now').mockReturnValue(later);
    await fireEvent.press(screen.getByTestId('refresh_chip'));
    await screen.findByText(/The routes saved at .* have all left\./);
    expect(screen.queryByTestId('saved_routes_banner')).toBeNull();
  } finally {
    fake.plan = plan;
    jest.restoreAllMocks();
  }
});

it('says how many stops away a live bus is on the stop screen, but not for an old position or a far-off count', async () => {
  const board = fake.stopBoard;
  const row = (trip: string, line: string, stopsAway: number, ageSec: number) => {
    const t = Math.floor(Date.now() / 1000);
    const stop = { stopId: 'il-Israel-MOT_21437', name: 'Arlozorov/Ibn Gabirol', code: null, lat: 32.0866, lon: 34.7818, scheduledArrival: t + 300, scheduledDeparture: t + 300 };
    const vehicle = { lineRef: '1', journeyRef: null, originDeparture: t - 600, lat: 32.08, lon: 34.78, bearing: null, velocityKmh: null, recordedAt: t - ageSec, distanceFromStart: null, nextStopCode: null, vehicleRef: trip };
    return {
      departure: { tripId: trip, routeId: null, mode: 'BUS' as const, lineLabel: line, headsign: `To ${line}`, agency: 'Dan', routeColor: null, scheduled: t + 300, stop },
      live: { status: 'LIVE' as const, scheduled: t + 300, expected: t + 240, delaySec: -60, stopsAway, vehicle, alightExpected: null, progress: null },
    };
  };
  fake.stopBoard = async () => [row('a', '5', 3, 10), row('b', '61', 45, 10), row('c', '72', 2, 900)] as never;
  try {
    await start();
    await fireEvent.press(screen.getByTestId('tab_stations'));
    await fireEvent.press(await screen.findByText('Arlozorov/Ibn Gabirol'));
    await screen.findByTestId('stop_screen');
    expect(await screen.findByText('3 stops away')).toBeTruthy();
    // 45 stops is a bus still far off, and a 15-minute-old position counts nothing: those keep their usual labels.
    expect(screen.queryByText('45 stops away')).toBeNull();
    expect(screen.queryByText('2 stops away')).toBeNull();
    expect(screen.getByText('live')).toBeTruthy();
  } finally {
    fake.stopBoard = board;
  }
});

it('shows the next departures at a starred stop on Home, and opens the stop from there', async () => {
  await start();
  expect(screen.queryByTestId('home_stop')).toBeNull();
  await fireEvent.press(screen.getByTestId('tab_stations'));
  await fireEvent.press(await screen.findByText('Arlozorov/Ibn Gabirol'));
  await fireEvent.press(await screen.findByTestId('favorite_stop'));
  await fireEvent.press(screen.getByLabelText('Back'));
  await fireEvent.press(screen.getByTestId('tab_navigate'));
  const home = await screen.findByTestId('home_stop');
  await waitFor(() => expect(within(home).getByTestId('board_row')).toHaveTextContent(/Bat Yam/));
  await fireEvent.press(within(home).getByText('Arlozorov/Ibn Gabirol'));
  await screen.findByTestId('stop_screen');
});

it('marks the last bus of the night, found on the next page, and says so when it is close', async () => {
  const { zoned } = require('../src/data/time') as typeof import('../src/data/time');
  const { makeLeg } = require('../src/data/models') as typeof import('../src/data/models');
  const { call, itinOf } = require('./helpers') as typeof import('./helpers');
  const route = (id: string, t: number) => {
    const a = call('s1', 'Arlozorov/Ibn Gabirol', 32.0866, 34.7818, t, t);
    const b = call('s2', 'Dizengoff Center', 32.0756, 34.775, t + 600, t + 600);
    return itinOf(id, makeLeg({ mode: 'WALK', from: call(null, 'Start', 32.0853, 34.7818), to: a, start: t - 240, end: t }), makeLeg({ mode: 'BUS', from: a, to: b, start: t, end: t + 600, routeShortName: '5', tripId: `trip-${id}` }));
  };
  const night = zoned('2026-10-08', 23); // a Thursday
  jest.spyOn(Date, 'now').mockReturnValue(night * 1000);
  const plan = fake.plan;
  fake.plan = async (req: unknown) => {
    fake.planCalls.push(req);
    return (req as { pageCursor?: string }).pageCursor === 'next'
      ? { itineraries: [route('morning', zoned('2026-10-09', 5, 30))], walkOnly: null, nextCursor: null, previousCursor: null }
      : { itineraries: [route('a', night + 1200), route('b', night + 2400)], walkOnly: null, nextCursor: 'next', previousCursor: null };
  };
  try {
    await planToDizengoff();
    await screen.findByTestId('last_bus_banner');
    expect(screen.getByText('The last one today leaves at 23:40 from Arlozorov/Ibn Gabirol')).toBeTruthy();
    expect(screen.getAllByText('Last today')).toHaveLength(1);
    expect(fake.planCalls.filter((r) => (r as { pageCursor?: string }).pageCursor === 'next')).toHaveLength(1);
  } finally {
    fake.plan = plan;
    jest.restoreAllMocks();
  }
});

it('looks for no last bus in the daytime', async () => {
  const { zoned } = require('../src/data/time') as typeof import('../src/data/time');
  jest.spyOn(Date, 'now').mockReturnValue(zoned('2026-10-08', 10) * 1000);
  try {
    await planToDizengoff();
    expect(screen.queryByText('Last today')).toBeNull();
    expect(screen.queryByTestId('last_bus_banner')).toBeNull();
  } finally {
    jest.restoreAllMocks();
  }
});
