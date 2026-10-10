import { APP_VERSION } from '../version';

export class HttpException extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpException';
  }
}

/** Community services ask clients to identify themselves. */
export const USER_AGENT = `Maslul/${APP_VERSION} (+https://github.com/Tom-stack3/Maslul)`;

const TIMEOUT_MS = 30_000;

export type Query = readonly (readonly [string, string | number | boolean | null | undefined])[];

/** `base` + `path` with the non-null query parameters, each encoded. */
export function buildUrl(base: string, path: string, query: Query = []): string {
  const q = query
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${base.replace(/\/$/, '')}/${path}${q ? `?${q}` : ''}`;
}

export const Http = {
  /** GET with the app's User-Agent; throws on network errors and timeouts. */
  async get(url: string): Promise<Response> {
    const ctl = new AbortController();
    // shortcut: one overall timeout rather than OkHttp's separate connect/read ones.
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: ctl.signal });
    } catch (e) {
      // Expo's fetch reports both as a plain Error ("fetch failed: …"); callers tell them apart.
      const why = (e as Error)?.message ?? String(e);
      throw ctl.signal.aborted ? Object.assign(new Error(`Timed out: ${why}`), { name: 'AbortError' }) : new TypeError(`Network request failed: ${why}`);
    } finally {
      clearTimeout(timer);
    }
  },

  async getString(url: string): Promise<string> {
    const r = await Http.get(url);
    if (!r.ok) throw new HttpException(r.status, `HTTP ${r.status} for ${url.replace(/\?.*$/, '')}`);
    return r.text();
  },

  async getJson<T>(url: string): Promise<T> {
    return JSON.parse(await Http.getString(url)) as T;
  },
};
