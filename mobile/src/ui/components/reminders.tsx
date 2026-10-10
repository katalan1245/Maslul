import MaslulNative from '../../../modules/maslul-native/src/MaslulNativeModule';
import { GeoMath } from '../../data/geo';
import type { GeoPoint } from '../../data/models';
import { type Instant, nowSec } from '../../data/time';
import { S } from '../../i18n';
import { scheduleReminder } from '../../live/notifications';
import { store } from '../../state/store';
import { Fmt } from '../fmt';
import { TextButton, Txt } from './common';
import { Dialog, showToast } from './overlays';

/** Streets aren't straight: a walk is about this much longer than the straight line. */
const DETOUR = 1.3;

/**
 * When to leave for a bus at [stop] leaving at [departs], and when to remind: the walk there from
 * [here] (none without a location) and the reminder minutes before that.
 */
export function stopReminderAt(departs: Instant, stop: GeoPoint, here: GeoPoint | null, walkMps: number, minutes: number) {
  const walk = here != null ? Math.round((GeoMath.distance(here, stop) * DETOUR) / walkMps) : 0;
  const leaveAt = departs - walk;
  return { leaveAt, at: leaveAt - minutes * 60 };
}

/** Schedules a reminder and says so; true when Android should be asked to allow exact alarms. */
export async function setReminder(at: Instant, title: string, text: string): Promise<boolean> {
  const ok = await scheduleReminder(at, title, text).catch(() => false);
  showToast(ok ? S.detail.reminderSet(Fmt.when(at, nowSec()), store.value.settings.reminderMinutes) : S.detail.reminderTooSoon);
  // Without "Alarms & reminders" Android may hold a reminder back by minutes, up to an hour.
  return ok && MaslulNative?.canScheduleExactAlarms() === false;
}

/** Offers "Alarms & reminders" after a reminder. The app's own dialog, not Alert: Android lays that out by the phone's language, not the app's. */
export function ExactAlarmDialog({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Dialog
      visible={visible}
      title={S.detail.exactAlarmTitle}
      onDismiss={onClose}
      testID="exact_alarm_dialog"
      actions={
        <>
          <TextButton text={S.detail.notNow} onPress={onClose} />
          <TextButton
            text={S.detail.allow}
            onPress={() => {
              onClose();
              MaslulNative?.openExactAlarmSettings();
            }}
          />
        </>
      }
    >
      <Txt v="bodyMedium">{S.detail.exactAlarmBody}</Txt>
    </Dialog>
  );
}
