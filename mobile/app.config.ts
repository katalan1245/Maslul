import type { ExpoConfig } from 'expo/config';
import v from './version.json';

const APP_VERSION = v.version;
const VERSION_CODE = v.versionCode;

const BRAND = '#1F6FEB';
const LOCATION_USE = 'Maslul uses your location to plan trips from where you are, show nearby stops and lines, and follow your trip.';

const config: ExpoConfig = {
  name: 'Maslul',
  slug: 'maslul',
  version: APP_VERSION,
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'maslul',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#F7F8FA',
  ios: {
    bundleIdentifier: 'com.maslul.app',
    buildNumber: String(VERSION_CODE),
    supportsTablet: false,
    infoPlist: {
      // Only live directions use location in the background, while a trip is being followed.
      UIBackgroundModes: ['location'],
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    // Same id as the Kotlin app, so this installs as an update and keeps its data.
    package: 'com.maslul.app',
    versionCode: VERSION_CODE,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      monochromeImage: './assets/adaptive-monochrome.png',
      backgroundColor: BRAND,
    },
    // As in the Kotlin app's manifest.
    permissions: [
      'android.permission.INTERNET',
      'android.permission.ACCESS_NETWORK_STATE',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.VIBRATE',
    ],
    // Live directions run as a foreground service started from the app: no background-location permission.
    // (and nothing the template adds that the Kotlin app didn't ask for).
    blockedPermissions: [
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    '@maplibre/maplibre-react-native',
    [
      'expo-location',
      {
        locationWhenInUsePermission: LOCATION_USE,
        locationAlwaysAndWhenInUsePermission: LOCATION_USE,
        locationAlwaysPermission: LOCATION_USE,
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: true,
        androidForegroundServiceIcon: './assets/notification-icon.png',
      },
    ],
    ['expo-notifications', { icon: './assets/notification-icon.png', color: BRAND }],
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: BRAND },
    ],
    [
      'expo-build-properties',
      {
        // The Kotlin app's minSdk (java.time is used natively), and its ABIs: phones plus the x86_64 emulator.
        android: { minSdkVersion: 26, buildArchs: ['arm64-v8a', 'x86_64'] },
        ios: { deploymentTarget: '16.4' },
      },
    ],
    './plugins/withReleaseSigning',
  ],
};

export default config;
