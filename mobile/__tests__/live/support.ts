/**
 * Shared set-up for the live smoke tests: a repository wired to the real services (brotli
 * decoded with Node's zlib), and, with RECORD=1, a fetch wrapper that saves one real response
 * per endpoint into mobile/fixtures for the offline fixture tests.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { LiveRepository, jsSnapshotFetcher } from '../../src/data/liveRepository';
import { TransitRepository } from '../../src/data/transitRepository';

export const FIXTURES = join(__dirname, '..', '..', 'fixtures');

const ENDPOINTS: [RegExp, string][] = [
  [/api\.transitous\.org\/api\/v6\/plan\?.*directModes=CAR/, 'transitous-plan-car'],
  [/api\.transitous\.org\/api\/v6\/plan\?/, 'transitous-plan'],
  [/api\.transitous\.org\/api\/v6\/trip\?/, 'transitous-trip'],
  [/api\.transitous\.org\/api\/v6\/stoptimes\?/, 'transitous-stoptimes'],
  [/api\.transitous\.org\/api\/v6\/map\/stops\?/, 'transitous-map-stops'],
  [/api\.transitous\.org\/api\/v1\/geocode\?.*type=STOP/, 'transitous-geocode-stops'],
  [/api\.transitous\.org\/api\/v1\/geocode\?/, 'transitous-geocode'],
  [/api\.transitous\.org\/api\/v1\/reverse-geocode\?/, 'transitous-reverse-geocode'],
  [/open-bus-stride-api\.hasadna\.org\.il\/gtfs_routes\/list\?/, 'stride-gtfs-routes'],
  [/open-bus-stride-api\.hasadna\.org\.il\/gtfs_rides\/list\?/, 'stride-gtfs-rides'],
  [/open-bus-stride-api\.hasadna\.org\.il\/gtfs_ride_stops\/list\?.*gtfs_ride_ids=/, 'stride-ride-stops'],
  [/open-bus-stride-api\.hasadna\.org\.il\/gtfs_ride_stops\/list\?/, 'stride-departures'],
  [/photon\.komoot\.io\/api/, 'photon-search'],
  [/nominatim\.openstreetmap\.org\/search/, 'nominatim-search'],
  [/open-bus-siri-requester\.hasadna\.org\.il\/.*\.br$/, 'siri-snapshot'],
];

/** Size of the response kept per endpoint: the biggest one seen is the most telling. */
const saved = new Map<string, number>();

if (process.env.RECORD === '1') {
  const real = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await real(input, init);
    const url = String(input instanceof Request ? input.url : input);
    const hit = ENDPOINTS.find(([re]) => re.test(url));
    if (res.ok && hit) {
      const body = Buffer.from(await res.clone().arrayBuffer());
      if (body.length > (saved.get(hit[1]) ?? 0)) {
        saved.set(hit[1], body.length);
        mkdirSync(FIXTURES, { recursive: true });
        const ext = hit[1] === 'siri-snapshot' ? '.json.br' : '.json';
        writeFileSync(join(FIXTURES, hit[1] + ext), body);
        writeFileSync(join(FIXTURES, `${hit[1]}.url.txt`), `${url}\nfetched ${new Date().toISOString()}\n`);
      }
    }
    return res;
  };
}

export const snapshotFetcher = jsSnapshotFetcher((b) => brotliDecompressSync(b));
export const newRepo = () => new TransitRepository(new LiveRepository(snapshotFetcher));
