import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeoMath } from '../data/geo';
import { type GeoPoint, type Itinerary, firstTransit } from '../data/models';
import type { Instant } from '../data/time';

/** Where a search went from and to; the routes themselves are stored apart (see [SavedRoutes]). */
export interface SavedSearch {
  id: string;
  from: GeoPoint;
  to: GeoPoint;
  /** Searched from the phone's position, which moves a little between searches. */
  fromHere: boolean;
  savedAt: Instant;
}

const INDEX_KEY = 'saved_routes_v1';
const routesKey = (id: string) => `saved_routes_v1/${id}`;
/** Searches kept. */
export const MAX_SEARCHES = 5;
/** Routes kept per search: one is ~60 KB (mostly its map line), and Android caps a stored value at 2 MB. */
export const MAX_ROUTES = 6;

type Query = Omit<SavedSearch, 'id' | 'savedAt'>;

const sameTrip = (s: Query, q: Query) =>
  s.fromHere === q.fromHere && GeoMath.distance(s.from, q.from) <= (q.fromHere ? 1000 : 150) && GeoMath.distance(s.to, q.to) <= 150;

/** Still catchable: its first ride (or, without one, its start) is ahead. */
const ahead = (i: Itinerary, now: Instant) => (firstTransit(i)?.start ?? i.start) > now;

/**
 * The last route searches and their results, to show when a search fails (no connection,
 * underground, the planner down). Kept apart from the user's data: losing it costs nothing.
 */
export const SavedRoutes = {
  /** The index with [s] in front, replacing an earlier search for the same trip; and the ids that dropped out. */
  add(index: SavedSearch[], s: SavedSearch): { index: SavedSearch[]; dropped: string[] } {
    const kept = [s, ...index.filter((x) => !sameTrip(x, s))].slice(0, MAX_SEARCHES);
    return { index: kept, dropped: index.filter((x) => !kept.includes(x)).map((x) => x.id) };
  },

  find: (index: SavedSearch[], q: Query): SavedSearch | null => index.find((s) => sameTrip(s, q)) ?? null,

  stillAhead: (routes: Itinerary[], now: Instant) => routes.filter((i) => ahead(i, now)),

  async save(q: Query, routes: Itinerary[], now: Instant): Promise<void> {
    try {
      const s: SavedSearch = { ...q, id: String(now), savedAt: now };
      const { index, dropped } = SavedRoutes.add(await loadIndex(), s);
      await AsyncStorage.setItem(routesKey(s.id), JSON.stringify(routes.slice(0, MAX_ROUTES)));
      await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
      if (dropped.length) await AsyncStorage.multiRemove(dropped.map(routesKey));
    } catch {
      // Only a convenience: a failed save just means nothing to fall back on.
    }
  },

  /** The saved routes for this trip, or null when there are none. */
  async load(q: Query): Promise<{ savedAt: Instant; routes: Itinerary[] } | null> {
    try {
      const s = SavedRoutes.find(await loadIndex(), q);
      const json = s ? await AsyncStorage.getItem(routesKey(s.id)) : null;
      const routes = json ? (JSON.parse(json) as Itinerary[]) : null;
      return s && Array.isArray(routes) ? { savedAt: s.savedAt, routes } : null;
    } catch {
      return null;
    }
  },
};

async function loadIndex(): Promise<SavedSearch[]> {
  const json = await AsyncStorage.getItem(INDEX_KEY);
  let v: unknown = [];
  try {
    v = json ? JSON.parse(json) : [];
  } catch {
    // Unreadable: start over rather than never saving again.
  }
  return Array.isArray(v) ? (v as SavedSearch[]) : [];
}
