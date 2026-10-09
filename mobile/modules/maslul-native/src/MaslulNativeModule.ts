import { NativeModule, requireOptionalNativeModule } from 'expo';

/** SIRI vehicles in columns; NaN in a number column means "not reported". */
export interface SiriColumns {
  lineRef: string[];
  journeyRef: (string | null)[];
  vehicleRef: (string | null)[];
  nextStopCode: (string | null)[];
  originDeparture: number[];
  recordedAt: number[];
  lat: number[];
  lon: number[];
  bearing: number[];
  velocityKmh: number[];
  distanceFromStart: number[];
}

declare class MaslulNativeModule extends NativeModule<Record<string, never>> {
  /** The Kotlin app's stored data (SharedPreferences "maslul" / "store_v1"), or null. Android only. */
  readLegacyStore(): Promise<string | null>;
  /** Downloads and parses one SIRI snapshot off the JS thread; null when the file isn't there. */
  fetchSiriVehicles(url: string, userAgent: string, snapshotEpochSec: number): Promise<SiriColumns | null>;
  /** Shows the live-directions step in the location service's notification (Android); false when it isn't running. */
  updateTripNotification(taskName: string, title: string, text: string, progress: number, endUrl: string): Promise<boolean>;
}

/** Null where the native module isn't built in (Expo Go, tests). */
export default requireOptionalNativeModule<MaslulNativeModule>('MaslulNative');
