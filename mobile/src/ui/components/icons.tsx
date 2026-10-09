import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps } from 'react';
import { I18nManager } from 'react-native';
import type { PlaceKind, TransitMode } from '../../data/models';
import type { FavoriteIcon } from '../../data/userStore';

export type IconName = ComponentProps<typeof MaterialIcons>['name'];

/** Icons that point the way the text runs: mirrored right-to-left, as Material asks. */
const DIRECTIONAL = new Set<IconName>(['arrow-back', 'arrow-forward', 'chevron-left', 'chevron-right', 'directions-walk', 'directions-car', 'directions-run', 'directions-bike']);

export function Icon({ name, size = 24, color, accessibilityLabel }: { name: IconName; size?: number; color: string; accessibilityLabel?: string }) {
  return (
    <MaterialIcons
      name={name}
      size={size}
      color={color}
      style={I18nManager.isRTL && DIRECTIONAL.has(name) ? { transform: [{ scaleX: -1 }] } : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={accessibilityLabel == null}
      importantForAccessibility={accessibilityLabel == null ? 'no-hide-descendants' : 'yes'}
    />
  );
}

export function modeIcon(mode: TransitMode): IconName {
  switch (mode) {
    case 'WALK':
      return 'directions-walk';
    case 'BUS':
      return 'directions-bus';
    case 'TRAIN':
      return 'directions-railway';
    case 'LIGHT_RAIL':
      return 'tram';
    case 'METRO':
      return 'directions-subway';
    case 'CABLE_CAR':
      return 'airline-seat-recline-normal';
    case 'FERRY':
      return 'directions-boat';
    case 'CAR':
      return 'directions-car';
    default:
      return 'commute';
  }
}

export const FAVORITE_ICON_NAMES: Record<FavoriteIcon, IconName> = {
  STAR: 'star',
  HEART: 'favorite',
  HOME: 'home',
  SCHOOL: 'school',
  GYM: 'fitness-center',
  SHOPPING: 'shopping-cart',
  RESTAURANT: 'restaurant',
  CAFE: 'local-cafe',
  HEALTH: 'local-hospital',
  PARK: 'park',
  POOL: 'pool',
  SPORTS: 'sports-soccer',
};

export function kindIcon(k: PlaceKind): IconName {
  switch (k) {
    case 'STOP':
      return 'directions-bus';
    case 'ADDRESS':
      return 'location-on';
    case 'HOME':
      return 'home';
    case 'WORK':
      return 'work';
    case 'CURRENT_LOCATION':
      return 'my-location';
    case 'POI':
      return 'business';
    case 'ON_BOARD':
      return 'directions-bus';
    default:
      return 'place';
  }
}
