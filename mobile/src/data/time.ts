/**
 * Time in the app: instants are whole epoch seconds (the Kotlin app did its arithmetic on
 * `Instant.epochSecond`), dates are "YYYY-MM-DD" strings, and local time is Israel's.
 */
export type Instant = number;
export type LocalDate = string;

export const nowSec = (): Instant => Math.floor(Date.now() / 1000);

const IST = 2 * 3600;
const IDT = 3 * 3600;

/** Last Sunday of [month] (1-based) in [year], as a UTC day number (days since epoch). */
function lastSunday(year: number, month: number): number {
  const last = Date.UTC(year, month, 0) / 86400000; // day 0 of the next month = last day of this one
  const dow = new Date(last * 86400000).getUTCDay();
  return last - dow;
}

/**
 * Israel's UTC offset at [t]. Daylight time (2013 law): from the Friday before the last Sunday
 * of March at 02:00 IST to the last Sunday of October at 02:00 IDT.
 * shortcut: rule as of the 2013 law, no tz database; update if Israel changes its DST rules.
 */
export function israelOffset(t: Instant): number {
  const year = new Date((t + IST) * 1000).getUTCFullYear();
  const start = (lastSunday(year, 3) - 2) * 86400 + 2 * 3600 - IST;
  const end = lastSunday(year, 10) * 86400 + 2 * 3600 - IDT;
  return t >= start && t < end ? IDT : IST;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** ISO day of week: 1 = Monday … 7 = Sunday. */
  dow: number;
}

export function localParts(t: Instant): LocalParts {
  const d = new Date((t + israelOffset(t)) * 1000);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    dow: d.getUTCDay() === 0 ? 7 : d.getUTCDay(),
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function localDate(t: Instant): LocalDate {
  const p = localParts(t);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

export const today = (): LocalDate => localDate(nowSec());

function ymd(date: LocalDate): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error(`Bad date: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** The instant of [hour]:[minute] local time on [date] (an hour skipped by DST resolves forward). */
export function zoned(date: LocalDate, hour = 0, minute = 0): Instant {
  const [y, mo, d] = ymd(date);
  const utc = Date.UTC(y, mo - 1, d, hour, minute) / 1000;
  const guess = utc - israelOffset(utc - IST);
  const off = israelOffset(guess);
  return utc - off;
}

/** Midnight at the start of [date] in Israel. */
export const startOfDay = (date: LocalDate): Instant => zoned(date);

export function plusDays(date: LocalDate, days: number): LocalDate {
  const [y, mo, d] = ymd(date);
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** ISO day of week of [date]: 1 = Monday … 7 = Sunday. */
export function dayOfWeek(date: LocalDate): number {
  const [y, mo, d] = ymd(date);
  const w = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}

/** "2026-09-28T07:00:00Z": ISO-8601 in UTC with whole seconds, like `Instant.toString()`. */
export function isoUtc(t: Instant): string {
  return new Date(Math.floor(t) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Parses an ISO-8601 instant or offset date-time ("…Z", "…+03:00"); null when it isn't one. */
export function parseInstant(s: string | null | undefined): Instant | null {
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) return null;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}
