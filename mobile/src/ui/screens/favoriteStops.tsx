import { useIsFocused } from '@react-navigation/native';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { GeoMath } from '../../data/geo';
import { type GeoPoint, type Place, placePoint } from '../../data/models';
import { type Instant, nowSec } from '../../data/time';
import type { BoardEntry } from '../../data/transitRepository';
import { S } from '../../i18n';
import { location } from '../../state/location';
import { repo } from '../../state/services';
import { store } from '../../state/store';
import { PlaceRow, SectionHeader } from '../components/common';
import { FAVORITE_GOLD } from '../components/favorites';
import { useNow } from '../components/live';
import { Menu } from '../components/overlays';
import { ExactAlarmDialog } from '../components/reminders';
import { Fmt } from '../fmt';
import { Model, useModel } from '../model';
import { nav } from '../nav';
import { BoardRow, boardGroups, entryTime, remindToLeave } from './Stop';

/** Starred stops shown on Home, and lines shown per stop. */
export const HOME_STOPS = 3;
export const HOME_LINES = 3;

/** The starred stops Home shows: nearest first, or in starred order without a location. */
export function homeStops(favorites: Place[], here: GeoPoint | null): Place[] {
  const stops = favorites.filter((p) => p.stopId != null);
  if (here != null) stops.sort((a, b) => GeoMath.distance(here, placePoint(a)) - GeoMath.distance(here, placePoint(b)));
  return stops.slice(0, HOME_STOPS);
}

/** A stop's departures as last loaded; [failed] when the latest load didn't work. */
interface Board {
  entries: BoardEntry[];
  at: Instant;
  failed: boolean;
}

/** The next departures at the starred stops, loaded only while Home is in view. */
export class FavoriteStopsModel extends Model {
  readonly boards = new Map<string, Board>();
  private visible = false;

  override start() {
    this.every(60_000, () => this.visible && void this.refresh());
  }

  /** Home came into view (refresh now) or left it (stop refreshing). */
  setVisible(v: boolean) {
    this.visible = v;
    if (v) void this.refresh();
  }

  refresh = async () => {
    await Promise.all(
      homeStops(store.value.favoriteStops, location.last).map(async (p) => {
        const id = p.stopId!;
        try {
          this.boards.set(id, { entries: await repo.stopBoard(id), at: nowSec(), failed: false });
        } catch {
          // Offline: keep the last board; departed rows drop out as it's shown.
          const b = this.boards.get(id);
          if (b) this.boards.set(id, { ...b, failed: true });
        }
      }),
    );
    this.changed();
  };
}

const openTrip = (e: BoardEntry, stop: Place, focusVehicle: boolean) =>
  nav.push('Trip', { tripId: e.departure.tripId, boardStopId: stop.stopId, focusVehicle });

/** Home's "Favorite stops": each starred stop with its next few lines. Nothing when none are starred. */
export function FavoriteStops({ favorites, here }: { favorites: Place[]; here: GeoPoint | null }) {
  const model = useModel(() => new FavoriteStopsModel());
  const focused = useIsFocused();
  // Not 'active' only: the state can start as 'unknown', and is briefly 'inactive' on iOS.
  const [active, setActive] = useState(AppState.currentState !== 'background');
  const now = useNow(10_000);
  const shown = homeStops(favorites, here);
  const ids = shown.map((p) => p.stopId).join();
  const [menuFor, setMenuFor] = useState<{ e: BoardEntry; stop: Place } | null>(null);
  const [askExactAlarm, setAskExactAlarm] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s !== 'background'));
    return () => sub.remove();
  }, []);
  // Also when the shown stops change: one starred, or the user moved nearer another.
  useEffect(() => model.setVisible(focused && active), [model, focused, active, ids]);

  if (shown.length === 0) return null;
  return (
    <>
      <SectionHeader text={S.stations.favorites} />
      {shown.map((p) => {
        const b = model.boards.get(p.stopId!);
        // A minute's grace: a bus due now is still worth running for.
        const groups = b ? boardGroups(b.entries.filter((e) => entryTime(e) > now - 60)).slice(0, HOME_LINES) : [];
        const subtitle = [
          here != null ? Fmt.distance(GeoMath.distance(here, placePoint(p))) : p.subtitle,
          b?.failed ? Fmt.ago(b.at, now) : null,
          b != null && groups.length === 0 ? S.stopBoard.noUpcoming : null,
        ].filter((x) => x != null);
        return (
          <View key={p.stopId} testID="home_stop">
            <PlaceRow title={p.name} subtitle={subtitle.join(' · ')} icon="star" iconTint={FAVORITE_GOLD} onPress={() => nav.push('Stop', { place: p })} />
            {groups.map((g) => (
              <BoardRow
                key={g.key}
                group={g}
                now={now}
                onPress={() => openTrip(g.entries[0], p, false)}
                onTimePress={() => openTrip(g.entries[0], p, true)}
                onLongPress={() => setMenuFor({ e: g.entries[0], stop: p })}
              />
            ))}
          </View>
        );
      })}
      <Menu
        visible={menuFor != null}
        onDismiss={() => setMenuFor(null)}
        items={[
          {
            text: S.stopBoard.remindLeave,
            icon: 'alarm-add',
            onPress: () => menuFor && void remindToLeave(menuFor.e, menuFor.stop).then((ask) => ask && setAskExactAlarm(true)),
            testID: 'remind_leave',
          },
        ]}
      />
      <ExactAlarmDialog visible={askExactAlarm} onClose={() => setAskExactAlarm(false)} />
    </>
  );
}
