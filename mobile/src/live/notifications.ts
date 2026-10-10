import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { type Instant, nowSec } from '../data/time';

/** Notification channels, as in the Kotlin app (live/Notifications.kt). */
export const CH_TRIP = 'live_trip';
export const CH_ALERT = 'trip_alerts';
export const CH_REMIND = 'reminders';

let channelsReady: Promise<void> | null = null;

export function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelsReady ??= Promise.all([
    Notifications.setNotificationChannelAsync(CH_TRIP, {
      name: 'Live directions',
      importance: Notifications.AndroidImportance.LOW,
      description: 'Ongoing step-by-step trip guidance',
      showBadge: false,
    }),
    Notifications.setNotificationChannelAsync(CH_ALERT, {
      name: 'Get-off & boarding alerts',
      importance: Notifications.AndroidImportance.HIGH,
      description: "Alerts when your ride is arriving or it's time to get off",
      enableVibrate: true,
      vibrationPattern: [0, 350, 150, 350],
    }),
    Notifications.setNotificationChannelAsync(CH_REMIND, {
      name: 'Departure reminders',
      importance: Notifications.AndroidImportance.HIGH,
      description: 'Reminders to leave on time',
    }),
  ]).then(() => undefined);
  return channelsReady;
}

/** Shows notifications while the app is open too (alerts matter most then: you're on the bus). */
export function setUpNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
  void ensureChannels();
}

/** Asks to post notifications where needed (Android 13+, iOS); true when allowed. */
export async function canNotify(ask: boolean): Promise<boolean> {
  try {
    const now = await Notifications.getPermissionsAsync();
    if (now.granted || !ask) return now.granted;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** An alert right away (boarding soon, get off), replacing the previous one. */
export async function alert(title: string, text: string) {
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    identifier: 'trip-alert',
    content: { title, body: text, sound: true, priority: Notifications.AndroidNotificationPriority.HIGH },
    trigger: Platform.OS === 'android' ? { channelId: CH_ALERT } : null,
  });
}

/** Takes the trip alert out of the shade once the trip ends. */
export async function dismissAlert() {
  await Notifications.dismissNotificationAsync('trip-alert').catch(() => {});
}

/**
 * Schedules a "time to leave" notification at [at]. Android delivers it with an exact alarm when
 * the app may set one (as the Kotlin app did), else as close as the system allows.
 * False when [at] has already passed.
 */
export async function scheduleReminder(at: Instant, title: string, text: string): Promise<boolean> {
  if (at < nowSec()) return false;
  await ensureChannels();
  await Notifications.scheduleNotificationAsync({
    identifier: `reminder-${at}`,
    content: { title, body: text, sound: true },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at * 1000, channelId: CH_REMIND },
  });
  return true;
}
