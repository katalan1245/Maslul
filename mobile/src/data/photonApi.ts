import { Http, buildUrl } from './http';
import type { GeoPoint, Place } from './models';

interface Props {
  name?: string | null;
  street?: string | null;
  housenumber?: string | null;
  city?: string | null;
  district?: string | null;
  osm_key?: string | null;
  osm_value?: string | null;
}

export interface PhotonFeature {
  geometry?: { coordinates?: number[] };
  properties?: Props;
}

export function featureToPlace(f: PhotonFeature): Place | null {
  const c = f.geometry?.coordinates ?? [];
  if (c.length < 2) return null;
  const p = f.properties ?? {};
  const addr = [p.street, p.housenumber].filter((s) => s != null).join(' ');
  const address = addr.trim() ? addr : null;
  const name = p.name ?? address;
  if (name == null) return null;
  // Photon's bus stops lack MOT ids; Transitous returns proper stops, so skip these.
  if (p.osm_value === 'bus_stop' || p.osm_value === 'platform') return null;
  const sub = [p.name != null ? address : null, p.city].filter((s) => s != null).join(', ');
  const place: Place = { name, lat: c[1], lon: c[0], kind: p.name == null ? 'ADDRESS' : 'POI' };
  if (sub.trim()) place.subtitle = sub;
  if (p.osm_key === 'railway' && (p.osm_value === 'station' || p.osm_value === 'halt')) place.mode = 'TRAIN';
  return place;
}

/** Photon (komoot) OSM geocoder: good coverage of named places (malls, hospitals, …). */
export class PhotonApi {
  constructor(private readonly base = 'https://photon.komoot.io') {}

  async search(text: string, near: GeoPoint | null): Promise<Place[]> {
    const url = buildUrl(this.base, 'api/', [
      ['q', text],
      ['limit', '8'],
      // Israel + West Bank bounding box
      ['bbox', '34.2,29.4,35.95,33.4'],
      ['lat', near?.lat],
      ['lon', near?.lon],
      // Names as mapped (Hebrew mostly), not in the Accept-Language iOS adds: English names broke
      // matching a Hebrew town typed after the street.
      ['lang', 'default'],
    ]);
    const fc = await Http.getJson<{ features?: PhotonFeature[] }>(url);
    return (fc.features ?? []).map(featureToPlace).filter((p): p is Place => p != null);
  }
}
