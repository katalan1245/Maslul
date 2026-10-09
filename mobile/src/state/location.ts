import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';
import type { GeoPoint } from '../data/models';

/** Used when location is unavailable: Tel Aviv Savidor Center. */
export const DEFAULT_LOCATION: GeoPoint = { lat: 32.084, lon: 34.798 };

const toPoint = (l: Location.LocationObject): GeoPoint => ({ lat: l.coords.latitude, lon: l.coords.longitude });

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(null);
      },
    );
  });
}

/** The phone's position (LocationRepo in Kotlin). */
class LocationRepo {
  private lastFix: GeoPoint | null = null;
  private readonly listeners = new Set<() => void>();

  /** Most recent known position, or null before the first fix. */
  get last(): GeoPoint | null {
    return this.lastFix;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  private setLast(p: GeoPoint) {
    this.lastFix = p;
    this.listeners.forEach((l) => l());
  }

  async hasPermission(): Promise<boolean> {
    try {
      return (await Location.getForegroundPermissionsAsync()).granted;
    } catch {
      return false;
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      return (await Location.requestForegroundPermissionsAsync()).granted;
    } catch {
      return false;
    }
  }

  /** A fresh fix within 6 s, else the last known one; null without permission. */
  async current(): Promise<GeoPoint | null> {
    if (!(await this.hasPermission())) return null;
    const fresh = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), 6000);
    const result = fresh ? toPoint(fresh) : await Location.getLastKnownPositionAsync().then((l) => (l ? toPoint(l) : null), () => null);
    if (result) this.setLast(result);
    return result;
  }

  /** Follows the position every [intervalMs] while subscribed; returns the unsubscribe. */
  async watch(intervalMs: number, onFix: (p: GeoPoint) => void): Promise<() => void> {
    if (!(await this.hasPermission())) return () => {};
    const sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: intervalMs, distanceInterval: 0 },
      (l) => {
        const p = toPoint(l);
        this.setLast(p);
        onFix(p);
      },
    );
    return () => sub.remove();
  }

  /** Records a fix that came from elsewhere (the live-trip task). */
  report(p: GeoPoint) {
    this.setLast(p);
  }
}

export const location = new LocationRepo();

/** The last known position, re-rendering when it changes. */
export function useLastLocation(): GeoPoint | null {
  return useSyncExternalStore(location.subscribe, () => location.last);
}
