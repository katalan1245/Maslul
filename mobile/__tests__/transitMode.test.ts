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

test('upstream 1.2.1: vehicles by kind in each language, and "the train" without a number', () => {
  const { en } = require('../src/i18n/en') as typeof import('../src/i18n/en');
  const { he } = require('../src/i18n/he') as typeof import('../src/i18n/he');
  const { ru } = require('../src/i18n/ru') as typeof import('../src/i18n/ru');
  const { vehicleKind } = require('../src/data/models') as typeof import('../src/data/models');
  expect(en.cards.isClose(vehicleKind('LIGHT_RAIL'))).toBe('train is close');
  expect(he.cards.isClose(vehicleKind('BUS'))).toBe('האוטובוס קרוב');
  expect(he.cards.isClose(vehicleKind('TRAIN'))).toBe('הרכבת קרובה');
  expect(ru.cards.isClose(vehicleKind('LIGHT_RAIL'))).toBe('Трамвай близко');
  expect(en.cards.tightTransfer(3, en.cards.theVehicle('TRAIN'))).toBe('Tight transfer · 3 min to catch the train');
  expect(en.cards.ifMissed(en.cards.theNextVehicle('TRAIN'), '21:40', '30 min')).toBe('If missed, the next train at 21:40 (+30 min)');
  expect(en.cards.ifMissed(en.cards.nextLine('143'), '21:40', '30 min')).toBe('If missed, next 143 at 21:40 (+30 min)');
  expect(he.cards.ifMissed(he.cards.theNextVehicle('TRAIN'), '21:40', '30 דק׳')).toBe('אם מפספסים: הרכבת הבאה ב-21:40 (+30 דק׳)');
});
