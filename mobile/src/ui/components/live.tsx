import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Freshness } from '../../data/freshness';
import { type Instant, nowSec } from '../../data/time';
import { Fmt } from '../fmt';
import { type Theme, type, useTheme } from '../theme';
import { Icon } from './icons';
import { Txt } from './common';

/** Arrival-time colour by data quality: green live, amber stale, plain timetable. */
export function freshnessColor(f: Freshness, t: Theme): string {
  return f === 'LIVE' ? t.x.live : f === 'STALE' ? t.x.stale : t.c.onSurface;
}

/** The current time, re-read every [periodMs] so relative labels ("30s ago") keep ticking. */
export function useNow(periodMs = 1000): Instant {
  const [now, setNow] = useState(nowSec);
  useEffect(() => {
    const id = setInterval(() => setNow(nowSec()), periodMs);
    return () => clearInterval(id);
  }, [periodMs]);
  return now;
}

/** One part of the signal mark (0 = dot, 1 = inner arc, 2 = outer arc), drawn in a [size] box. */
function SignalPart({ part, size, color }: { part: number; size: number; color: string }) {
  const w = size;
  const cx = w * 0.2;
  const cy = w * 0.8;
  if (part === 0) {
    return (
      <Svg width={w} height={w}>
        <Circle cx={cx} cy={cy} r={w * 0.13} fill={color} />
      </Svg>
    );
  }
  const r = w * (part === 1 ? 0.42 : 0.72);
  // A quarter arc from straight up to straight right of the dot.
  return (
    <Svg width={w} height={w}>
      <Path d={`M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} stroke={color} strokeWidth={w * 0.15} strokeLinecap="round" fill="none" />
    </Svg>
  );
}

/**
 * Realtime "signal" mark (a dot with two arcs radiating from it), shown next to live times.
 * Live: the arcs light up in turn, continuously, to show the position keeps updating.
 * Stale: drawn still. Timetable-only: nothing.
 */
export function LiveSignal({ freshness, size = 12, color }: { freshness: Freshness; size?: number; color?: string }) {
  const t = useTheme();
  const phase = useRef(new Animated.Value(0)).current;
  const live = freshness === 'LIVE';
  useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(Animated.timing(phase, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [live, phase]);
  if (freshness === 'SCHEDULED') return null;
  const c = color ?? freshnessColor(freshness, t);
  // Each part glows as the wave passes it (lit at once, fading over 35% of the cycle): dot,
  // then inner arc, then outer arc. The dot never fades below 0.7.
  const opacity = (i: number) => {
    if (!live) return i === 0 ? 1 : 0.55;
    if (i === 0) return phase.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0.7, 0.7] });
    const start = i * 0.22;
    return phase.interpolate({
      inputRange: [0, start - 0.001, start, start + 0.35, 1],
      outputRange: [0.3, 0.3, 1, 0.3, 0.3],
    });
  };
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={live ? 'Live' : 'Live data delayed'}>
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: opacity(i) }]}>
          <SignalPart part={i} size={size} color={c} />
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * An arrival time ("4 min", "21:40") coloured by [freshness], with the live signal beside it.
 * When [onPress] is set the time is tappable (e.g. to show the vehicle on the map).
 */
export function ArrivalTime({
  text,
  freshness,
  v = 'titleMedium',
  onPress,
  testID,
}: {
  text: string;
  freshness: Freshness;
  v?: keyof typeof type;
  onPress?: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const color = freshnessColor(freshness, t);
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <Txt v={v} color={color} num numberOfLines={1}>
        {text}
      </Txt>
      {freshness !== 'SCHEDULED' && (
        <View style={{ marginLeft: 2, marginTop: 1 }}>
          <LiveSignal freshness={freshness} size={11} color={color} />
        </View>
      )}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityHint="Show on map" accessibilityRole="button" style={{ paddingHorizontal: 4, borderRadius: 8 }} testID={testID}>
      {body}
    </Pressable>
  );
}

/**
 * Floating card over a map that follows one vehicle: "Updated 30s ago" ticking every second,
 * the live signal, and a note that the position refreshes by itself.
 */
export function LiveLocationCard({ title, recordedAt, onClose }: { title: string; recordedAt: Instant; onClose?: () => void }) {
  const t = useTheme();
  const now = useNow();
  const f = Freshness.of(recordedAt, now);
  return (
    <View style={[styles.card, { backgroundColor: t.c.surface }]} testID="live_location_card">
      <LiveSignal freshness={f} size={16} />
      <View style={{ flexShrink: 1, marginLeft: 10 }}>
        <Txt v="labelLarge" numberOfLines={1}>
          {title}
        </Txt>
        <Txt v="labelSmall" num color={f === 'LIVE' ? t.x.subtle : t.x.stale} numberOfLines={1}>
          {Fmt.ago(recordedAt, now) + (f === 'LIVE' ? ' · refreshes automatically' : ' · not reporting, may be delayed')}
        </Txt>
      </View>
      {onClose && (
        <Pressable onPress={onClose} accessibilityLabel="Stop following" hitSlop={8} style={{ padding: 8 }}>
          <Icon name="close" size={18} color={t.x.subtle} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
});
