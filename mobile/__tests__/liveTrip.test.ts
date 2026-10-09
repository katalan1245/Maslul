/** Live directions: starting, surviving a restart, location updates from the background task, alerts. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { type Itinerary, makeLeg } from '../src/data/models';
import { nowSec } from '../src/data/time';
import { TRIP_TASK, activeTrip } from '../src/live/liveTrip';
import { call } from './helpers';

jest.mock('../src/state/services', () => ({ repo: { legLive: async () => null } }));

const hasStarted = Location.hasStartedLocationUpdatesAsync as jest.Mock;
// Captured before any clearAllMocks: the module defines its task when it loads.
const task = (TaskManager.defineTask as jest.Mock).mock.calls.find(([name]) => name === TRIP_TASK)?.[1];
const update = () => task({ data: { locations: [{ coords: { latitude: 32.0853, longitude: 34.7818 } }] }, error: null });

/** A bus leaving in two minutes from right here, with no stops before the destination. */
function trip(): Itinerary {
  const t = nowSec() + 120;
  const a = call('a', 'Arlozorov', 32.0853, 34.7818, t, t);
  const b = call('b', 'Savidor', 32.1, 34.79, t + 900, t + 900);
  const bus = makeLeg({ mode: 'BUS', from: a, to: b, start: t, end: t + 900, routeShortName: '5', tripId: 't1' });
  return { id: 'i', start: t, end: t + 900, transfers: 0, legs: [bus] };
}

beforeEach(async () => {
  await activeTrip.stop();
  await AsyncStorage.clear();
  jest.clearAllMocks();
  hasStarted.mockResolvedValue(false);
});

afterAll(() => activeTrip.stop());

test('starting follows location with a foreground service and saves the session', async () => {
  await activeTrip.start(trip(), 'Savidor');
  expect(activeTrip.session?.destination).toBe('Savidor');
  expect(activeTrip.session?.state).not.toBeNull();
  const [name, opts] = (Location.startLocationUpdatesAsync as jest.Mock).mock.calls[0];
  expect(name).toBe(TRIP_TASK);
  expect(opts.foregroundService.notificationBody).toBe('Savidor');
  expect(await AsyncStorage.getItem('live_trip_v1')).not.toBeNull();
});

test('an alert fires once, not on every update', async () => {
  await activeTrip.start(trip(), 'Savidor');
  const first = activeTrip.session?.state?.alertKey;
  expect(first).not.toBeNull();
  await update();
  await update();
  expect(activeTrip.session?.state?.alertKey).toBe(first);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test('ending stops the location service and forgets the session', async () => {
  await activeTrip.start(trip(), 'Savidor');
  hasStarted.mockResolvedValue(true);
  await activeTrip.stop();
  expect(activeTrip.session).toBeNull();
  expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(TRIP_TASK);
  expect(await AsyncStorage.getItem('live_trip_v1')).toBeNull();
});

test('after a restart, a trip the service is still following is picked up again', async () => {
  await AsyncStorage.setItem('live_trip_v1', JSON.stringify({ itinerary: trip(), destination: 'Savidor' }));
  hasStarted.mockResolvedValue(true);
  // The background task's first update after the JS runtime came back.
  await update();
  expect(activeTrip.session?.destination).toBe('Savidor');
  expect(activeTrip.session?.state).not.toBeNull();
});

test('a saved session whose service is gone is dropped', async () => {
  await AsyncStorage.setItem('live_trip_v1', JSON.stringify({ itinerary: trip(), destination: 'Savidor' }));
  await activeTrip.restore();
  expect(activeTrip.session).toBeNull();
  expect(await AsyncStorage.getItem('live_trip_v1')).toBeNull();
});
