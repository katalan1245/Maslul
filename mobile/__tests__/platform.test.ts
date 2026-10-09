import { type StopCall, platformLabel } from '../src/data/models';
import { floorOf, platformOf } from '../src/data/transitousApi';

test('reads platform from stop description', () => {
  // Real stop_desc values from Be'er Sheva central station.
  expect(platformOf('רחוב: יהושע חנקין עיר: באר שבע רציף: 13  קומה:')).toBe('13');
  expect(platformOf('רחוב:   עיר: באר שבע רציף: 7   קומה:')).toBe('7');
  expect(platformOf('רחוב: הגדוד העברי עיר: תל אביב יפו רציף: 3א קומה: 6')).toBe('3א');
});

test('no platform when empty', () => {
  expect(platformOf('רחוב: יצחק בן צבי 2 עיר: באר שבע רציף:  קומה:')).toBeNull();
  expect(platformOf('רחוב: יצחק בן צבי 2 עיר: באר שבע רציף:')).toBeNull();
  expect(platformOf(null)).toBeNull();
});

test('reads floor but not ground level', () => {
  expect(floorOf('רחוב: הגדוד העברי עיר: תל אביב יפו רציף: 3 קומה: 6')).toBe('6');
  expect(floorOf('רחוב: הרצל עיר: חולון רציף: 2 קומה: 0')).toBeNull();
  expect(floorOf('רחוב: יהושע חנקין עיר: באר שבע רציף: 13  קומה:')).toBeNull();
});

test('label', () => {
  const stop = (track: string | null, floor: string | null): StopCall => ({
    stopId: 's', name: 'n', code: null, lat: 0, lon: 0, scheduledArrival: null, scheduledDeparture: null, track, floor,
  });
  expect(platformLabel(stop('13', null))).toBe('Platform 13');
  expect(platformLabel(stop('3', '6'))).toBe('Platform 3, floor 6');
  expect(platformLabel(stop(null, '6'))).toBe('Floor 6');
  expect(platformLabel(stop(null, null))).toBeNull();
});
