import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { USER_AGENT } from '../../data/http';

export const LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';
export const DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';

type Paint = Record<string, unknown>;

/** Paint overrides by layer id (TransitMap.kt's brightenDark). */
const OVERRIDES: Record<string, Paint> = {
  background: { 'background-color': '#1E232B' },
  water: { 'fill-color': '#13283D' },
  waterway: { 'line-color': '#13283D' },
  landuse_residential: { 'fill-color': '#252B34', 'fill-opacity': 0.6 },
  landcover_wood: { 'fill-color': '#1F2E27' },
  landuse_park: { 'fill-color': '#1F2E27' },
  building: { 'fill-color': '#2C333D', 'fill-outline-color': '#363E4A' },
  'aeroway-area': { 'fill-color': '#252B34' },
  'aeroway-runway': { 'line-color': '#3A424E' },
  'aeroway-taxiway': { 'line-color': '#333A45' },
  road_area_pier: { 'fill-color': '#2C333D' },
  road_pier: { 'line-color': '#2C333D' },
  highway_path: { 'line-color': '#3A414C' },
  highway_minor: { 'line-color': '#3D4550' },
  highway_major_casing: { 'line-color': '#2A3038' },
  highway_major_inner: { 'line-color': '#4C5563' },
  highway_major_subtle: { 'line-color': '#454D59' },
  highway_motorway_casing: { 'line-color': '#2A3038' },
  highway_motorway_inner: { 'line-color': '#5D6676' },
  highway_motorway_subtle: { 'line-color': '#4C5563' },
  railway: { 'line-color': '#4E5562' },
  railway_minor: { 'line-color': '#4E5562' },
  railway_transit: { 'line-color': '#4E5562' },
  railway_dashline: { 'line-color': '#1E232B' },
  railway_minor_dashline: { 'line-color': '#1E232B' },
  railway_transit_dashline: { 'line-color': '#1E232B' },
  boundary_state: { 'line-color': '#59616D' },
  'boundary_country_z0-4': { 'line-color': '#59616D' },
  'boundary_country_z5-': { 'line-color': '#59616D' },
  water_name: { 'text-color': '#7FA3C8', 'text-halo-color': '#13283D' },
  highway_name_other: { 'text-color': '#AEB5BF', 'text-halo-color': '#1E232B' },
  highway_name_motorway: { 'text-color': '#C3C9D1' },
};

/**
 * OpenFreeMap's dark style is near-black with grey-on-black labels, hard to read on a phone.
 * Lifts it to a slate palette: land, roads and water stay apart, and labels are bright. Only
 * properties the layer's type already paints are set.
 */
export function brightenDark(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map((l) => {
    const extra: Paint | undefined = l.id.startsWith('place_') ? { 'text-color': '#D5DAE0', 'text-halo-color': '#1E232B' } : OVERRIDES[l.id];
    if (!extra) return l;
    const prefix = `${l.type}-`;
    const allowed = Object.fromEntries(Object.entries(extra).filter(([k]) => k.startsWith(prefix)));
    return { ...l, paint: { ...('paint' in l ? l.paint : {}), ...allowed } } as typeof l;
  });
  return { ...style, layers };
}

let dark: Promise<StyleSpecification | null> | null = null;

/** The brightened dark style, fetched once; null (use the plain URL) if it can't be loaded. */
export function darkStyle(): Promise<StyleSpecification | null> {
  dark ??= fetch(DARK_STYLE, { headers: { 'User-Agent': USER_AGENT } })
    .then((r) => (r.ok ? (r.json() as Promise<StyleSpecification>) : null))
    .then((s) => (s ? brightenDark(s) : null))
    .catch(() => {
      dark = null;
      return null;
    });
  return dark;
}
