import { Http, buildUrl } from './http';
import type { Place } from './models';

export interface NominatimResult {
  lat?: string;
  lon?: string;
  name?: string | null;
  addresstype?: string | null;
  address?: { road?: string | null; house_number?: string | null; city?: string | null; town?: string | null; village?: string | null };
}

/** Kotlin's String.toDoubleOrNull: the whole string must be a number. */
const toDouble = (s: string | undefined) => (s != null && s.trim() !== '' && !Number.isNaN(Number(s)) ? Number(s) : null);

export function nominatimToPlace(r: NominatimResult): Place | null {
  const a = r.address ?? {};
  const city = a.city ?? a.town ?? a.village;
  const house = a.house_number != null && a.road != null ? `${a.road} ${a.house_number}` : null;
  const title = house ?? (r.name?.trim() ? r.name : null) ?? a.road;
  if (title == null) return null;
  const lat = toDouble(r.lat);
  const lon = toDouble(r.lon);
  if (lat == null || lon == null) return null;
  const p: Place = { name: title, lat, lon, kind: house != null || r.addresstype === 'road' ? 'ADDRESS' : 'POI' };
  if (city != null) p.subtitle = city;
  return p;
}

/**
 * OSM Nominatim, only as a last resort for address queries the other geocoders miss.
 * Its usage policy allows at most one request per second, with an identifying User-Agent.
 */
export class NominatimApi {
  private lastCall = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly base = 'https://nominatim.openstreetmap.org') {}

  search(text: string): Promise<Place[]> {
    const url = buildUrl(this.base, 'search', [
      ['q', text],
      ['format', 'jsonv2'],
      ['addressdetails', '1'],
      ['countrycodes', 'il,ps'],
      ['limit', '5'],
    ]);
    // One request at a time, at least 1.1 s apart.
    const run = this.queue.then(async () => {
      const wait = this.lastCall + 1100 - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await Http.getJson<NominatimResult[]>(url);
      } finally {
        this.lastCall = Date.now();
      }
    });
    this.queue = run.catch(() => undefined);
    return run.then((rows) => rows.map(nominatimToPlace).filter((p): p is Place => p != null));
  }
}
