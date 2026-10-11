/** Live directions when the bus you're walking to goes by without you (G6). Own file: it mocks legLive. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { type Itinerary, makeLeg } from '../src/data/models';
import { nowSec } from '../src/data/time';
import { activeTrip } from '../src/live/liveTrip';
import { call } from './helpers';

jest.mock('../src/state/services', () => ({
  repo: {
    legLive: async (l: { routeShortName: string; start: number }) =>
      l.routeShortName === '36' ? require('../src/data/eta').liveCall('PASSED', l.start, null) : null,
  },
}));

const bus = (line: string, t: number, from = call('s', 'Ibn Gabirol', 32.0866, 34.7818, t, t)) =>
  makeLeg({ mode: 'BUS', from, to: call('e', 'Azrieli', 32.0743, 34.7922, t + 600, t + 600), start: t, end: t + 600, routeShortName: line, tripId: `t${line}` });

/** A 4 min walk to the 36, which was due a minute ago; the 56 comes in 10 min. */
function walkThenBus(): Itinerary {
  const now = nowSec();
  const ride = { ...bus('36', now - 60), alternatives: [bus('56', now + 600)] };
  const walk = makeLeg({ mode: 'WALK', from: call(null, 'Start', 32.0853, 34.7818, now - 300, now - 300), to: ride.from, start: now - 300, end: now - 60, distanceM: 300 });
  return { id: 'i', start: now - 300, end: now + 540, transfers: 0, legs: [walk, ride] };
}

beforeEach(async () => {
  await activeTrip.stop();
  await AsyncStorage.clear();
});
afterAll(() => activeTrip.stop());

test('the guide moves on to the next bus instead of saying the passed one is arriving', async () => {
  await activeTrip.start(walkThenBus(), 'Azrieli');
  expect(activeTrip.session?.itinerary.legs[1].routeShortName).toBe('56');
  expect(activeTrip.session?.state?.text).toMatch(/56/);
  expect(activeTrip.session?.state?.text).not.toMatch(/arriving/);
  expect(JSON.parse((await AsyncStorage.getItem('live_trip_v1'))!).itinerary.legs[1].routeShortName).toBe('56');
});

test('on board, the bus passing the boarding stop changes nothing', async () => {
  const t = nowSec() - 60;
  const ride = { ...bus('36', t), alternatives: [bus('56', t + 660)] };
  await activeTrip.start({ id: 'b', start: t, end: t + 600, transfers: 0, legs: [ride] }, 'Azrieli');
  expect(activeTrip.session?.itinerary.legs[0].routeShortName).toBe('36');
});
