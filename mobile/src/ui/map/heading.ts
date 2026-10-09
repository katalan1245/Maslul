import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

/** Smallest signed difference a − b between two compass angles, in −180..180. */
export const angleDiff = (a: number, b: number) => ((a - b + 540) % 360) - 180;

/**
 * Which way the phone points, in degrees clockwise from true north, while [enabled]; null
 * without a compass. Smoothed, and only updated on a change of a couple of degrees so the map
 * isn't redrawn for sensor noise.
 */
export function useHeading(enabled: boolean): number | null {
  const [heading, setHeading] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) {
      setHeading(null);
      return;
    }
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    let smoothed: number | null = null;
    let shown: number | null = null;
    Location.watchHeadingAsync((h) => {
      // True north needs a location fix; until then the magnetic heading (~5° off in Israel) will do.
      const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      if (deg < 0) return;
      smoothed = smoothed == null ? deg : (smoothed + angleDiff(deg, smoothed) * 0.25 + 360) % 360;
      if (shown == null || Math.abs(angleDiff(smoothed, shown)) >= 2) {
        shown = smoothed;
        setHeading(smoothed);
      }
    })
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => setHeading(null));
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);
  return heading;
}
