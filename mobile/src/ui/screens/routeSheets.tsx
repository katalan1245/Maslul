import Slider from '@react-native-community/slider';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { TransitMode } from '../../data/models';
import { RIDE_MINUTES, type RideOffer } from '../../data/rides';
import { type Instant, localParts, nowSec, plusDays, today, zoned } from '../../data/time';
import { RAIL_PREFERENCES, type RailPreference, WALK_SPEEDS, type WalkSpeed } from '../../data/userStore';
import { store, useUserData } from '../../state/store';
import { Fmt, modeName } from '../fmt';
import { Button, Chip, Segmented, SettingSwitch, TextButton, Txt } from '../components/common';
import { Icon, modeIcon } from '../components/icons';
import { Sheet } from '../components/overlays';
import { type, useTheme } from '../theme';
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
  const [hour, setHour] = useState(pad2(p.hour));
  const [minute, setMinute] = useState(pad2(p.minute));
  const h = Number(hour);
  const m = Number(minute);
  const valid = /^\d{1,2}$/.test(hour) && /^\d{1,2}$/.test(minute) && h <= 23 && m <= 59;
  const field = [type.headlineSmall, styles.timeField, { color: t.c.onSurface, backgroundColor: t.c.surfaceVariant }];
  return (
    <Sheet visible onDismiss={onDismiss} testID="time_sheet">
      <Txt v="titleLarge">When?</Txt>
      <View style={{ height: 16 }} />
      <Segmented
        options={[
          { value: 'DEPART', label: 'Depart at' },
          { value: 'ARRIVE', label: 'Arrive by' },
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
      <View style={styles.timeRow}>
        <TextInput value={hour} onChangeText={setHour} keyboardType="number-pad" maxLength={2} selectTextOnFocus style={field} accessibilityLabel="Hour" testID="time_hour" />
        <Txt v="headlineSmall" style={{ marginHorizontal: 8 }}>
          :
        </Txt>
        <TextInput
          value={minute}
          onChangeText={setMinute}
          keyboardType="number-pad"
          maxLength={2}
          selectTextOnFocus
          style={field}
          accessibilityLabel="Minute"
          testID="time_minute"
        />
      </View>
      <View style={styles.buttons}>
        <Pressable onPress={() => onApply('NOW', null)} style={styles.half} accessibilityRole="button">
          <Txt v="labelLarge" color={t.c.primary}>
            Leave now
          </Txt>
        </Pressable>
        <Button text="Set time" disabled={!valid} onPress={() => onApply(sel, zoned(date, h, m))} style={[styles.half, { height: 50 }]} testID="set_time" />
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
  onDismiss,
  onPickDestination,
  onApply,
}: {
  current: RideOffer | null;
  onDismiss: () => void;
  onPickDestination: () => void;
  onApply: (r: RideOffer | null) => void;
}) {
  const t = useTheme();
  const [minutes, setMinutes] = useState(current?.kind === 'within' ? current.minutes : 10);
  return (
    <Sheet visible onDismiss={onDismiss} testID="ride_sheet">
      <Txt v="titleLarge">Getting a ride (טרמפ)?</Txt>
      <Txt v="bodySmall" color={t.x.subtle}>
        Someone's driving you part of the way. Find the best place to get out and go on by bus or train.
      </Txt>
      <Pressable
        onPress={onPickDestination}
        style={[styles.option, { backgroundColor: current?.kind === 'toPlace' ? t.c.primaryContainer : t.c.surfaceVariant, marginTop: 16 }]}
        testID="ride_to_place"
        accessibilityRole="button"
      >
        <Icon name="place" color={t.c.primary} />
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Txt v="titleSmall">The driver is going somewhere</Txt>
          <Txt v="bodySmall" color={t.x.subtle}>
            {current?.kind === 'toPlace' ? `To ${current.dest.name} · tap to change` : 'Choose where they\'re heading; get out wherever on the way is best'}
          </Txt>
        </View>
        <Icon name="chevron-right" color={t.x.subtle} />
      </Pressable>
      <View style={[styles.option, { flexDirection: 'column', alignItems: 'stretch', backgroundColor: current?.kind === 'within' ? t.c.primaryContainer : t.c.surfaceVariant, marginTop: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Icon name="schedule" color={t.c.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Txt v="titleSmall">The driver can take me up to…</Txt>
            <Txt v="bodySmall" color={t.x.subtle}>
              Get dropped off wherever is best within that drive
            </Txt>
          </View>
        </View>
        <View style={styles.chips}>
          {RIDE_MINUTES.map((m) => (
            <Chip key={m} label={`${m} min`} selected={minutes === m} onPress={() => setMinutes(m)} />
          ))}
        </View>
        <Button text="Find where to get out" onPress={() => onApply({ kind: 'within', minutes })} testID="ride_within" />
      </View>
      {current != null && (
        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <TextButton text="No ride, plan as usual" onPress={() => onApply(null)} />
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
      <Txt v="titleLarge">Route options</Txt>
      <Txt v="titleSmall" style={{ marginTop: 16, marginBottom: 8 }}>
        Transport
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
          Max walk to/from stops
        </Txt>
        <Txt v="bodyMedium" num>{`${s.maxWalkMinutes} min`}</Txt>
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
        accessibilityLabel="Max walk to or from stops"
        testID="max_walk"
      />
      <Txt v="titleSmall" style={{ marginTop: 8, marginBottom: 8 }}>
        Walking speed
      </Txt>
      <Segmented
        options={(Object.keys(WALK_SPEEDS) as WalkSpeed[]).map((w) => ({ value: w, label: WALK_SPEEDS[w].label }))}
        value={s.walkSpeed}
        onChange={(w) => store.updateSettings((st) => ({ ...st, walkSpeed: w }))}
      />
      <Txt v="titleSmall" style={{ marginTop: 14 }}>
        Prefer trains & light rail
      </Txt>
      <Txt v="bodySmall" color={t.x.subtle} style={{ marginBottom: 8 }}>
        Favor rail over buses, e.g. if buses make you feel sick
      </Txt>
      <Segmented
        options={(Object.keys(RAIL_PREFERENCES) as RailPreference[]).map((r) => ({ value: r, label: RAIL_PREFERENCES[r].label }))}
        value={s.railPreference}
        onChange={(r) => store.updateSettings((st) => ({ ...st, railPreference: r }))}
        testID="rail_preference"
      />
      <View style={{ marginHorizontal: -20, marginTop: 6 }}>
        <SettingSwitch
          title="Wheelchair accessible"
          subtitle="Avoid stairs; prefer step-free routes"
          value={s.wheelchair}
          onChange={(c) => store.updateSettings((st) => ({ ...st, wheelchair: c }))}
        />
      </View>
      <Button text="Show routes" onPress={onDismiss} style={{ marginTop: 18, height: 50 }} testID="options_done" />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  timeField: { width: 72, height: 64, borderRadius: 8, textAlign: 'center', paddingVertical: 0 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  half: { flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center' },
});
