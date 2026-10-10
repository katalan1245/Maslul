import { useEffect, useRef } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { S } from '../../i18n';
import { useTheme } from '../theme';
import { Txt } from './common';

const pad2 = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
/** Rows shown: the chosen one in the middle, two above and two below. */
const ROWS = 5;

/**
 * One scrolling column of numbers, like the phone's clock. Snaps to a row; a tap on a row picks
 * it; a screen reader steps it up and down (it wraps, as a clock does).
 */
function Wheel({ values, value, onChange, label, testID }: { values: number[]; value: number; onChange: (v: number) => void; label: string; testID?: string }) {
  const t = useTheme();
  const rowH = Math.round(40 * Math.max(1, useWindowDimensions().fontScale));
  const list = useRef<ScrollView>(null);
  const index = Math.max(0, values.indexOf(value));
  useEffect(() => {
    list.current?.scrollTo({ y: index * rowH, animated: false });
  }, [index, rowH]);
  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.min(Math.max(Math.round(e.nativeEvent.contentOffset.y / rowH), 0), values.length - 1);
    if (values[i] !== value) onChange(values[i]);
  };
  const step = (d: number) => onChange(values[(index + d + values.length) % values.length]);
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: pad2(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{ width: 76, height: rowH * ROWS }}
      testID={testID}
    >
      <View pointerEvents="none" style={[styles.band, { top: rowH * 2, height: rowH, backgroundColor: t.c.surfaceVariant }]} />
      <ScrollView
        ref={list}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={rowH}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: index * rowH }}
        contentContainerStyle={{ paddingVertical: rowH * 2 }}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={(e) => {
          // A slow drag that stops on its own sends no momentum end.
          if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e);
        }}
      >
        {values.map((v) => (
          <Pressable key={v} onPress={() => onChange(v)} style={{ height: rowH, alignItems: 'center', justifyContent: 'center' }}>
            <Txt v="headlineSmall" num color={v === value ? t.c.onSurface : t.x.subtle}>
              {pad2(v)}
            </Txt>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Hour and minute wheels for a time of day, in minutes after midnight. */
export function TimeWheels({ minutes, onChange, testID = 'time' }: { minutes: number; onChange: (minutes: number) => void; testID?: string }) {
  const h = Math.trunc(minutes / 60);
  const m = minutes % 60;
  return (
    // Hours stay on the left in Hebrew too: a time reads 07:30 either way.
    <View style={styles.row}>
      <Wheel values={HOURS} value={h} onChange={(v) => onChange(v * 60 + m)} label={S.sheets.hour} testID={`${testID}_hour`} />
      <Txt v="headlineSmall" style={{ marginHorizontal: 8 }}>
        :
      </Txt>
      <Wheel values={MINUTES} value={m} onChange={(v) => onChange(h * 60 + v)} label={S.sheets.minute} testID={`${testID}_minute`} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', direction: 'ltr', alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', left: 0, right: 0, borderRadius: 8 },
});
