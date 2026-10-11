/** Upstream 1.2.2's screens: one arrival time, rides going the other way, the stop's map and next ride. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import App from '../src/App';
import { type Itinerary, makeLeg } from '../src/data/models';
import type { BoardCandidate } from '../src/data/onBoard';
import { nowSec } from '../src/data/time';
import { location } from '../src/state/location';
import { store } from '../src/state/store';
import { call, itinOf } from './helpers';
import { STOP, makeFakeRepo } from './support/fakeRepo';

jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

const fake = (require('../src/state/services') as { repo: ReturnType<typeof makeFakeRepo> }).repo;

beforeEach(() => AsyncStorage.clear());

async function start() {
  await render(<App />);
  return screen.findByText('Where to?');
}

it('a route that ends on the bus shows its arrival once, at the stop you get off at', async () => {
  const { plan } = fake;
  const t = nowSec() + 600;
  const a = call('s1', 'Arlozorov/Ibn Gabirol', 32.0866, 34.7818, t, t);
  const b = call('s2', 'Dizengoff Center', 32.0756, 34.775, t + 600, t + 600);
  const endsOnBus: Itinerary = itinOf(
    'e',
    makeLeg({ mode: 'WALK', from: call(null, 'Start', 32.0853, 34.7818), to: a, start: t - 240, end: t, distanceM: 300 }),
    makeLeg({ mode: 'BUS', from: a, to: b, start: t, end: t + 600, routeShortName: '5', headsign: 'Bat Yam', tripId: 'trip-e', agencyName: 'Dan' }),
  );
  fake.plan = async () => ({ itineraries: [endsOnBus], walkOnly: null, nextCursor: null, previousCursor: null });
  try {
    await fireEvent.press(await start());
    await fireEvent.changeText(screen.getByTestId('field_to'), 'dizengoff center');
    await fireEvent.press(await screen.findByText('Dizengoff Center', { exact: false }));
    await fireEvent.press((await screen.findAllByTestId('route_card'))[0]);
    await screen.findByTestId('route_detail_screen');
    // One destination row: the bus stop, named after where you're going.
    const rows = screen.getAllByTestId('destination_row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent(/Dizengoff Center.*Get off · Tel Aviv-Yafo/);
  } finally {
    fake.plan = plan;
  }
});

it('lists rides going the other way last, and says so', async () => {
  const { boardCandidates } = fake;
  const ride = (tripId: string, headsign: string, bearing: number, due: number): BoardCandidate => ({
    tripId, lineRef: '1', lineLabel: '1', mode: 'LIGHT_RAIL', headsign, agencyName: null, agencyId: null, routeColor: null,
    vehicle: null, distanceM: 200, stopName: 'Here', stopTime: nowSec() + due, bearing, nextStopName: 'Next',
  });
  // Southbound is due sooner, but you're heading north.
  fake.boardCandidates = (async () => [ride('s', 'Bat Yam', 180, 60), ride('n', 'Petah Tikva', 0, 180)]) as never;
  const heading = jest.spyOn(location, 'heading').mockReturnValue(10);
  try {
    await act(() => store.updateSettings((s) => ({ ...s, onBoard: true })));
    await start();
    await fireEvent.press(await screen.findByTestId('on_board'));
    const rows = await screen.findAllByTestId('board_candidate');
    expect(rows[0]).toHaveTextContent(/Petah Tikva/);
    expect(rows[1]).toHaveTextContent(/Bat Yam/);
    expect(within(rows[1]).getByTestId('other_way')).toHaveTextContent('Going the other way');
    expect(within(rows[0]).queryByTestId('other_way')).toBeNull();
    // Both directions share the stop: where each goes next tells them apart.
    expect(rows[0]).toHaveTextContent(/Here.*→.*Next/);
  } finally {
    fake.boardCandidates = boardCandidates;
    heading.mockRestore();
  }
});

it("a stop's board shows each line's next ride under its time, and the map can take the whole screen", async () => {
  const { stopBoard } = fake;
  const dep = (trip: string, inMin: number) => {
    const t = nowSec() + inMin * 60;
    const stop = call(STOP.stopId!, STOP.name, STOP.lat, STOP.lon, t, t);
    return { departure: { tripId: trip, routeId: 'r5', mode: 'BUS', lineLabel: '5', headsign: 'Bat Yam', agency: 'Dan', routeColor: null, scheduled: t, stop }, live: null };
  };
  fake.stopBoard = (async () => [dep('a', 5), dep('b', 17)]) as never;
  try {
    await start();
    await fireEvent.press(screen.getByTestId('tab_stations'));
    await fireEvent.press(await screen.findByText('Arlozorov/Ibn Gabirol'));
    await screen.findByTestId('stop_screen');
    const row = await screen.findByTestId('board_row');
    expect(within(row).getByTestId('next_arrival')).toHaveTextContent(/then 1[67] min/);
    // The "then" times moved under the time: not beside the agency any more.
    expect(row).not.toHaveTextContent(/Dan · then/);
    expect(screen.getByTestId('stop_map_expand')).toBeTruthy();
  } finally {
    fake.stopBoard = stopBoard;
  }
});
