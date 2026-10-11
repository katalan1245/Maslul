import * as Location from 'expo-location';
import { useSyncExternalStore } from 'react';
import { GeoMath } from '../data/geo';
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

/** Which way you're moving, from recent location fixes. */
export const Motion = {
  KEEP_MS: 3 * 60_000,
  /** An older fix than this says nothing about now. */
  FRESH_MS: 60_000,
  /** A fix's own bearing counts from this speed: below it, it's mostly noise. */
  MOVING_MPS: 2,
  /**
   * Fixes this far apart (and twice their uncertainty, at least walking speed) show where
   * you're heading, when the last one has no bearing.
   */
  APART_M: 80,
  SINCE_MS: 2 * 60_000,
  /** Faster than any train here (160 km/h): a fix that jumped, not movement. */
  MAX_MPS: 50,

  /**
   * Degrees from north, or null: the latest fix's own bearing when it's moving, else from an
   * earlier fix far enough back (a train stopped at a station still came from somewhere).
   * Fixes jumping about while you stand still are too slow apart to count, and one that jumped
   * far (a cell tower's position underground) too fast.
   */
  heading(fixes: Fix[], nowMs: number): number | null {
    const last = fixes[fixes.length - 1];
    if (last == null || nowMs - last.atMs > Motion.FRESH_MS) return null;
    if (last.bearing != null && (last.speedMps ?? 0) >= Motion.MOVING_MPS) return last.bearing;
    for (let i = fixes.length - 1; i >= 0; i--) {
      const f = fixes[i];
      if (last.atMs - f.atMs > Motion.SINCE_MS) break;
      const d = GeoMath.distance(f.point, last.point);
      const sec = (last.atMs - f.atMs) / 1000;
      const fuzz = 2 * ((f.accuracyM ?? 0) + (last.accuracyM ?? 0));
      if (d >= Math.max(Motion.APART_M, fuzz) && sec > 0 && d / sec >= 1.2 && d / sec <= Motion.MAX_MPS) return GeoMath.bearing(f.point, last.point);
    }
    return null;
  },
};

export interface Fix {
  point: GeoPoint;
  atMs: number;
  bearing: number | null;
  speedMps: number | null;
  accuracyM?: number | null;
}

/** expo-location gives -1 (iOS) or null for a value it doesn't have. */
const known = (v: number | null | undefined) => (v != null && v >= 0 ? v : null);

/** The phone's position (LocationRepo in Kotlin). */
class LocationRepo {
  private lastFix: GeoPoint | null = null;
  /** Recent fixes, oldest first, for the way you're moving. */
  private fixes: Fix[] = [];

  private record(l: Location.LocationObject) {
    const f: Fix = {
      point: toPoint(l),
      atMs: l.timestamp,
      bearing: known(l.coords.heading),
      speedMps: known(l.coords.speed),
      accuracyM: known(l.coords.accuracy),
    };
    const prev = this.fixes[this.fixes.length - 1];
    if (prev != null && prev.atMs >= f.atMs) return;
    this.fixes.push(f);
    while (this.fixes.length > 2 && f.atMs - this.fixes[0].atMs > Motion.KEEP_MS) this.fixes.shift();
  }

  /** Which way you're moving, in degrees from north; null when still or not known (see [Motion.heading]). */
  heading(): number | null {
    return Motion.heading(this.fixes, Date.now());
  }

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
    if (fresh) this.record(fresh);
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
        this.record(l);
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
