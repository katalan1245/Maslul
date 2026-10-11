import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useSyncExternalStore } from 'react';
import { Combine } from '../data/combine';
import type { LiveCall } from '../data/eta';
import { type GeoPoint, type Itinerary, isTransit } from '../data/models';
import { type Instant, nowSec } from '../data/time';
import { type Lang, S, lang, languageSet, setLanguage } from '../i18n';
import MaslulNative from '../../modules/maslul-native/src/MaslulNativeModule';
import { location } from '../state/location';
import { repo } from '../state/services';
import { store } from '../state/store';
import { DEFAULT_SETTINGS } from '../data/userStore';
import { BRAND } from '../ui/theme';
import { alert, canNotify, dismissAlert, ensureChannels } from './notifications';
import { type GuideState, TripGuide, rideGone } from './tripGuide';

export const TRIP_TASK = 'maslul-live-trip';
/** Opened by the notification's "End trip" action. */
export const END_TRIP_URL = 'maslul://end-trip';
const SESSION_KEY = 'live_trip_v1';

/** The trip being guided, shared with the UI. */
export interface TripSession {
  itinerary: Itinerary;
  destination: string;
  state: GuideState | null;
}

/**
 * Live directions (LiveTripService in Kotlin): follows location through a foreground location
 * service, keeps the ongoing notification on the current step, and alerts when the ride is
 * arriving and before your stop. Each location update (every ~4 s) is a tick; while the app is
 * open a timer ticks too.
 */
class ActiveTrip {
  private current: TripSession | null = null;
  private readonly listeners = new Set<() => void>();
  private guide: TripGuide | null = null;
  private live = new Map<number, LiveCall>();
  private lastLive = 0;
  private fired = new Set<string>();
  private pos: GeoPoint | null = null;
  private finishedAt: number | null = null;
  private ticking = false;
  /** Counts ended trips: a restore that was reading the saved session while one ended must not bring it back. */
  private ended = 0;
  private ending: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  get session(): TripSession | null {
    return this.current;
  }

  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => void this.listeners.delete(l);
  };

  private set(s: TripSession | null) {
    this.current = s;
    this.listeners.forEach((l) => l());
  }

  private begin(itinerary: Itinerary, destination: string, state: GuideState | null) {
    this.guide = new TripGuide(itinerary, destination);
    this.live = new Map();
    this.lastLive = 0;
    this.fired = new Set();
    this.finishedAt = null;
    this.set({ itinerary, destination, state });
    this.timer ??= setInterval(() => void this.tick(null), 5000);
  }

  async start(itinerary: Itinerary, destination: string) {
    await ensureChannels();
    // A position left from an earlier trip would put the guide where that trip ended.
    this.pos = null;
    this.begin(itinerary, destination, null);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ itinerary, destination, lang: lang() }));
    try {
      await Location.startLocationUpdatesAsync(TRIP_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 4000,
        distanceInterval: 0,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.OtherNavigation,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: S.notify.starting,
          notificationBody: destination,
          notificationColor: BRAND,
        },
      });
    } catch {
      // Without location (denied, or no foreground service) the guide still follows the timetable.
    }
    await this.tick(null);
  }

  async stop() {
    this.ended++;
    const run = this.end();
    this.ending = run;
    await run;
    if (this.ending === run) this.ending = null;
  }

  private async end() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.guide = null;
    this.pos = null;
    this.set(null);
    await dismissAlert();
    await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
    if (await Location.hasStartedLocationUpdatesAsync(TRIP_TASK).catch(() => false)) {
      await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
    }
  }

  /** After the app (or just its JS) restarted: picks up a trip the location service is still following. */
  async restore() {
    await this.ending;
    if (this.current) return;
    const ended = this.ended;
    const json = await AsyncStorage.getItem(SESSION_KEY).catch(() => null);
    const running = await Location.hasStartedLocationUpdatesAsync(TRIP_TASK).catch(() => false);
    if (this.current || ended !== this.ended) return;
    if (json == null || !running) {
      if (json != null) await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
      if (running) await Location.stopLocationUpdatesAsync(TRIP_TASK).catch(() => {});
      return;
    }
    const s = JSON.parse(json) as { itinerary: Itinerary; destination: string; lang?: Lang };
    // Started headless for a location update, the app hasn't read the settings: the trip's language holds.
    if (s.lang && !languageSet()) setLanguage(s.lang);
    this.begin(s.itinerary, s.destination, null);
  }

  /** A new position from the location service. */
  async onLocation(p: GeoPoint) {
    this.pos = p;
    location.report(p);
    await this.restore();
    if (!this.current) return;
    await this.tick(p);
  }

  private async tick(pos: GeoPoint | null) {
    const s = this.current;
    const guide = this.guide;
    if (!s || !guide || this.ticking) return;
    this.ticking = true;
    try {
      const now = nowSec();
      if (now > this.lastLive + 30) {
        this.lastLive = now;
        await Promise.all(
          s.itinerary.legs.map(async (leg, i) => {
            if (!isTransit(leg.mode) || leg.end <= now) return;
            const c = await repo.legLive(leg, now).catch(() => null);
            if (c) this.live.set(i, c);
          }),
        );
      }
      if (this.current !== s) return;
      const next = await this.nextIfPassed(s, now);
      if (this.current !== s) return;
      const state = (this.guide ?? guide).update(pos ?? this.pos, now, this.live);
      this.set({ ...next, state });
      await MaslulNative?.updateTripNotification(TRIP_TASK, state.title, state.text, state.progress, END_TRIP_URL, S.notify.endTrip).catch(() => false);
      if (state.alert != null && state.alertKey != null && !this.fired.has(state.alertKey)) {
        this.fired.add(state.alertKey);
        if (await canNotify(false)) await alert(state.title, state.text).catch(() => {});
      }
      if (state.finished) {
        this.finishedAt ??= now;
        if (now - this.finishedAt >= 60) await this.stop();
      } else if (now > s.itinerary.end + 3600) {
        // Give up an hour after the planned arrival.
        await this.stop();
      }
    } finally {
      this.ticking = false;
    }
  }

  /**
   * A ride you were still on your way to went by without you: the trip takes the next one of
   * that step that can still be caught, rather than saying it's arriving, and the rides after
   * it that it no longer gets you to in time too. When the plan knows no later one, looks it up.
   */
  private async nextIfPassed(s: TripSession, now: Instant): Promise<TripSession> {
    // While on board, the bus has passed the boarding stop with you on it.
    const at = s.state?.legIndex ?? 0;
    const noLive = () => null;
    let itinerary = s.itinerary;
    for (let i = at + 1; i < itinerary.legs.length; i++) {
      const leg = itinerary.legs[i];
      if (!isTransit(leg.mode)) continue;
      const missed = itinerary !== s.itinerary && !Combine.catchable(leg, null, Combine.reachBy(itinerary, i, now, false, noLive));
      if (!missed && !rideGone(leg, this.live.get(i), now)) continue;
      const by = Combine.reachBy(itinerary, i, now, false, noLive);
      const modes = (store.value.settings ?? DEFAULT_SETTINGS).modes;
      const option =
        Combine.catchableOptions(itinerary, i, now, false, noLive)[0] ??
        (await repo.ridesAfter(leg, modes).catch(() => [])).find((r) => Combine.catchable(r, null, by));
      if (option == null) continue;
      itinerary = Combine.choose(itinerary, i, option);
      this.live.delete(i);
      this.fired.delete(`board-${i}`);
    }
    if (itinerary === s.itinerary) return s;
    this.guide = new TripGuide(itinerary, s.destination);
    // The new bus's live times on the next tick.
    this.lastLive = 0;
    void AsyncStorage.setItem(SESSION_KEY, JSON.stringify({ itinerary, destination: s.destination, lang: lang() })).catch(() => {});
    return { ...s, itinerary };
  }
}

export const activeTrip = new ActiveTrip();

export function useActiveTrip(): TripSession | null {
  return useSyncExternalStore(activeTrip.subscribe, () => activeTrip.session);
}

// Location updates arrive here, also with the app in the background (expo-task-manager runs
// this in the app's JS runtime, starting it headless if needed). Defined when this module loads,
// which index.ts does first.
if (!TaskManager.isTaskDefined(TRIP_TASK)) {
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TRIP_TASK, async ({ data, error }) => {
    if (error || !data?.locations?.length) return;
    const l = data.locations[data.locations.length - 1];
    await activeTrip.onLocation({ lat: l.coords.latitude, lon: l.coords.longitude });
  });
}
