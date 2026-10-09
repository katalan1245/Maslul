import {
  type LineRoute,
  type Place,
  PLACE_KINDS,
  type PlaceKind,
  TRANSIT_MODES,
  type TransitMode,
  placeKey,
} from './models';
import { DEFAULT_MAX_WALK_MINUTES } from './transitousApi';
import { distinctBy } from './util';

export { DEFAULT_MAX_WALK_MINUTES };

export const THEME_MODES = ['SYSTEM', 'LIGHT', 'DARK'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const WALK_SPEEDS = {
  SLOW: { mps: 1.0, label: 'Relaxed' },
  NORMAL: { mps: 1.3, label: 'Normal' },
  FAST: { mps: 1.6, label: 'Brisk' },
} as const;
export type WalkSpeed = keyof typeof WALK_SPEEDS;

/**
 * How much to favour trains and light rail over buses (some riders get motion-sick on buses).
 * Each minute on a bus counts as [busMinuteCost] extra minutes when ranking, plus [busLegSec]
 * per bus boarded.
 */
export const RAIL_PREFERENCES = {
  NONE: { label: 'No', busMinuteCost: 0.0, busLegSec: 0.0 },
  PREFER: { label: 'Yes', busMinuteCost: 0.35, busLegSec: 240.0 },
  STRONG: { label: 'Strongly', busMinuteCost: 0.75, busLegSec: 450.0 },
} as const;
export type RailPreference = keyof typeof RAIL_PREFERENCES;

export const FAVORITE_ICONS = [
  'STAR', 'HEART', 'HOME', 'SCHOOL', 'GYM', 'SHOPPING', 'RESTAURANT', 'CAFE', 'HEALTH', 'PARK', 'POOL', 'SPORTS',
] as const;
/** Icon a user can pick for a favourite place. */
export type FavoriteIcon = (typeof FAVORITE_ICONS)[number];

export interface Settings {
  theme: ThemeMode;
  walkSpeed: WalkSpeed;
  maxWalkMinutes: number;
  modes: TransitMode[];
  wheelchair: boolean;
  railPreference: RailPreference;
  reminderMinutes: number;
  /** Offers planning around a ride (טרמפ) for the first part of a trip. */
  rides: boolean;
  /** Offers planning from the bus or train you're on. */
  onBoard: boolean;
}

export const DEFAULT_MODES: TransitMode[] = ['BUS', 'TRAIN', 'LIGHT_RAIL', 'METRO', 'CABLE_CAR', 'FERRY'];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'SYSTEM',
  walkSpeed: 'NORMAL',
  maxWalkMinutes: DEFAULT_MAX_WALK_MINUTES,
  modes: DEFAULT_MODES,
  wheelchair: false,
  railPreference: 'NONE',
  reminderMinutes: 5,
  rides: false,
  onBoard: false,
};

export interface SavedTrip {
  from: Place;
  to: Place;
  label?: string;
}

/** A saved place with a user-chosen label, e.g. "Gym" or "Mom". */
export interface FavoritePlace {
  place: Place;
  label: string;
  icon: FavoriteIcon;
}

export const favoriteKey = (f: FavoritePlace) => placeKey(f.place);

/**
 * A shuttle with a fixed timetable that the open data doesn't know about, e.g. a company bus
 * from the office to a train station. Trip planning offers it like any other ride.
 */
export interface Shuttle {
  id: string;
  name: string;
  from: Place;
  to: Place;
  /** Departure times from [from], in minutes after midnight, ascending. */
  times: number[];
  rideMinutes: number;
  /** Days it runs, as ISO day-of-week values (1 = Monday … 7 = Sunday). */
  days: number[];
}

/** Sunday to Thursday. */
export const WORK_WEEK = [7, 1, 2, 3, 4];

export interface UserData {
  home: Place | null;
  work: Place | null;
  /** Legacy unlabeled favourites (before labels existed); migrated into [favoritePlaces] on load. */
  favorites: Place[];
  favoritePlaces: FavoritePlace[];
  recents: Place[];
  favoriteLines: LineRoute[];
  savedTrips: SavedTrip[];
  favoriteStops: Place[];
  shuttles: Shuttle[];
  settings: Settings;
}

export const EMPTY_USER_DATA: UserData = {
  home: null,
  work: null,
  favorites: [],
  favoritePlaces: [],
  recents: [],
  favoriteLines: [],
  savedTrips: [],
  favoriteStops: [],
  shuttles: [],
  settings: DEFAULT_SETTINGS,
};

// ---- Reading stored data ----------------------------------------------------------------
//
// The Kotlin app stored UserData with kotlinx.serialization: fields equal to their default are
// left out, nulls are left out (explicitNulls = false), enums are their names and sets are
// arrays. It read with ignoreUnknownKeys, isLenient and coerceInputValues, so a null or an
// unknown enum name in a field with a default meant the default. This reader applies the
// same defaults. Where kotlinx would have failed the whole load (a required field missing), it
// drops just that entry instead, so one odd record can't lose everything else.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => v != null && typeof v === 'object' && !Array.isArray(v);

/** A number, or a numeric string (lenient mode). */
function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function int(v: unknown): number | null {
  const n = num(v);
  return n != null && Number.isInteger(n) ? n : null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function bool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return null;
}

function oneOf<T extends string>(values: readonly T[], v: unknown): T | null {
  return typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : null;
}

/** Elements that decode; the others are dropped. */
function list<T>(v: unknown, f: (x: unknown) => T | null): T[] {
  return Array.isArray(v) ? v.map(f).filter((x): x is T => x != null) : [];
}

export function readPlace(v: unknown): Place | null {
  if (!isObj(v)) return null;
  const name = str(v.name);
  const lat = num(v.lat);
  const lon = num(v.lon);
  if (name == null || lat == null || lon == null) return null;
  const p: Place = { name, lat, lon, kind: oneOf<PlaceKind>(PLACE_KINDS, v.kind) ?? 'POI' };
  const subtitle = str(v.subtitle);
  const stopId = str(v.stopId);
  const tripId = str(v.tripId);
  if (subtitle != null) p.subtitle = subtitle;
  if (stopId != null) p.stopId = stopId;
  if (tripId != null) p.tripId = tripId;
  return p;
}

function readFavorite(v: unknown): FavoritePlace | null {
  if (!isObj(v)) return null;
  const place = readPlace(v.place);
  const label = str(v.label);
  if (place == null || label == null) return null;
  return { place, label, icon: oneOf(FAVORITE_ICONS, v.icon) ?? 'STAR' };
}

function readLineRoute(v: unknown): LineRoute | null {
  if (!isObj(v)) return null;
  const r = {
    gtfsRouteId: int(v.gtfsRouteId),
    lineRef: int(v.lineRef),
    operatorRef: int(v.operatorRef),
    shortName: str(v.shortName),
    longName: str(v.longName),
    mkt: str(v.mkt),
    direction: str(v.direction),
    alternative: str(v.alternative),
    agency: str(v.agency),
    mode: oneOf(TRANSIT_MODES, v.mode),
    date: str(v.date),
  };
  return Object.values(r).every((x) => x != null) ? (r as LineRoute) : null;
}

function readSavedTrip(v: unknown): SavedTrip | null {
  if (!isObj(v)) return null;
  const from = readPlace(v.from);
  const to = readPlace(v.to);
  if (from == null || to == null) return null;
  const label = str(v.label);
  return label != null ? { from, to, label } : { from, to };
}

function readShuttle(v: unknown): Shuttle | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const name = str(v.name);
  const from = readPlace(v.from);
  const to = readPlace(v.to);
  if (id == null || name == null || from == null || to == null || !Array.isArray(v.times)) return null;
  return {
    id,
    name,
    from,
    to,
    times: list(v.times, int),
    rideMinutes: int(v.rideMinutes) ?? 20,
    days: Array.isArray(v.days) ? distinctBy(list(v.days, int), (d) => d) : WORK_WEEK,
  };
}

export function readSettings(v: unknown): Settings {
  if (!isObj(v)) return DEFAULT_SETTINGS;
  const d = DEFAULT_SETTINGS;
  return {
    theme: oneOf(THEME_MODES, v.theme) ?? d.theme,
    walkSpeed: oneOf(Object.keys(WALK_SPEEDS) as WalkSpeed[], v.walkSpeed) ?? d.walkSpeed,
    maxWalkMinutes: int(v.maxWalkMinutes) ?? d.maxWalkMinutes,
    modes: Array.isArray(v.modes) ? distinctBy(list(v.modes, (m) => oneOf(TRANSIT_MODES, m)), (m) => m) : d.modes,
    wheelchair: bool(v.wheelchair) ?? d.wheelchair,
    railPreference: oneOf(Object.keys(RAIL_PREFERENCES) as RailPreference[], v.railPreference) ?? d.railPreference,
    reminderMinutes: int(v.reminderMinutes) ?? d.reminderMinutes,
    rides: bool(v.rides) ?? d.rides,
    onBoard: bool(v.onBoard) ?? d.onBoard,
  };
}

/** Reads UserData written by the Kotlin app (or by this one); null when [json] isn't a JSON object. */
export function readUserData(json: string): UserData | null {
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObj(v)) return null;
  return {
    home: readPlace(v.home),
    work: readPlace(v.work),
    favorites: list(v.favorites, readPlace),
    favoritePlaces: list(v.favoritePlaces, readFavorite),
    recents: list(v.recents, readPlace),
    favoriteLines: list(v.favoriteLines, readLineRoute),
    savedTrips: list(v.savedTrips, readSavedTrip),
    favoriteStops: list(v.favoriteStops, readPlace),
    shuttles: list(v.shuttles, readShuttle),
    settings: readSettings(v.settings),
  };
}

/** Reads and migrates the store, as the Kotlin app's UserStore.load() did; empty data when unreadable. */
export function loadUserData(json: string | null | undefined): UserData {
  const d = json != null ? readUserData(json) : null;
  return d != null ? migrated(d) : EMPTY_USER_DATA;
}

// ---- Changes --------------------------------------------------------------------------

/** Moves legacy unlabeled favourites into [UserData.favoritePlaces], labelled with the place name. */
export function migrated(d: UserData): UserData {
  if (d.favorites.length === 0) return d;
  const known = new Set(d.favoritePlaces.map(favoriteKey));
  const moved = distinctBy(
    d.favorites.filter((p) => !known.has(placeKey(p))),
    placeKey,
  ).map((p): FavoritePlace => ({ place: p, label: p.name, icon: 'STAR' }));
  return { ...d, favorites: [], favoritePlaces: [...d.favoritePlaces, ...moved] };
}

export const favoriteFor = (d: UserData, p: Place): FavoritePlace | null =>
  d.favoritePlaces.find((f) => favoriteKey(f) === placeKey(p)) ?? null;

/** Adds [p] as a favourite, or updates its label and icon if it is already one (keeping its position). */
export function withFavorite(d: UserData, p: Place, label: string, icon: FavoriteIcon): UserData {
  const clean = label.trim() || p.name;
  const fav: FavoritePlace = { place: p, label: clean, icon };
  const i = d.favoritePlaces.findIndex((f) => favoriteKey(f) === placeKey(p));
  return {
    ...d,
    favoritePlaces:
      i < 0
        ? [...d.favoritePlaces, fav]
        : d.favoritePlaces.map((f, k) => (k === i ? { ...fav, place: d.favoritePlaces[i].place } : f)),
  };
}

export const withoutFavorite = (d: UserData, key: string): UserData => ({
  ...d,
  favoritePlaces: d.favoritePlaces.filter((f) => favoriteKey(f) !== key),
});

/** Moves the favourite with [key] by [delta] positions, clamped to the list bounds. */
export function withFavoriteMoved(d: UserData, key: string, delta: number): UserData {
  const i = d.favoritePlaces.findIndex((f) => favoriteKey(f) === key);
  if (i < 0) return d;
  const j = Math.min(Math.max(i + delta, 0), d.favoritePlaces.length - 1);
  if (i === j) return d;
  const list2 = [...d.favoritePlaces];
  list2.splice(j, 0, list2.splice(i, 1)[0]);
  return { ...d, favoritePlaces: list2 };
}

export const sameLine = (a: LineRoute, b: LineRoute) => a.operatorRef === b.operatorRef && a.mkt === b.mkt;
export const sameTripEnds = (a: SavedTrip, b: SavedTrip) => placeKey(a.from) === placeKey(b.from) && placeKey(a.to) === placeKey(b.to);

/** The edits the app makes to UserData, as pure functions (UserStore's methods in Kotlin). */
export const Edits = {
  setHome: (d: UserData, p: Place | null): UserData => ({ ...d, home: p ? { ...p, kind: 'HOME' } : null }),
  setWork: (d: UserData, p: Place | null): UserData => ({ ...d, work: p ? { ...p, kind: 'WORK' } : null }),
  addRecent(d: UserData, p: Place): UserData {
    if (p.kind === 'CURRENT_LOCATION' || p.kind === 'ON_BOARD') return d;
    return { ...d, recents: [p, ...d.recents.filter((r) => placeKey(r) !== placeKey(p))].slice(0, 12) };
  },
  removeRecent: (d: UserData, p: Place): UserData => ({ ...d, recents: d.recents.filter((r) => placeKey(r) !== placeKey(p)) }),
  toggleFavoriteLine(d: UserData, r: LineRoute): UserData {
    const exists = d.favoriteLines.some((x) => sameLine(x, r));
    return { ...d, favoriteLines: exists ? d.favoriteLines.filter((x) => !sameLine(x, r)) : [...d.favoriteLines, r] };
  },
  toggleFavoriteStop(d: UserData, p: Place): UserData {
    const exists = d.favoriteStops.some((s) => s.stopId === p.stopId);
    return { ...d, favoriteStops: exists ? d.favoriteStops.filter((s) => s.stopId !== p.stopId) : [...d.favoriteStops, p] };
  },
  toggleSavedTrip(d: UserData, t: SavedTrip): UserData {
    const exists = d.savedTrips.some((x) => sameTripEnds(x, t));
    return { ...d, savedTrips: exists ? d.savedTrips.filter((x) => !sameTripEnds(x, t)) : [...d.savedTrips, t] };
  },
  updateSettings: (d: UserData, f: (s: Settings) => Settings): UserData => ({ ...d, settings: f(d.settings) }),
  /** Adds [s], or replaces the shuttle with its id. */
  saveShuttle(d: UserData, s: Shuttle): UserData {
    const i = d.shuttles.findIndex((x) => x.id === s.id);
    return { ...d, shuttles: i < 0 ? [...d.shuttles, s] : d.shuttles.map((x, k) => (k === i ? s : x)) };
  },
  removeShuttle: (d: UserData, id: string): UserData => ({ ...d, shuttles: d.shuttles.filter((x) => x.id !== id) }),
};
