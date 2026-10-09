import { type TransitMode, makeLeg, vehicle, vehicles, vehiclesOf } from '../src/data/models';
import { call } from './helpers';

const ride = (mode: TransitMode) => {
  const s = call('s', 'S', 32.0, 34.8);
  return makeLeg({ mode, from: s, to: s, start: 0, end: 0, routeShortName: '1' });
};

test('hurry label names the vehicle', () => {
  // "Hurry · train is close", not "bus is close", when the ride is a train or the light rail.
  expect(vehicle('BUS')).toBe('bus');
  expect(vehicle('TRAIN')).toBe('train');
  expect(vehicle('LIGHT_RAIL')).toBe('train');
  expect(vehicles('FERRY')).toBe('ferries');
});

test('rides of one mode use its word', () => {
  expect(vehiclesOf([ride('LIGHT_RAIL'), ride('LIGHT_RAIL')])).toBe('trains');
  expect(vehiclesOf([ride('BUS')])).toBe('buses');
  expect(vehiclesOf([ride('BUS'), ride('TRAIN')])).toBe('rides');
});
