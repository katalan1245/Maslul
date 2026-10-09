import { type Place, placeKey } from './models';
import { S } from '../i18n';
import { distinctBy } from './util';

/**
 * House-number queries ("המגינים 14 פתח תקווה"). OSM often lacks the exact number, and then
 * both geocoders return unrelated "… 14" addresses in other streets. We look for the exact
 * address, and otherwise fall back to the street itself, labelled as such.
 */
export interface AddressQuery {
  text: string;
  number: string | null;
  rest: string;
}

const numberRe = /(?<![\p{L}\d])(\d{1,4}[א-ת]?)(?![\p{L}\d])/u;
const letter = /\p{L}/u;

function parse(text: string): AddressQuery {
  const t = text.trim().replace(/\s+/g, ' ');
  const m = letter.test(t) ? numberRe.exec(t) : null;
  if (!m) return { text: t, number: null, rest: t };
  const rest = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  return { text: t, number: m[0], rest };
}

/** Spelling-tolerant form for comparisons: no punctuation, "תקווה" == "תקוה". */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/["'׳״`]/g, '')
    .replace(/[-־,.]/g, ' ')
    .replace(/וו/g, 'ו')
    .replace(/יי/g, 'י')
    .replace(/(^|\s)רחוב\s/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const containsWords = (hay: string, needle: string) => needle.trim() !== '' && ` ${hay} `.includes(` ${needle} `);

/** The query's words besides the street (usually the city) must match the place's city. */
function cityOk(q: AddressQuery, street: string, p: Place): boolean {
  const extra = ` ${norm(q.rest)} `.split(` ${street} `).join(' ').trim();
  if (extra === '') return true;
  if (p.subtitle == null) return false;
  const city = norm(p.subtitle);
  return city !== '' && (containsWords(city, extra) || containsWords(extra, city) || city.includes(extra));
}

function isExact(q: AddressQuery, p: Place): boolean {
  if (q.number == null) return false;
  const num = norm(q.number);
  const name = norm(p.name);
  if (p.kind !== 'ADDRESS' || !name.endsWith(` ${num}`)) return false;
  const street = name.slice(0, name.length - num.length - 1).trim();
  return containsWords(norm(q.rest), street) && cityOk(q, street, p);
}

function isStreet(q: AddressQuery, p: Place): boolean {
  if (p.kind === 'STOP') return false;
  const street = norm(p.name);
  return containsWords(norm(q.rest), street) && cityOk(q, street, p);
}

/**
 * Puts exact address hits first; failing that, the matching street (named with the house
 * number, subtitle saying it's approximate). Returns null if neither was found.
 */
function resolve(q: AddressQuery, candidates: Place[]): Place[] | null {
  const num = q.number;
  if (num == null) return null;
  const exact = candidates.filter((c) => isExact(q, c));
  if (exact.length > 0) return distinctBy([...exact, ...candidates], placeKey);
  const street = candidates.find((c) => isStreet(q, c));
  if (!street) return null;
  const approx: Place = {
    ...street,
    name: `${street.name} ${num}`,
    subtitle: [S.address.notOnMap(num), street.subtitle].filter((s) => s != null).join(' · '),
    kind: 'ADDRESS',
  };
  return distinctBy([approx, ...candidates], placeKey);
}

export const AddressSearch = { parse, norm, isExact, isStreet, resolve };
