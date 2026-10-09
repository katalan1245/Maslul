import { StackActions, createNavigationContainerRef } from '@react-navigation/native';
import type { Itinerary, LineRoute, Place } from '../data/models';
import type { Shuttle } from '../data/userStore';

export type SearchField = 'FROM' | 'TO';

/**
 * Place search. In trip mode it fills From and To and calls [onDone] once both are set;
 * with [single] it returns the first chosen place.
 */
export interface SearchParams {
  from: Place | null;
  to: Place | null;
  editing: SearchField;
  single?: boolean;
  title?: string;
  onDone: (from: Place, to: Place | null) => void;
}

export interface ShuttleDraft {
  name: string;
  from: Place | null;
  to: Place | null;
  rideMinutes: number | null;
  days: number[];
}

export type RootStack = {
  Tabs: undefined;
  Search: SearchParams;
  PickOnMap: { onPicked: (p: Place) => void };
  Routes: { from: Place; to: Place };
  RouteDetail: { itinerary: Itinerary; from: Place; to: Place };
  Settings: undefined;
  OnBoard: { onPicked: (p: Place) => void };
  Shuttles: undefined;
  ShuttleEdit: { existing: Shuttle | null; draft?: ShuttleDraft };
  Line: { route: LineRoute };
  Stop: { place: Place };
  Trip: { tripId: string; boardStopId?: string | null; alightStopId?: string | null; focusVehicle?: boolean };
};

export type Tabs = { Navigate: undefined; Lines: undefined; Stations: undefined };

export const navigationRef = createNavigationContainerRef<RootStack>();

type Args<K extends keyof RootStack> = RootStack[K] extends undefined ? [] : [RootStack[K]];

/**
 * The app's navigator (AppNav in Kotlin), usable from callbacks that outlive the screen that
 * made them: every action applies to the screen on top.
 */
export const nav = {
  push<K extends keyof RootStack>(name: K, ...params: Args<K>) {
    if (navigationRef.isReady()) navigationRef.dispatch(StackActions.push(name, params[0]));
  },
  /** Replaces the top screen (e.g. search → results). */
  replace<K extends keyof RootStack>(name: K, ...params: Args<K>) {
    if (navigationRef.isReady()) navigationRef.dispatch(StackActions.replace(name, params[0]));
  },
  pop() {
    if (navigationRef.isReady() && navigationRef.canGoBack()) navigationRef.dispatch(StackActions.pop());
  },
};

export const CURRENT_LOCATION: Place = { name: 'Current location', lat: 0, lon: 0, kind: 'CURRENT_LOCATION' };
