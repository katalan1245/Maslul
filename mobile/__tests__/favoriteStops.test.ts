import { act } from '@testing-library/react-native';
import type { Place } from '../src/data/models';
import { store } from '../src/state/store';
import { FavoriteStopsModel, HOME_STOPS, homeStops } from '../src/ui/screens/favoriteStops';
import { STOP, makeFakeRepo } from './support/fakeRepo';

jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

const fake = (require('../src/state/services') as { repo: ReturnType<typeof makeFakeRepo> }).repo;
const stop = (id: string, lat: number): Place => ({ name: id, lat, lon: 34.78, kind: 'STOP', stopId: id });
const north = stop('north', 32.2);
const middle = stop('middle', 32.1);
const south = stop('south', 32.0);

it('shows the nearest starred stops first, at most a few', () => {
  const starred = [north, south, middle, stop('far', 33), { ...stop('no id', 32.1), stopId: undefined }];
  expect(homeStops(starred, { lat: 32.01, lon: 34.78 }).map((p) => p.name)).toEqual(['south', 'middle', 'north']);
  expect(homeStops(starred, { lat: 32.01, lon: 34.78 })).toHaveLength(HOME_STOPS);
  // No location: as starred.
  expect(homeStops(starred, null).map((p) => p.name)).toEqual(['north', 'south', 'middle']);
  expect(homeStops([], null)).toEqual([]);
});

it('keeps the last board when a refresh fails, and loads only while Home is in view', async () => {
  await act(() => store.toggleFavoriteStop(STOP));
  const board = fake.stopBoard;
  const calls = jest.fn(board);
  fake.stopBoard = calls;
  const m = new FavoriteStopsModel();
  jest.useFakeTimers();
  try {
    m.start();
    await m.refresh();
    const loaded = m.boards.get(STOP.stopId!)!;
    expect(loaded.failed).toBe(false);
    expect(loaded.entries).toHaveLength(1);

    fake.stopBoard = async () => {
      throw new TypeError('Network request failed');
    };
    await m.refresh();
    expect(m.boards.get(STOP.stopId!)).toEqual({ ...loaded, failed: true });

    fake.stopBoard = calls;
    calls.mockClear();
    m.setVisible(false);
    jest.advanceTimersByTime(120_000);
    expect(calls).not.toHaveBeenCalled();
    m.setVisible(true);
    expect(calls).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60_000);
    expect(calls).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
    m.dispose();
    fake.stopBoard = board;
    await act(() => store.toggleFavoriteStop(STOP));
  }
});
