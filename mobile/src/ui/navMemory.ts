import type { NavigationState } from '@react-navigation/native';

/**
 * Where the app was, kept outside React: Android rebuilds the activity when the text size or the
 * phone's language changes, which mounts App again in the same JS runtime; it comes back here.
 */
export const navMemory: { state: NavigationState | undefined } = { state: undefined };
