import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { TransitMode } from '../../data/models';
import { RIDE_MINUTES, type RideOffer } from '../../data/rides';
import { WiderWalk } from '../../data/grace';
import { type Instant, localParts, nowSec, plusDays, today, zoned } from '../../data/time';
import { RAIL_PREFERENCES, ROUTE_SORTS, type RailPreference, WALK_SPEEDS, type WalkSpeed } from '../../data/userStore';
import { store, useUserData } from '../../state/store';
import { S } from '../../i18n';
import { Fmt, modeName } from '../fmt';
import { Button, Chip, Segmented, SettingSwitch, TextButton, Txt } from '../components/common';
import { Icon, modeIcon } from '../components/icons';
import { Sheet } from '../components/overlays';
import { TimeWheels } from '../components/wheels';
import { useTheme } from '../theme';
import type { TimeMode } from './routesModel';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function TimeSheet({
  mode,
  time,
  onDismiss,
  onApply,
}: {
  mode: TimeMode;
  time: Instant | null;
  onDismiss: () => void;
  onApply: (mode: TimeMode, t: Instant | null) => void;
}) {
  const t = useTheme();
  const initial = time ?? nowSec() + 15 * 60;
  const p = localParts(initial);
  const todayDate = today();
  const [sel, setSel] = useState<TimeMode>(mode === 'NOW' ? 'DEPART' : mode);
  const [date, setDate] = useState(`${p.year}-${pad2(p.month)}-${pad2(p.day)}`);
  const [minutes, setMinutes] = useState(p.hour * 60 + p.minute);
  return (
    <Sheet visible onDismiss={onDismiss} testID="time_sheet">
      <Txt v="titleLarge">{S.sheets.when}</Txt>
      <View style={{ height: 16 }} />
      <Segmented
        options={[
          { value: 'DEPART', label: S.sheets.departAt },
          { value: 'ARRIVE', label: S.sheets.arriveBy },
        ]}
        value={sel}
        onChange={setSel}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 16 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const day = plusDays(todayDate, d);
          return <Chip key={day} label={Fmt.day(day, todayDate)} selected={day === date} onPress={() => setDate(day)} />;
        })}
      </ScrollView>
      <TimeWheels minutes={minutes} onChange={setMinutes} />
      <View style={styles.buttons}>
        <Pressable onPress={() => onApply('NOW', null)} style={styles.half} accessibilityRole="button">
          <Txt v="labelLarge" color={t.c.primary}>
            {S.cards.leaveNow}
          </Txt>
        </Pressable>
        <Button text={S.sheets.setTime} onPress={() => onApply(sel, zoned(date, Math.trunc(minutes / 60), minutes % 60))} style={[styles.half, { height: 50 }]} testID="set_time" />
      </View>
    </Sheet>
  );
}

/**
 * Getting a lift for the first part of the trip: either the driver is heading somewhere (get out
 * wherever on their way is best), or they'll take you anywhere within a few minutes' drive.
 */
export function RideSheet({
  current,
  when,
  onDismiss,
  onPickDestination,
  onPickTime,
  onApply,
}: {
  current: RideOffer | null;
  /** The trip's time, which is when the driver leaves (or, for arrive-by, when you must be there). */
  when: string;
  onDismiss: () => void;
  onPickDestination: () => void;
  onPickTime: () => void;
  onApply: (r: RideOffer | null) => void;
}) {
  const t = useTheme();
  const [minutes, setMinutes] = useState(current?.kind === 'within' ? current.minutes : 10);
  return (
    <Sheet visible onDismiss={onDismiss} testID="ride_sheet">
      <Txt v="titleLarge">{S.sheets.rideTitle}</Txt>
      <Txt v="bodySmall" color={t.x.subtle}>
        {S.sheets.rideIntro}
      </Txt>
      <Pressable
        onPress={onPickDestination}
        style={[styles.option, { backgroundColor: current?.kind === 'toPlace' ? t.c.primaryContainer : t.c.surfaceVariant, marginTop: 16 }]}
        testID="ride_to_place"
        accessibilityRole="button"
      >
        <Icon name="place" color={t.c.primary} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Txt v="titleSmall">{S.sheets.driverGoing}</Txt>
          <Txt v="bodySmall" color={t.x.subtle}>
            {current?.kind === 'toPlace' ? S.sheets.toPlace(current.dest.name) : S.sheets.toPlaceHint}
          </Txt>
        </View>
        <Icon name="chevron-right" color={t.x.subtle} />
      </Pressable>
      {current?.kind === 'toPlace' && (
        <View style={{ marginHorizontal: -20 }}>
          <SettingSwitch
            title={S.sheets.onlyAtDest}
            subtitle={S.sheets.onlyAtDestHint}
            value={current.only === true}
            onChange={(only) => onApply({ ...current, only })}
            testID="ride_only_dest"
          />
        </View>
      )}
      <View style={[styles.option, { flexDirection: 'column', alignItems: 'stretch', backgroundColor: current?.kind === 'within' ? t.c.primaryContainer : t.c.surfaceVariant, marginTop: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Icon name="schedule" color={t.c.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt v="titleSmall">{S.sheets.driverUpTo}</Txt>
            <Txt v="bodySmall" color={t.x.subtle}>
              {S.sheets.upToHint}
            </Txt>
          </View>
        </View>
        <View style={styles.chips}>
          {RIDE_MINUTES.map((m) => (
            <Chip key={m} label={S.fmt.min(m)} selected={minutes === m} onPress={() => setMinutes(m)} />
          ))}
        </View>
        <Button text={S.sheets.findDropOff} onPress={() => onApply({ kind: 'within', minutes })} testID="ride_within" />
      </View>
      <Pressable
        onPress={onPickTime}
        style={[styles.option, { backgroundColor: t.c.surfaceVariant, marginTop: 12 }]}
        testID="ride_time"
        accessibilityRole="button"
      >
        <Icon name="schedule" color={t.c.primary} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Txt v="titleSmall">{S.sheets.rideWhen}</Txt>
          <Txt v="bodySmall" color={t.x.subtle}>
            {when}
          </Txt>
        </View>
        <Icon name="chevron-right" color={t.x.subtle} />
      </Pressable>
      {current != null && (
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <TextButton text={S.sheets.noRide} onPress={() => onApply(null)} />
        </View>
      )}
    </Sheet>
  );
}

const MODES: TransitMode[] = ['BUS', 'TRAIN', 'LIGHT_RAIL', 'METRO', 'CABLE_CAR', 'FERRY'];

/** Route options: the transport to use, walking and accessibility. Changes apply straight away. */
export function OptionsSheet({ onDismiss }: { onDismiss: () => void }) {
  const t = useTheme();
  const s = useUserData().settings;
  return (
    <Sheet visible onDismiss={onDismiss} testID="options_sheet">
      <Txt v="titleLarge">{S.sheets.optionsTitle}</Txt>
      <Txt v="titleSmall" style={{ marginTop: 16, marginBottom: 8 }}>
        {S.sheets.transport}
      </Txt>
      <View style={styles.chipsWrap}>
        {MODES.map((m) => {
          const on = s.modes.includes(m);
          return (
            <Chip
              key={m}
              label={modeName(m)}
              icon={modeIcon(m)}
              selected={on}
              onPress={() =>
                store.updateSettings((st) => {
                  const next = on ? st.modes.filter((x) => x !== m) : [...st.modes, m];
                  return { ...st, modes: next.length ? next : st.modes };
                })
              }
            />
          );
        })}
      </View>
      <View style={[styles.rowBetween, { marginTop: 18 }]}>
        <Txt v="titleSmall" style={{ flex: 1 }}>
          {S.sheets.maxWalk}
        </Txt>
        <Txt v="bodyMedium" num>{S.fmt.min(s.maxWalkMinutes)}</Txt>
      </View>
      <Slider
        value={s.maxWalkMinutes}
        minimumValue={5}
        maximumValue={30}
        step={5}
        minimumTrackTintColor={t.c.primary}
        maximumTrackTintColor={t.c.surfaceContainerHighest}
        thumbTintColor={t.c.primary}
        onValueChange={(v) => store.updateSettings((st) => ({ ...st, maxWalkMinutes: Math.max(Math.trunc(v / 5), 1) * 5 }))}
        accessibilityLabel={S.sheets.maxWalkA11y}
        testID="max_walk"
      />
      <Txt v="bodySmall" color={t.x.subtle}>
        {S.sheets.maxWalkHint(WiderWalk.MINUTES)}
      </Txt>
      <Txt v="titleSmall" style={{ marginTop: 8, marginBottom: 8 }}>
        {S.sheets.walkSpeed}
      </Txt>
      <Segmented
        options={(Object.keys(WALK_SPEEDS) as WalkSpeed[]).map((w) => ({ value: w, label: S.sheets.walkSpeeds[w] }))}
        value={s.walkSpeed}
        onChange={(w) => store.updateSettings((st) => ({ ...st, walkSpeed: w }))}
      />
      <Txt v="titleSmall" style={{ marginTop: 14 }}>
        {S.sheets.routeSort}
      </Txt>
      <Txt v="bodySmall" color={t.x.subtle} style={{ marginBottom: 8 }}>
        {S.sheets.routeSortHint}
      </Txt>
      <Segmented
        options={ROUTE_SORTS.map((r) => ({ value: r, label: S.sheets.routeSorts[r] }))}
        value={s.routeSort}
        onChange={(r) => store.updateSettings((st) => ({ ...st, routeSort: r }))}
        testID="route_sort"
      />
      <Txt v="titleSmall" style={{ marginTop: 14 }}>
        {S.sheets.preferRail}
      </Txt>
      <Txt v="bodySmall" color={t.x.subtle} style={{ marginBottom: 8 }}>
        {S.sheets.preferRailHint}
      </Txt>
      <Segmented
        options={(Object.keys(RAIL_PREFERENCES) as RailPreference[]).map((r) => ({ value: r, label: S.sheets.railPreferences[r] }))}
        value={s.railPreference}
        onChange={(r) => store.updateSettings((st) => ({ ...st, railPreference: r }))}
        testID="rail_preference"
      />
      <View style={{ marginHorizontal: -20, marginTop: 6 }}>
        <SettingSwitch
          title={S.sheets.wheelchair}
          subtitle={S.sheets.wheelchairHint}
          value={s.wheelchair}
          onChange={(c) => store.updateSettings((st) => ({ ...st, wheelchair: c }))}
        />
      </View>
      <Button text={S.sheets.showRoutes} onPress={onDismiss} style={{ marginTop: 18, height: 50 }} testID="options_done" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  half: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center' },
});
