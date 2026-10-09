import { createContext, useContext } from 'react';
import type { TextStyle } from 'react-native';
import type { TransitMode } from '../data/models';
import { Operators } from '../data/operators';

/** The Kotlin app's Material 3 colour schemes (ui/theme/Theme.kt). */
export interface Scheme {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  background: string;
  onBackground: string;
  surface: string;
  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  outline: string;
  outlineVariant: string;
  error: string;
}

/** Semantic colours beyond Material's scheme. */
export interface Extra {
  live: string;
  late: string;
  early: string;
  walk: string;
  subtle: string;
  divider: string;
  /** Live data that stopped updating (amber); readable on both surfaces. */
  stale: string;
}

export const BRAND = '#1F6FEB';

const light: Scheme = {
  primary: BRAND,
  onPrimary: '#FFFFFF',
  primaryContainer: '#E3EDFF',
  onPrimaryContainer: '#0B2E6B',
  background: '#F7F8FA',
  onBackground: '#0F1115',
  surface: '#FFFFFF',
  onSurface: '#0F1115',
  surfaceVariant: '#F0F2F5',
  onSurfaceVariant: '#5B6472',
  surfaceContainer: '#F3F4F6',
  surfaceContainerHigh: '#ECEEF1',
  surfaceContainerHighest: '#E5E7EB',
  outline: '#D0D5DD',
  outlineVariant: '#E4E7EC',
  error: '#E5484D',
};

const dark: Scheme = {
  primary: '#6EA8FF',
  onPrimary: '#00214F',
  primaryContainer: '#16325C',
  onPrimaryContainer: '#D7E5FF',
  background: '#0F1115',
  onBackground: '#E8EAED',
  surface: '#171A20',
  onSurface: '#E8EAED',
  surfaceVariant: '#22262E',
  onSurfaceVariant: '#9AA3B2',
  surfaceContainer: '#1C2027',
  surfaceContainerHigh: '#232830',
  surfaceContainerHighest: '#2B313A',
  outline: '#3A414C',
  outlineVariant: '#2A3038',
  error: '#FF6B6B',
};

const lightExtra: Extra = {
  live: '#12A150',
  late: '#E5484D',
  early: '#1F6FEB',
  walk: '#8A94A6',
  subtle: '#6B7280',
  divider: 'rgba(0,0,0,0.08)',
  stale: '#B45309',
};

const darkExtra: Extra = {
  live: '#3DD68C',
  late: '#FF6B6B',
  early: '#6EA8FF',
  walk: '#7D8696',
  subtle: '#9AA3B2',
  divider: 'rgba(255,255,255,0.12)',
  stale: '#F5B942',
};

export interface Theme {
  dark: boolean;
  c: Scheme;
  x: Extra;
}

export const lightTheme: Theme = { dark: false, c: light, x: lightExtra };
export const darkTheme: Theme = { dark: true, c: dark, x: darkExtra };

export const ThemeContext = createContext<Theme>(lightTheme);
export const useTheme = () => useContext(ThemeContext);

export const ModeColors: Record<TransitMode, string> = {
  BUS: '#12A150',
  TRAIN: '#1F4E9E',
  LIGHT_RAIL: '#E5484D',
  METRO: '#8E4EC6',
  CABLE_CAR: '#0E9AA7',
  FERRY: '#0091FF',
  WALK: '#6B7280',
  OTHER: '#6B7280',
  CAR: '#6B7280',
};

/** Material 3 type scale, with the Kotlin app's weights. */
export const type = {
  headlineSmall: { fontSize: 24, lineHeight: 32, fontWeight: '600', letterSpacing: -0.2 },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.2 },
  titleMedium: { fontSize: 16, lineHeight: 24, fontWeight: '600', letterSpacing: 0.15 },
  titleSmall: { fontSize: 14, lineHeight: 20, fontWeight: '600', letterSpacing: 0.1 },
  bodyLarge: { fontSize: 16, lineHeight: 24, letterSpacing: 0.5 },
  bodyMedium: { fontSize: 14, lineHeight: 20, letterSpacing: 0.25 },
  bodySmall: { fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  labelLarge: { fontSize: 14, lineHeight: 20, fontWeight: '600', letterSpacing: 0.1 },
  labelMedium: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0.5 },
  labelSmall: { fontSize: 11, lineHeight: 16, fontWeight: '500', letterSpacing: 0.5 },
} satisfies Record<string, TextStyle>;

/** Tabular figures, so times don't jiggle as they tick. */
export const numeric: TextStyle = { fontVariant: ['tabular-nums'] };

// ---- Colour helpers ----------------------------------------------------------------

/** ARGB int → "#RRGGBB". */
export const hex = (argb: number) => `#${(argb >>> 0).toString(16).padStart(8, '0').slice(2).toUpperCase()}`;

function rgb(color: string): [number, number, number] {
  const h = color.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(Math.min(Math.max(v, 0), 255)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** "#RRGGBB" with [alpha] (0..1). */
export function alpha(color: string, a: number): string {
  const [r, g, b] = rgb(color);
  return `rgba(${r},${g},${b},${a})`;
}

/** Mix of [a] and [b]: 0 is [a], 1 is [b]. */
export function lerpColor(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

const argbOf = (color: string) => 0xff000000 + parseInt(color.replace('#', '').slice(0, 6), 16);

function luminance(color: string): number {
  return Operators.luminance(argbOf(color));
}

/** Black or white, whichever reads better on [bg]. */
export const contentColorOn = (bg: string) => (Operators.prefersDarkText(argbOf(bg)) ? '#111111' : '#FFFFFF');

/**
 * [color] used as text/icon on [t]'s surface: light brand colours (yellow, orange) are
 * darkened in light mode and dark ones (navy) lightened in dark mode until they read at 3:1.
 */
export function readableAccent(color: string, t: Theme): string {
  const bg = luminance(t.c.surface) + 0.05;
  const ratio = (c: string) => {
    const a = luminance(c) + 0.05;
    return Math.max(a, bg) / Math.min(a, bg);
  };
  let c = color;
  for (let step = 1; ratio(c) < 3 && step <= 10; step++) c = lerpColor(color, t.c.onSurface, step / 10);
  return c;
}

/**
 * Colour of a line: the feed's route_color if it has a meaningful one, else the operator's
 * brand colour (Egged green, Dan blue, Metropoline orange…), else the mode colour.
 */
export function lineColorOf(mode: TransitMode, routeColor: number | null | undefined, agencyId?: string | null, agencyName?: string | null): string {
  if (routeColor != null) {
    const h = hex(routeColor);
    if (h !== '#FFFFFF' && h !== '#000000') return h;
  }
  const op = Operators.colorOf(agencyId, agencyName);
  return op != null ? hex(op) : ModeColors[mode];
}
