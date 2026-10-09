import { type ReactNode, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  type StyleProp,
  StyleSheet,
  Switch,
  Text,
  type TextProps,
  type TextStyle,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import type { TransitMode } from '../../data/models';
import { ModeColors, alpha, contentColorOn, numeric, type, useTheme } from '../theme';
import { Icon, type IconName, modeIcon } from './icons';

type Variant = keyof typeof type;

/** Text in the theme's colour and one of the Material type styles. */
export function Txt({
  v = 'bodyMedium',
  color,
  style,
  num,
  ...rest
}: TextProps & { v?: Variant; color?: string; num?: boolean; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text {...rest} style={[type[v], { color: color ?? t.c.onSurface }, num && numeric, style]} />;
}

/** Rounded line-number pill with the mode icon, e.g. [🚌 480]. */
export function LineBadge({
  label,
  mode,
  color = ModeColors[mode],
  showIcon = true,
  large = false,
}: {
  label: string;
  mode: TransitMode;
  color?: string;
  showIcon?: boolean;
  large?: boolean;
}) {
  const fg = contentColorOn(color);
  return (
    <View
      style={[s.badge, { backgroundColor: color, borderRadius: large ? 10 : 8, paddingHorizontal: large ? 10 : 7, paddingVertical: large ? 5 : 3 }]}
      accessibilityLabel={`Line ${label}`}
    >
      {showIcon && (
        <View style={{ marginRight: 3 }}>
          <Icon name={modeIcon(mode)} size={large ? 18 : 15} color={fg} />
        </View>
      )}
      <Text style={[{ color: fg, fontWeight: '700', fontSize: large ? 17 : 14 }, numeric]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Small pulsing dot used to mark realtime information. */
export function LiveDot({ color, size = 7 }: { color?: string; size?: number }) {
  const t = useTheme();
  const a = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 0.25, duration: 900, useNativeDriver: true }),
        Animated.timing(a, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? t.x.live, opacity: a }} />;
}

export function SectionHeader({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={s.section}>
      <Txt v="labelMedium" color={t.x.subtle} style={{ flex: 1, letterSpacing: 0.8 }} accessibilityRole="header">
        {text.toUpperCase()}
      </Txt>
      {action && onAction && <TextButton text={action} onPress={onAction} />}
    </View>
  );
}

export function LoadingBox({ text }: { text?: string }) {
  const t = useTheme();
  return (
    <View style={s.loading} testID="loading">
      <ActivityIndicator color={t.c.primary} />
      {text != null && (
        <Txt v="bodyMedium" color={t.x.subtle} style={{ marginTop: 12 }}>
          {text}
        </Txt>
      )}
    </View>
  );
}

export function MessageBox({
  title,
  body,
  icon = 'cloud-off',
  action,
  onAction,
}: {
  title: string;
  body?: string | null;
  icon?: IconName;
  action?: string;
  onAction?: () => void;
}) {
  const t = useTheme();
  return (
    <View style={s.message}>
      <Icon name={icon} size={36} color={t.x.subtle} />
      <Txt v="titleMedium" style={{ marginTop: 12, textAlign: 'center' }}>
        {title}
      </Txt>
      {body != null && (
        <Txt v="bodyMedium" color={t.x.subtle} style={{ marginTop: 4, textAlign: 'center' }}>
          {body}
        </Txt>
      )}
      {action && onAction && (
        <View style={{ marginTop: 8 }}>
          <TextButton text={action} onPress={onAction} />
        </View>
      )}
    </View>
  );
}

/** A tappable list row with a leading icon bubble. */
export function PlaceRow({
  title,
  subtitle,
  icon = 'place',
  iconTint,
  subtitleColor,
  trailing,
  onPress,
  onLongPress,
  testID,
}: {
  title: string;
  subtitle?: string | null;
  icon?: IconName;
  iconTint?: string;
  subtitleColor?: string;
  trailing?: ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: t.x.divider }}
      style={s.row}
      accessibilityRole="button"
      testID={testID}
    >
      <View style={[s.bubble, { backgroundColor: t.c.surfaceVariant }]}>
        <Icon name={icon} size={20} color={iconTint ?? t.c.onSurfaceVariant} />
      </View>
      <View style={{ flex: 1, marginLeft: 14 }}>
        <Txt v="bodyLarge" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle != null && subtitle.trim() !== '' && (
          <Txt v="bodySmall" color={subtitleColor ?? t.x.subtle} numberOfLines={1}>
            {subtitle}
          </Txt>
        )}
      </View>
      {trailing != null && <View style={{ marginLeft: 8, maxWidth: 140 }}>{trailing}</View>}
    </Pressable>
  );
}

export function Pill({ text, color, filled = false }: { text: string; color: string; filled?: boolean }) {
  return (
    <View style={[s.pill, { backgroundColor: filled ? color : alpha(color, 0.13) }]}>
      <Txt v="labelMedium" color={filled ? '#FFFFFF' : color} numberOfLines={1}>
        {text}
      </Txt>
    </View>
  );
}

export function Hairline({ start = 0 }: { start?: number }) {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, marginLeft: start, backgroundColor: t.x.divider }} />;
}

export function IconButton({
  icon,
  label,
  onPress,
  color,
  size = 24,
  disabled,
  filled,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  /** A tonal round button floating over a map. */
  filled?: boolean;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [
        s.iconButton,
        filled && { backgroundColor: t.c.surfaceContainerHigh, elevation: 2 },
        { opacity: disabled ? 0.38 : pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={icon} size={size} color={color ?? t.c.onSurfaceVariant} />
    </Pressable>
  );
}

export function TextButton({ text, onPress, color, testID, disabled }: { text: string; onPress: () => void; color?: string; testID?: string; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
      style={({ pressed }) => [s.textButton, { opacity: disabled ? 0.38 : pressed ? 0.6 : 1 }]}
    >
      <Txt v="labelLarge" color={color ?? t.c.primary}>
        {text}
      </Txt>
    </Pressable>
  );
}

/** Filled (primary), tonal or outlined pill button. */
export function Button({
  text,
  onPress,
  icon,
  kind = 'filled',
  testID,
  style,
  disabled,
}: {
  text?: string;
  onPress: () => void;
  icon?: IconName;
  kind?: 'filled' | 'tonal' | 'outlined';
  testID?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const t = useTheme();
  const bg = kind === 'filled' ? t.c.primary : kind === 'tonal' ? t.c.primaryContainer : 'transparent';
  const fg = kind === 'filled' ? t.c.onPrimary : kind === 'tonal' ? t.c.onPrimaryContainer : t.c.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={text ?? undefined}
      testID={testID}
      style={({ pressed }) => [
        s.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        kind === 'outlined' && { borderWidth: 1, borderColor: t.c.outline },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={18} color={fg} />}
      {text != null && (
        <Txt v="labelLarge" color={fg} style={icon ? { marginLeft: 6 } : undefined}>
          {text}
        </Txt>
      )}
    </Pressable>
  );
}

/** Material filter chip. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
  iconColor,
  testID,
  maxWidth,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  iconColor?: string;
  testID?: string;
  maxWidth?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      testID={testID}
      style={[
        s.chip,
        { maxWidth },
        selected ? { backgroundColor: t.c.primaryContainer, borderColor: t.c.primaryContainer } : { borderColor: t.c.outline },
      ]}
    >
      {icon && (
        <View style={{ marginRight: 6 }}>
          <Icon name={icon} size={18} color={iconColor ?? (selected ? t.c.onPrimaryContainer : t.c.onSurfaceVariant)} />
        </View>
      )}
      <Txt v="labelLarge" color={selected ? t.c.onPrimaryContainer : t.c.onSurfaceVariant} numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Single-choice segmented buttons. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <View style={[s.segmented, { borderColor: t.c.outline }]} testID={testID} accessibilityRole="radiogroup">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[s.segment, i > 0 && { borderLeftWidth: 1, borderLeftColor: t.c.outline }, on && { backgroundColor: t.c.primaryContainer }]}
          >
            {on && <Icon name="check" size={16} color={t.c.onPrimaryContainer} />}
            <Txt v="labelLarge" color={on ? t.c.onPrimaryContainer : t.c.onSurface} numberOfLines={1} style={on ? { marginLeft: 4 } : undefined}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A setting row that toggles when tapped anywhere. */
export function SettingSwitch({
  title,
  subtitle,
  value,
  onChange,
  testID,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} style={s.switchRow} accessibilityRole="switch" accessibilityState={{ checked: value }} testID={testID}>
      <View style={{ flex: 1 }}>
        <Txt v="bodyLarge">{title}</Txt>
        <Txt v="bodySmall" color={t.x.subtle}>
          {subtitle}
        </Txt>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: t.c.primary, false: t.c.surfaceContainerHighest }}
        thumbColor={value ? t.c.onPrimary : t.c.outline}
      />
    </Pressable>
  );
}

/** The rounded search field at the top of the Lines and Stations tabs. */
export function SearchBox({
  query,
  onQuery,
  placeholder,
  testID,
  autoFocus,
}: {
  query: string;
  onQuery: (q: string) => void;
  placeholder: string;
  testID?: string;
  autoFocus?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={[s.searchBox, { backgroundColor: t.c.surfaceVariant }]}>
      <Icon name="search" color={t.x.subtle} />
      <TextInput
        value={query}
        onChangeText={onQuery}
        placeholder={placeholder}
        placeholderTextColor={t.x.subtle}
        returnKeyType="search"
        autoFocus={autoFocus}
        style={[type.bodyLarge, { flex: 1, marginLeft: 10, color: t.c.onSurface, paddingVertical: 0 }]}
        testID={testID}
        accessibilityLabel={placeholder}
      />
      {query !== '' && <IconButton icon="close" label="Clear" size={18} onPress={() => onQuery('')} />}
    </View>
  );
}

/** A thin bar under a header while something loads. */
export function ProgressBar({ active, testID }: { active: boolean; testID?: string }) {
  const t = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, x]);
  if (!active) return <View style={{ height: 2 }} />;
  return (
    <View style={{ height: 2, overflow: 'hidden', backgroundColor: alpha(t.c.primary, 0.2) }} testID={testID} accessibilityRole="progressbar">
      <Animated.View
        style={{
          width: '40%',
          height: 2,
          backgroundColor: t.c.primary,
          transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-200, 500] }) }],
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  section: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 8, paddingTop: 18, paddingBottom: 4 },
  loading: { padding: 32, alignItems: 'center' },
  message: { paddingHorizontal: 32, paddingVertical: 40, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 11 },
  bubble: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  textButton: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20 },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 46, paddingHorizontal: 20, borderRadius: 999 },
  chip: { flexDirection: 'row', alignItems: 'center', height: 32, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, overflow: 'hidden', height: 40 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, height: 50, borderRadius: 14, paddingLeft: 14, paddingRight: 4 },
});
