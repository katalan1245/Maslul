import Slider from '@react-native-community/slider';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Place, placePoint } from '../../data/models';
import { ShuttleSchedule } from '../../data/shuttles';
import { type Shuttle, WORK_WEEK } from '../../data/userStore';
import { store, useUserData } from '../../state/store';
import { Button, Chip, IconButton, PlaceRow, TextButton, Txt } from '../components/common';
import { type RootStack, nav } from '../nav';
import { hex, type, useTheme } from '../theme';

/** "07:30, 08:00 +3 · Sun–Thu". */
function summary(s: Shuttle): string {
  const shown = s.times.slice(0, 2).map(ShuttleSchedule.formatTime).join(', ');
  const more = s.times.length > 2 ? ` +${s.times.length - 2}` : '';
  return `${shown}${more} · ${ShuttleSchedule.formatDays(s.days)}`;
}

export function ShuttlesScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const data = useUserData();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.background }} testID="shuttles_screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <IconButton icon="arrow-back" label="Back" onPress={nav.pop} />
        <Txt v="titleLarge">My shuttles</Txt>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
        <Txt v="bodyMedium" color={t.x.subtle} style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
          Add a shuttle that runs on a fixed timetable, like your company's bus to the train station. Trip planning then offers it on its own or combined
          with buses and trains.
        </Txt>
        {data.shuttles.map((s) => (
          // Its timetable; the stops (often in Hebrew, which mixes badly with times on one line) are in the editor.
          <PlaceRow
            key={s.id}
            title={s.name}
            subtitle={summary(s)}
            icon="directions-bus"
            iconTint={hex(ShuttleSchedule.COLOR)}
            onPress={() => nav.push('ShuttleEdit', { existing: s })}
          />
        ))}
        <PlaceRow title="Add shuttle" icon="add" iconTint={t.c.primary} onPress={() => nav.push('ShuttleEdit', { existing: null })} testID="add_shuttle" />
      </ScrollView>
    </View>
  );
}

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

export function ShuttleEditScreen({ route }: NativeStackScreenProps<RootStack, 'ShuttleEdit'>) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const existing = route.params.existing;
  const draft = route.params.draft;
  const [id] = useState(existing?.id ?? newId());
  const isNew = existing == null;
  const [name, setName] = useState(existing?.name ?? draft?.name ?? '');
  const [from, setFrom] = useState<Place | null>(existing?.from ?? draft?.from ?? null);
  const [to, setTo] = useState<Place | null>(existing?.to ?? draft?.to ?? null);
  const [times, setTimes] = useState(existing ? ShuttleSchedule.formatTimes(existing.times) : '');
  /** Unset on a new shuttle: there's no sensible default, so it has to be chosen. */
  const [rideMinutes, setRideMinutes] = useState<number | null>(existing?.rideMinutes ?? draft?.rideMinutes ?? null);
  const [days, setDays] = useState<number[]>(existing?.days ?? draft?.days ?? WORK_WEEK);
  /** Set once Save was tapped with something missing: from then on the missing fields are marked. */
  const [showMissing, setShowMissing] = useState(false);

  const parsed = ShuttleSchedule.parseTimes(times);
  const missing = ShuttleSchedule.missing(name, from, to, times, rideMinutes, days);
  const canSave = missing.length === 0;
  const err = t.c.error;

  const pick = (isFrom: boolean) =>
    nav.push('Search', {
      from: null,
      to: null,
      editing: 'TO',
      single: true,
      title: isFrom ? 'Where the shuttle leaves from' : 'Where the shuttle goes',
      onDone: (p) => {
        nav.pop();
        if (isFrom) setFrom(p);
        else setTo(p);
      },
    });

  const shuttle = (): Shuttle => ({ id, name: name.trim(), from: from!, to: to!, times: parsed!, rideMinutes: rideMinutes!, days });

  /** False (and the missing fields marked) when something's still missing. */
  const check = () => {
    if (!canSave) setShowMissing(true);
    return canSave;
  };

  const save = () => {
    if (!check()) return;
    store.saveShuttle(shuttle());
    nav.pop();
  };

  /** Saves this one and starts the way back: same shuttle, ends swapped, its own times. */
  const addReturn = () => {
    if (!check()) return;
    const s = shuttle();
    store.saveShuttle(s);
    nav.replace('ShuttleEdit', { existing: null, draft: { name: s.name, from: s.to, to: s.from, rideMinutes: s.rideMinutes, days: s.days } });
  };

  // Both ends at one stop: the second one picked is the one to change.
  const sameStop = from != null && to != null && ShuttleSchedule.isNear(placePoint(from), placePoint(to));
  const bad = parsed == null && (!ShuttleSchedule.isEmptyTimes(times) || showMissing);
  const rideMissing = rideMinutes == null && showMissing;
  const input = [type.bodyLarge, styles.input, { color: t.c.onSurface }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="shuttle_edit_screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <IconButton icon="arrow-back" label="Back" onPress={nav.pop} />
        <Txt v="titleLarge">{isNew ? 'New shuttle' : 'Edit shuttle'}</Txt>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Txt v="labelMedium" color={showMissing && name.trim() === '' ? err : t.x.subtle} style={styles.label}>
          Name
        </Txt>
        <TextInput
          value={name}
          onChangeText={(v) => setName(v.slice(0, 24))}
          placeholder="e.g. Office shuttle"
          placeholderTextColor={t.x.subtle}
          autoCapitalize="sentences"
          style={[input, { borderColor: showMissing && name.trim() === '' ? err : t.c.outline }]}
          accessibilityLabel="Name"
          testID="shuttle_name"
        />
        <View style={{ height: 6 }} />
        <PlaceRow
          title="From"
          subtitle={from?.name ?? 'Choose where it leaves from'}
          icon="trip-origin"
          iconTint={t.c.primary}
          subtitleColor={showMissing && from == null ? err : t.x.subtle}
          onPress={() => pick(true)}
          testID="shuttle_from"
        />
        <PlaceRow
          title="To"
          subtitle={to?.name ?? 'Choose where it goes'}
          icon="flag"
          iconTint={t.c.primary}
          subtitleColor={showMissing && (to == null || sameStop) ? err : t.x.subtle}
          onPress={() => pick(false)}
          testID="shuttle_to"
        />
        <Txt v="labelMedium" color={bad ? err : t.x.subtle} style={[styles.label, { marginTop: 8 }]}>
          Departure times
        </Txt>
        <TextInput
          value={times}
          onChangeText={setTimes}
          placeholder="07:30, 08:15, 17:00"
          placeholderTextColor={t.x.subtle}
          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
          autoCapitalize="none"
          style={[input, { borderColor: bad ? err : t.c.outline }]}
          accessibilityLabel="Departure times"
          testID="shuttle_times"
        />
        <Txt v="bodySmall" color={bad ? err : t.x.subtle} style={{ paddingHorizontal: 36, paddingTop: 4 }}>
          {bad && ShuttleSchedule.isEmptyTimes(times)
            ? 'Add at least one departure time'
            : bad
              ? 'Use 24-hour times separated by commas, like 07:30, 17:00'
              : parsed != null
                ? `${parsed.length} departure${parsed.length > 1 ? 's' : ''} a day`
                : 'When it leaves from the first stop'}
        </Txt>
        <View style={[styles.rideRow, { marginTop: 8 }]}>
          <Txt v="titleSmall" color={rideMissing ? err : t.c.onSurface} style={{ flex: 1 }}>
            Ride takes
          </Txt>
          <Txt v="bodyMedium" num color={rideMissing ? err : rideMinutes == null ? t.x.subtle : t.c.onSurface} testID="shuttle_ride">
            {rideMinutes != null ? `${rideMinutes} min` : 'Not set'}
          </Txt>
        </View>
        <View style={{ paddingHorizontal: 12 }}>
          <Slider
            // Unset: the thumb waits faded at the start until it's moved.
            value={rideMinutes ?? 5}
            minimumValue={5}
            maximumValue={120}
            step={5}
            minimumTrackTintColor={rideMinutes == null ? t.c.outlineVariant : t.c.primary}
            maximumTrackTintColor={t.c.outlineVariant}
            thumbTintColor={rideMinutes == null ? t.x.subtle : t.c.primary}
            onValueChange={(v) => setRideMinutes(Math.min(Math.max(Math.round(v / 5) * 5, 5), 120))}
            accessibilityLabel="Ride takes"
            testID="shuttle_ride_slider"
          />
        </View>
        {rideMinutes == null && (
          <Txt v="bodySmall" color={rideMissing ? err : t.x.subtle} style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
            Slide to set how long it takes from stop to stop
          </Txt>
        )}
        <Txt v="titleSmall" color={showMissing && days.length === 0 ? err : t.c.onSurface} style={{ paddingHorizontal: 20 }}>
          Runs on
        </Txt>
        <View style={styles.days}>
          {/* Sunday first, as the week goes in Israel. */}
          {[7, 1, 2, 3, 4, 5, 6].map((d) => {
            const on = days.includes(d);
            return <Chip key={d} label={DAY_NAMES[d]} selected={on} onPress={() => setDays(on ? days.filter((x) => x !== d) : [...days, d])} />;
          })}
        </View>
        {/* Save can always be tapped: with something missing it says what, rather than doing nothing. */}
        {ShuttleSchedule.missingText(missing) != null && (
          <Txt v="bodySmall" color={showMissing ? err : t.x.subtle} style={{ paddingHorizontal: 20, paddingBottom: 10 }} testID="shuttle_missing">
            {ShuttleSchedule.missingText(missing)}
          </Txt>
        )}
        <Button text="Save" onPress={save} style={{ marginHorizontal: 20, height: 50 }} testID="shuttle_save" />
        <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 4 }}>
          <TextButton text="Save and add the way back" onPress={addReturn} />
          <View style={{ flex: 1 }} />
          {!isNew && (
            <TextButton
              text="Delete"
              color={err}
              onPress={() => {
                store.removeShuttle(id);
                nav.pop();
              }}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 4 },
  label: { paddingHorizontal: 24, marginBottom: 4 },
  input: { marginHorizontal: 20, borderWidth: 1, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 12 },
  rideRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 16 },
});
