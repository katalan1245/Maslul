import { useSyncExternalStore } from 'react';
import type { LineRoute, Place } from '../data/models';
import {
  EMPTY_USER_DATA,
  Edits,
  type FavoriteIcon,
  type SavedTrip,
  type Settings,
  type Shuttle,
  type UserData,
  sameLine,
  withFavorite,
  withFavoriteMoved,
  withoutFavorite,
} from '../data/userStore';
import { type KeyValue, type LegacyReader, loadData, saveData } from './persist';

/** Small persistent store for the user's places, favourites and settings (UserStore in Kotlin). */
export class UserStore {
  private data: UserData = EMPTY_USER_DATA;
  private readonly listeners = new Set<() => void>();
  private kv: KeyValue | null = null;
  private saving: Promise<void> = Promise.resolve();

  /** Loads saved data (moving the Kotlin app's over on the first launch). */
  async load(kv: KeyValue, readLegacy: LegacyReader) {
    this.kv = kv;
    const r = await loadData(kv, readLegacy);
    this.set(r.data);
    return r.source;
  }

  get value(): UserData {
    return this.data;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  private set(d: UserData) {
    this.data = d;
    this.listeners.forEach((l) => l());
  }

  private edit(f: (d: UserData) => UserData) {
    const next = f(this.data);
    if (next === this.data) return;
    this.set(next);
    const kv = this.kv;
    // In order, so the last edit is the one that stays on disk.
    if (kv) this.saving = this.saving.then(() => saveData(kv, next)).catch(() => undefined);
  }

  /** Resolves once everything edited so far is on disk. */
  flush = () => this.saving;

  setHome = (p: Place | null) => this.edit((d) => Edits.setHome(d, p));
  setWork = (p: Place | null) => this.edit((d) => Edits.setWork(d, p));
  addRecent = (p: Place) => this.edit((d) => Edits.addRecent(d, p));
  removeRecent = (p: Place) => this.edit((d) => Edits.removeRecent(d, p));
  saveFavorite = (p: Place, label: string, icon: FavoriteIcon) => this.edit((d) => withFavorite(d, p, label, icon));
  removeFavorite = (key: string) => this.edit((d) => withoutFavorite(d, key));
  moveFavorite = (key: string, delta: number) => this.edit((d) => withFavoriteMoved(d, key, delta));
  isFavoriteLine = (r: LineRoute) => this.data.favoriteLines.some((x) => sameLine(x, r));
  toggleFavoriteLine = (r: LineRoute) => this.edit((d) => Edits.toggleFavoriteLine(d, r));
  toggleFavoriteStop = (p: Place) => this.edit((d) => Edits.toggleFavoriteStop(d, p));
  toggleSavedTrip = (t: SavedTrip) => this.edit((d) => Edits.toggleSavedTrip(d, t));
  updateSettings = (f: (s: Settings) => Settings) => this.edit((d) => Edits.updateSettings(d, f));
  saveShuttle = (s: Shuttle) => this.edit((d) => Edits.saveShuttle(d, s));
  removeShuttle = (id: string) => this.edit((d) => Edits.removeShuttle(d, id));
}

export const store = new UserStore();

/** The user's data, re-rendering on every change. */
export function useUserData(): UserData {
  return useSyncExternalStore(store.subscribe, () => store.value);
}
