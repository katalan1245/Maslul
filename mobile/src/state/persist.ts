import { EMPTY_USER_DATA, type UserData, loadUserData, migrated, readUserData } from '../data/userStore';

/** Where the app keeps UserData: the same key the Kotlin app used, in AsyncStorage. */
export const STORE_KEY = 'store_v1';
/** Set once the Kotlin app's data has been looked at, so it's only moved over once. */
export const MIGRATED_KEY = 'legacy_migrated_v1';

export interface KeyValue {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

/** Reads the Kotlin app's store (SharedPreferences "maslul" / "store_v1"); null when there is none. */
export type LegacyReader = () => Promise<string | null>;

export type LoadResult = { data: UserData; source: 'store' | 'legacy' | 'empty' };

/**
 * Loads the user's data. On the first launch after replacing the Kotlin app, its store is read
 * once, migrated and saved here. The old SharedPreferences are left as they were, so a failed
 * or partial migration loses nothing; if the legacy store can't be read at all (no native
 * module), it is tried again next launch.
 */
export async function loadData(kv: KeyValue, readLegacy: LegacyReader): Promise<LoadResult> {
  const json = await kv.getItem(STORE_KEY);
  if (json != null) return { data: loadUserData(json), source: 'store' };
  if ((await kv.getItem(MIGRATED_KEY)) != null) return { data: EMPTY_USER_DATA, source: 'empty' };
  let legacy: string | null;
  try {
    legacy = await readLegacy();
  } catch {
    return { data: EMPTY_USER_DATA, source: 'empty' };
  }
  const old = legacy != null ? readUserData(legacy) : null;
  if (old != null) {
    const data = migrated(old);
    await kv.setItem(STORE_KEY, JSON.stringify(data));
    await kv.setItem(MIGRATED_KEY, '1');
    return { data, source: 'legacy' };
  }
  // Nothing (readable) to move over; the Kotlin app would have started empty too.
  await kv.setItem(MIGRATED_KEY, '1');
  return { data: EMPTY_USER_DATA, source: 'empty' };
}

export const saveData = (kv: KeyValue, d: UserData) => kv.setItem(STORE_KEY, JSON.stringify(d));
