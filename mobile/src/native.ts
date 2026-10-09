import type { SnapshotFetcher } from './data/liveRepository';
import type { Vehicle } from './data/models';
import MaslulNative, { type SiriColumns } from '../modules/maslul-native/src/MaslulNativeModule';

const orNull = (n: number) => (Number.isNaN(n) ? null : n);

/** Rows from the native module's columns. */
export function vehiclesFromColumns(c: SiriColumns): Vehicle[] {
  return c.lineRef.map((lineRef, i) => ({
    lineRef,
    journeyRef: c.journeyRef[i],
    originDeparture: c.originDeparture[i],
    lat: c.lat[i],
    lon: c.lon[i],
    bearing: orNull(c.bearing[i]),
    velocityKmh: orNull(c.velocityKmh[i]),
    recordedAt: c.recordedAt[i],
    distanceFromStart: orNull(c.distanceFromStart[i]),
    nextStopCode: c.nextStopCode[i],
    vehicleRef: c.vehicleRef[i],
  }));
}

/** Live snapshots through the native module; without it (Expo Go) there's simply no live data. */
export const nativeSnapshotFetcher: SnapshotFetcher = async (url, userAgent, minute) => {
  if (!MaslulNative) return null;
  const cols = await MaslulNative.fetchSiriVehicles(url, userAgent, minute);
  return cols ? vehiclesFromColumns(cols) : null;
};

/** The Kotlin app's saved data, read once for the migration; throws when the module isn't built in. */
export async function readLegacyStore(): Promise<string | null> {
  if (!MaslulNative) throw new Error('MaslulNative module not available');
  return MaslulNative.readLegacyStore();
}
