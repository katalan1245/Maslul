import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import App from '../src/App';
import { nowSec } from '../src/data/time';
import { stopReminderAt } from '../src/ui/components/reminders';
import { makeFakeRepo } from './support/fakeRepo';

jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }));

const fake = (require('../src/state/services') as { repo: ReturnType<typeof makeFakeRepo> }).repo;
const schedule = Notifications.scheduleNotificationAsync as jest.Mock;

it('reminds the walk to the stop and the reminder minutes before the bus', () => {
  const stop = { lat: 32.0866, lon: 34.7818 };
  const here = { lat: stop.lat + 1000 / 111_195, lon: stop.lon }; // 1 km north
  // 1.3 km of streets at 1.3 m/s: 1000 s.
  expect(stopReminderAt(10_000, stop, here, 1.3, 5)).toEqual({ leaveAt: 9_000, at: 8_700 });
  // No location: leave when the bus does.
  expect(stopReminderAt(10_000, stop, null, 1.3, 5)).toEqual({ leaveAt: 10_000, at: 9_700 });
});

async function longPressDeparture() {
  await render(<App />);
  await fireEvent.press(await screen.findByTestId('tab_stations'));
  await fireEvent.press(await screen.findByText('Arlozorov/Ibn Gabirol'));
  await fireEvent(await screen.findByTestId('board_row'), 'longPress');
  await fireEvent.press(await screen.findByTestId('remind_leave'));
}

it('sets a reminder from a departure on the stop screen', async () => {
  schedule.mockClear();
  const board = fake.stopBoard;
  // An hour away, so there's time for a reminder.
  fake.stopBoard = async () => (await board()).map((e) => ({ ...e, departure: { ...e.departure, scheduled: e.departure.scheduled + 3300 } }));
  try {
    await longPressDeparture();
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(1));
    const { content, trigger } = schedule.mock.calls[0][0];
    expect(content.title).toBe('Time to go to Arlozorov/Ibn Gabirol');
    expect(content.body).toMatch(/^Leave at \d\d:\d\d · Bus 5 from Arlozorov\/Ibn Gabirol at \d\d:\d\d$/);
    // Before the bus, and still ahead.
    expect(trigger.date / 1000).toBeLessThan(nowSec() + 3600);
    expect(trigger.date / 1000).toBeGreaterThan(nowSec());
  } finally {
    fake.stopBoard = board;
  }
});

it("sets no reminder for a bus that's too soon", async () => {
  schedule.mockClear();
  await longPressDeparture();
  await screen.findByText('That departure is too soon for a reminder');
  expect(schedule).not.toHaveBeenCalled();
});

it("sets a reminder from a starred stop's departure on Home", async () => {
  const { act, within } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
  const { store } = require('../src/state/store') as typeof import('../src/state/store');
  const { STOP } = require('./support/fakeRepo') as typeof import('./support/fakeRepo');
  schedule.mockClear();
  const board = fake.stopBoard;
  fake.stopBoard = async () => (await board()).map((e) => ({ ...e, departure: { ...e.departure, scheduled: e.departure.scheduled + 3300 } }));
  try {
    await render(<App />);
    await act(() => store.toggleFavoriteStop(STOP));
    const home = await screen.findByTestId('home_stop');
    await fireEvent(await within(home).findByTestId('board_row'), 'longPress');
    await fireEvent.press(await screen.findByTestId('remind_leave'));
    await waitFor(() => expect(schedule).toHaveBeenCalledTimes(1));
    expect(schedule.mock.calls[0][0].content.title).toBe('Time to go to Arlozorov/Ibn Gabirol');
  } finally {
    fake.stopBoard = board;
    await act(() => store.toggleFavoriteStop(STOP));
  }
});

test('reminders set before exact alarms were allowed are set again (R1)', async () => {
  const Notifications = require('expo-notifications') as { getAllScheduledNotificationsAsync: jest.Mock; scheduleNotificationAsync: jest.Mock };
  const { rescheduleReminders } = require('../src/live/notifications') as typeof import('../src/live/notifications');
  const at = Math.floor(Date.now() / 1000) + 3600;
  Notifications.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
    { identifier: `reminder-${at}`, content: { title: 'Time to go', body: 'Leave at 10:05' }, trigger: null },
    { identifier: 'trip-alert', content: { title: 'Get off now', body: '' }, trigger: null },
  ]);
  Notifications.scheduleNotificationAsync.mockClear();
  await rescheduleReminders();
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.scheduleNotificationAsync.mock.calls[0][0]).toMatchObject({ identifier: `reminder-${at}`, content: { title: 'Time to go', body: 'Leave at 10:05' }, trigger: { date: at * 1000 } });
});
