// Native pieces the screen tests can't run: maps, location, notifications, background tasks.
require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@gorhom/bottom-sheet', () => ({ __esModule: true, ...require('@gorhom/bottom-sheet/mock') }));
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const box = (name) => {
    const C = React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({ easeTo: jest.fn(), jumpTo: jest.fn(), flyTo: jest.fn(), fitBounds: jest.fn(), getBounds: jest.fn(async () => [0, 0, 0, 0]) }));
      return React.createElement(View, { ...props, testID: props.testID ?? name }, props.children);
    });
    C.displayName = name;
    return C;
  };
  const Children = ({ children }) => children ?? null;
  return { Map: box('maplibre_map'), Camera: box('maplibre_camera'), GeoJSONSource: Children, Layer: () => null, Images: () => null };
});

jest.mock('expo-location', () => {
  const coords = { latitude: 32.0853, longitude: 34.7818, accuracy: 10, altitude: 0, altitudeAccuracy: 0, heading: 0, speed: 0 };
  const granted = async () => ({ granted: true, status: 'granted', canAskAgain: true, expires: 'never' });
  const sub = { remove: jest.fn() };
  return {
    Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
    ActivityType: { Other: 1, AutomotiveNavigation: 2, Fitness: 3, OtherNavigation: 4, Airborne: 5 },
    getForegroundPermissionsAsync: jest.fn(granted),
    requestForegroundPermissionsAsync: jest.fn(granted),
    getCurrentPositionAsync: jest.fn(async () => ({ coords, timestamp: Date.now() })),
    getLastKnownPositionAsync: jest.fn(async () => ({ coords, timestamp: Date.now() })),
    watchPositionAsync: jest.fn(async () => sub),
    watchHeadingAsync: jest.fn(async () => sub),
    startLocationUpdatesAsync: jest.fn(async () => {}),
    stopLocationUpdatesAsync: jest.fn(async () => {}),
    hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  };
});

jest.mock('expo-notifications', () => ({
  AndroidImportance: { LOW: 2, DEFAULT: 3, HIGH: 4 },
  AndroidNotificationPriority: { HIGH: 'high' },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationChannelAsync: jest.fn(async () => null),
  deleteNotificationChannelAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  dismissNotificationAsync: jest.fn(async () => {}),
}));

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn(), isTaskDefined: jest.fn(() => false) }));
jest.mock('expo-splash-screen', () => ({ preventAutoHideAsync: jest.fn(async () => {}), hideAsync: jest.fn(async () => {}) }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(async () => {}) }));

jest.mock('@react-native-community/slider', () => {
  const React = require('react');
  const { View } = require('react-native');
  return (props) => React.createElement(View, { testID: props.testID, accessibilityRole: 'adjustable', ...props });
});

// The dark map style is fetched over the network.
global.fetch = jest.fn(async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' }));
