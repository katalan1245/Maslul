/** Upstream's RideOptionsTest (a busy stop's lines kept to a few), and how a ride without a number is named. */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { en } from '../src/i18n/en';
import { ru } from '../src/i18n/ru';
import { vehicleKind } from '../src/data/models';
import { CombinedBadges, RideOptions, TransferWarning } from '../src/ui/screens/routeCards';
import { call, instant, makeLeg } from './helpers';

const t0 = instant('2026-10-09T10:00:00Z');
const a = call('sA', 'Cinema City', 32.0, 34.8);
const b = call('sB', 'Yehudit', 32.05, 34.8);
const bus = (line: string, start: number) =>
  makeLeg({ mode: 'BUS', from: a, to: b, start: t0 + start * 60, end: t0 + (start + 20) * 60, routeShortName: line, tripId: `trip-${line}-${start}` });
// Seven lines, as at a busy stop.
const rides = ['650', '347', '852', '623', '501', '60', '18'].map((l, i) => bus(l, 5 + i * 2));

test('badges show three lines and count the rest', async () => {
  await render(<CombinedBadges rides={rides} />);
  expect(screen.queryByText('650')).toBeTruthy();
  expect(screen.queryByText('852')).toBeTruthy();
  expect(screen.queryByText('623')).toBeNull();
  expect(screen.queryByText('+4', { exact: false })).toBeTruthy();
});

test('options show three and expand on tap', async () => {
  await render(<RideOptions leg={rides[0]} rides={rides} now={t0} relative={false} liveOf={() => null} />);
  expect(screen.queryAllByText('623')).toHaveLength(0);
  expect(screen.getByTestId('more_rides')).toHaveTextContent('+4 more');
  await fireEvent.press(screen.getByTestId('more_rides'));
  expect(screen.queryAllByText('623')).toHaveLength(1);
  expect(screen.queryAllByText('18')).toHaveLength(1);
  expect(screen.getByTestId('more_rides')).toHaveTextContent('Show fewer');
  await fireEvent.press(screen.getByTestId('more_rides'));
  expect(screen.queryAllByText('623')).toHaveLength(0);
});

test('a train without a number is "the train" in a tight transfer', async () => {
  const train = makeLeg({ mode: 'TRAIN', from: a, to: b, start: t0, end: t0 + 1200, routeShortName: '' });
  const next = { ...train, start: t0 + 1800, end: t0 + 3000 };
  await render(<TransferWarning t={{ slackSec: 120, walkM: 0, next: train }} missed={next} />);
  expect(screen.getByText('Tight transfer · 2 min to catch the train')).toBeTruthy();
  expect(screen.getByText('If missed, the next train at', { exact: false })).toBeTruthy();
  // A numbered one keeps its number.
  await render(<TransferWarning t={{ slackSec: 120, walkM: 0, next: bus('143', 0) }} missed={bus('143', 15)} />);
  expect(screen.getByText('If missed, next 143 at', { exact: false })).toBeTruthy();
});

test('light rail is a tram in Russian, a train elsewhere', () => {
  expect(ru.vehicle[vehicleKind('LIGHT_RAIL')]).toBe('трамвай');
  expect(ru.cards.theNextVehicle(vehicleKind('LIGHT_RAIL'))).toBe('следующий трамвай');
  expect(en.vehicle[vehicleKind('LIGHT_RAIL')]).toBe('train');
});
