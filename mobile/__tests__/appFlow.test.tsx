/**
 * The Kotlin app's AppFlowTest scenarios, run offline against a fake repository: whole-app renders
 * driven through the same test ids and texts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import App from '../src/App';
import { store } from '../src/state/store';
import { S } from '../src/i18n';
import { DIZENGOFF, STOP, makeFakeRepo } from './support/fakeRepo';

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
  // Times come from wheels (#1): 07:30 as offered, then the hour stepped up as a screen reader would.
  await fireEvent.press(screen.getByText('Add 07:30'));
  for (let i = 0; i < 10; i++) await fireEvent(screen.getByTestId('shuttle_at_hour'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  await fireEvent.press(screen.getByText('Add 17:30'));
  expect(screen.getByText('2 departures a day')).toBeTruthy();
  // A chip takes a time off again.
  await fireEvent.press(screen.getByLabelText('Remove 17:30'));
  expect(screen.getByText('1 departure a day')).toBeTruthy();
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
  await fireEvent.press(within(screen.getByTestId('shuttle_at_hour')).getByText('08', { includeHiddenElements: true }));
  await fireEvent.press(within(screen.getByTestId('shuttle_at_minute')).getByText('15', { includeHiddenElements: true }));
  await fireEvent.press(screen.getByText('Add 08:15'));
  await fireEvent.press(within(screen.getByTestId('shuttle_at_hour')).getByText('07', { includeHiddenElements: true }));
  await fireEvent.press(within(screen.getByTestId('shuttle_at_minute')).getByText('30', { includeHiddenElements: true }));
  await fireEvent.press(screen.getByText('Add 07:30'));
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

it("doesn't put first a route whose bus has already passed (W1)", async () => {
  const { liveCall } = require('../src/data/eta') as typeof import('../src/data/eta');
  const { worthLive, legLive, plan } = fake;
  // Two routes from different stops, so they stay two cards: the 5 (sooner, but it has passed) and the 61.
  fake.plan = async (req: unknown) => {
    const r = await plan(req);
    const [a, b] = r.itineraries;
    const other = (c: (typeof b.legs)[0]['from']) => ({ ...c, stopId: `${c.stopId}-x`, name: `${c.name} North`, lat: c.lat + 0.004 });
    const legs = b.legs.map((l, i) => (i === 1 ? { ...l, from: other(l.from), to: other(l.to) } : l));
    return { ...r, itineraries: [a, { ...b, legs }] };
  };
  fake.worthLive = async () => true;
  fake.legLive = (async (l: { routeShortName: string | null; start: number }) => (l.routeShortName === '5' ? liveCall('PASSED', l.start, null) : null)) as never;
  try {
    await planToDizengoff();
    await waitFor(() => expect(screen.getAllByTestId('route_card')).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByTestId('route_card')[0]).toHaveTextContent(/61/));
  } finally {
    fake.worthLive = worthLive;
    fake.legLive = legLive;
    fake.plan = plan;
  }
});

it("says the planner failed when only the user's shuttles gave routes (429)", async () => {
  const { HttpException } = require('../src/data/http') as typeof import('../src/data/http');
  const plan = fake.plan;
  const shuttleOptions = fake.shuttleOptions;
  const ok = await plan({});
  const shuttle = { id: 'sh', name: 'Office', from: STOP, to: DIZENGOFF, times: [450], rideMinutes: 20, days: [1, 2, 3, 4, 5, 6, 7] };
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await planToDizengoff();
    await act(() => store.saveShuttle(shuttle));
    fake.plan = async () => {
      throw new HttpException(429, 'HTTP 429');
    };
    fake.shuttleOptions = async () => [ok.itineraries[0]];
    // No saved routes to fall back on: only the shuttle's.
    await AsyncStorage.removeItem('saved_routes_v1');
    await fireEvent.press(screen.getByTestId('refresh_chip'));
    expect(await screen.findByTestId('search_failed_banner')).toHaveTextContent(/429/);
  } finally {
    fake.plan = plan;
    fake.shuttleOptions = shuttleOptions;
    await act(() => store.removeShuttle('sh'));
  }
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
  expect(await screen.findByTestId('favorite_stop')).not.toBeSelected();
  await fireEvent.press(screen.getByTestId('favorite_stop'));
  expect(screen.getByTestId('favorite_stop')).toBeSelected();
  await fireEvent.press(screen.getByLabelText('Back'));
  await fireEvent.press(screen.getByTestId('tab_navigate'));
  const home = await screen.findByTestId('home_stop');
  await waitFor(() => expect(within(home).getByTestId('board_row')).toHaveTextContent(/Bat Yam/));
  // TalkBack reads the row (F15): its line, where it goes and when.
  expect(within(home).getByTestId('board_row').props.accessibilityLabel).toMatch(/Bat Yam, (now|\d+ min)/);
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

it('walks further when nothing leaves soon, and says so (upstream 1.2.1)', async () => {
  const { zoned } = require('../src/data/time') as typeof import('../src/data/time');
  const { makeLeg } = require('../src/data/models') as typeof import('../src/data/models');
  const { call, itinOf } = require('./helpers') as typeof import('./helpers');
  const route = (id: string, t: number) => {
    const a = call('s1', 'Arlozorov/Ibn Gabirol', 32.0866, 34.7818, t, t);
    const b = call('s2', 'Dizengoff Center', 32.0756, 34.775, t + 600, t + 600);
    return itinOf(id, makeLeg({ mode: 'WALK', from: call(null, 'Start', 32.0853, 34.7818), to: a, start: t - 240, end: t }), makeLeg({ mode: 'BUS', from: a, to: b, start: t, end: t + 600, routeShortName: '5', tripId: `trip-${id}` }));
  };
  // Friday 16:00: the buses nearby have stopped until Saturday evening; one a long walk away still runs.
  const friday = zoned('2026-10-09', 16);
  jest.spyOn(Date, 'now').mockReturnValue(friday * 1000);
  const plan = fake.plan;
  fake.plan = async (req: unknown) => {
    fake.planCalls.push(req);
    const wide = (req as { maxWalkMinutes?: number }).maxWalkMinutes === 50;
    return { itineraries: [wide ? route('far', friday + 40 * 60) : route('saturday', zoned('2026-10-10', 19))], walkOnly: null, nextCursor: null, previousCursor: null };
  };
  try {
    await planToDizengoff();
    await screen.findByTestId('wider_walk_note');
    expect(screen.getAllByTestId('route_card')).toHaveLength(2);
    expect(screen.getByText('Longer walk', { exact: false })).toBeTruthy();
    // Saturday's bus says it's tomorrow, not just its time.
    expect(screen.getByText('Tomorrow', { exact: false })).toBeTruthy();
    // The usual search, the one a few minutes over the limit, then the wider one.
    expect(fake.planCalls.map((r) => (r as { maxWalkMinutes?: number }).maxWalkMinutes)).toEqual([20, 23, 50]);
  } finally {
    fake.plan = plan;
    jest.restoreAllMocks();
  }
});

it("shares the times the route screen shows, live ones included (P3)", async () => {
  const { live } = require('./helpers') as typeof import('./helpers');
  const { Share } = require('react-native') as typeof import('react-native');
  const { Fmt } = require('../src/ui/fmt') as typeof import('../src/ui/fmt');
  const { worthLive, legLive } = fake;
  // The bus comes 4 minutes late.
  fake.worthLive = async () => true;
  fake.legLive = (async (l: { start: number; end: number }) => live('LIVE', l.start, l.start + 240, { alightExpected: l.end + 240 })) as never;
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
  try {
    await planToDizengoff();
    await fireEvent.press(screen.getAllByTestId('route_card')[0]);
    await screen.findByTestId('route_detail_screen');
    const bus = (await fake.plan({})).itineraries[0].legs[1];
    await waitFor(() => expect(screen.getAllByText(Fmt.time(bus.start + 240)).length).toBeGreaterThan(0));
    await fireEvent.press(screen.getByTestId('share_button'));
    const text = share.mock.calls[0][0].message!;
    expect(text).toContain(`${Fmt.time(bus.start + 240)} → `);
    expect(text).toContain(`(${Fmt.time(bus.end + 240)})`);
  } finally {
    fake.worthLive = worthLive;
    fake.legLive = legLive;
    share.mockRestore();
  }
});

it('keeps the steps on the bus the live guide was started with (T2)', async () => {
  const { live } = require('./helpers') as typeof import('./helpers');
  const { Combine } = require('../src/data/combine') as typeof import('../src/data/combine');
  const { activeTrip } = require('../src/live/liveTrip') as typeof import('../src/live/liveTrip');
  const { worthLive, legLive } = fake;
  // Started on the 5; then it runs 25 min late and the 61 behind it would get there first.
  const trip = Combine.merge((await fake.plan({})).itineraries)[0];
  fake.worthLive = async () => true;
  fake.legLive = (async (l: { tripId: string; start: number; end: number }) =>
    l.tripId === 'trip-a' ? live('LIVE', l.start, l.start + 1500, { alightExpected: l.end + 1500 }) : live('LIVE', l.start, l.start, { alightExpected: l.end })) as never;
  try {
    await activeTrip.start(trip, 'Dizengoff Center');
    await start();
    await fireEvent.press(await screen.findByTestId('live_trip_banner'));
    await screen.findByTestId('route_detail_screen');
    const options = await screen.findByTestId('line_options');
    // Live data has come in for both buses.
    await waitFor(() => expect(within(options).getAllByText(/min$/).length).toBe(2));
    const chosen = within(options).getAllByRole('radio').find((r) => r.props.accessibilityState?.checked);
    expect(within(chosen!).getByText('5')).toBeTruthy();
  } finally {
    await activeTrip.stop();
    fake.worthLive = worthLive;
    fake.legLive = legLive;
  }
});

it('puts your favourite first when it matches what you type, by its name or yours for it (#9)', async () => {
  await start();
  await act(async () => store.saveFavorite({ name: 'Herzl 10, Holon', lat: 32.01, lon: 34.77, kind: 'ADDRESS' }, "Grandma's", 'HEART'));
  await fireEvent.press(screen.getByText('Where to?'));
  await fireEvent.changeText(screen.getByTestId('field_to'), 'grand');
  await screen.findByText("Grandma's");
  // Not a search result, but it's yours: no "no results".
  expect(screen.queryByText(S.search.noResults)).toBeNull();
  await fireEvent.changeText(screen.getByTestId('field_to'), 'dizengoff');
  await screen.findByText('Dizengoff Center', { exact: false });
  expect(screen.queryByText("Grandma's")).toBeNull();
});

it('adds a repeating shuttle as one run, every N minutes up to the end time (#3)', async () => {
  await openNewShuttle();
  await fireEvent.press(screen.getByText('Repeating'));
  // From 07:30 until 19:00 (as offered), every 30 min: 24 departures, the last at 19:00.
  await fireEvent.press(screen.getByText('Add 24 departures'));
  expect(within(screen.getByTestId('shuttle_times')).getByText('Every 30 min, 07:30–19:00')).toBeTruthy();
  expect(screen.getByText('24 departures a day')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Remove Every 30 min, 07:30–19:00'));
  expect(screen.queryByTestId('shuttle_times')).toBeNull();
});

it('adds a single departure after the repeating form\'s end time (W5, I15.6)', async () => {
  await openNewShuttle();
  await fireEvent.press(within(screen.getByTestId('shuttle_at_hour')).getByText('21', { includeHiddenElements: true }));
  await fireEvent.press(within(screen.getByTestId('shuttle_at_minute')).getByText('00', { includeHiddenElements: true }));
  await fireEvent.press(screen.getByText('Add 21:00'));
  expect(screen.getByText('1 departure a day')).toBeTruthy();
});

it('sets the trip time on wheels, without a keyboard (#1, F11)', async () => {
  await planToDizengoff();
  await fireEvent.press(screen.getByTestId('time_chip'));
  await screen.findByTestId('time_sheet');
  await fireEvent.press(screen.getByText('Arrive by'));
  await fireEvent.press(within(screen.getByTestId('time_hour')).getByText('09', { includeHiddenElements: true }));
  await fireEvent(screen.getByTestId('time_minute'), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  const minute = screen.getByTestId('time_minute').props.accessibilityValue.text as string;
  await fireEvent.press(screen.getByTestId('set_time'));
  await waitFor(() => expect(screen.getByTestId('time_chip')).toHaveTextContent(new RegExp(`09:${minute}`)));
  expect(screen.getByTestId('time_chip')).toHaveTextContent(/Arrive/);
  // Refresh keeps the chosen time (P2).
  await fireEvent.press(screen.getByTestId('refresh_chip'));
  await screen.findAllByTestId('route_card');
  expect(screen.getByTestId('time_chip')).toHaveTextContent(new RegExp(`Arrive.*09:${minute}`));
});
