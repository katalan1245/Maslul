/** Kotlin collection helpers the ported code leans on. */

export function distinctBy<T>(list: readonly T[], key: (t: T) => unknown): T[] {
  const seen = new Set<unknown>();
  return list.filter((t) => {
    const k = key(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Groups in first-seen order, like Kotlin's `groupBy`. */
export function groupBy<T, K>(list: readonly T[], key: (t: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const t of list) {
    const k = key(t);
    const g = out.get(k);
    if (g) g.push(t);
    else out.set(k, [t]);
  }
  return out;
}

type Cmp = number | string | boolean;

function cmp(a: Cmp, b: Cmp): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Stable sort by one or more keys, ascending. */
export function sortedBy<T>(list: readonly T[], ...keys: ((t: T) => Cmp)[]): T[] {
  return [...list].sort((a, b) => {
    for (const k of keys) {
      const c = cmp(k(a), k(b));
      if (c !== 0) return c;
    }
    return 0;
  });
}

export function sortedByDescending<T>(list: readonly T[], key: (t: T) => Cmp): T[] {
  return [...list].sort((a, b) => cmp(key(b), key(a)));
}

/** First element with the smallest key, or null. */
export function minBy<T>(list: readonly T[], key: (t: T) => number): T | null {
  let best: T | null = null;
  let bestK = Infinity;
  for (const t of list) {
    const k = key(t);
    if (best === null || k < bestK) {
      best = t;
      bestK = k;
    }
  }
  return best;
}

/** First element with the largest key, or null. */
export function maxBy<T>(list: readonly T[], key: (t: T) => number): T | null {
  let best: T | null = null;
  let bestK = -Infinity;
  for (const t of list) {
    const k = key(t);
    if (best === null || k > bestK) {
      best = t;
      bestK = k;
    }
  }
  return best;
}

export const sumOf = <T>(list: readonly T[], f: (t: T) => number): number => list.reduce((s, t) => s + f(t), 0);

export function partition<T>(list: readonly T[], f: (t: T) => boolean): [T[], T[]] {
  const yes: T[] = [];
  const no: T[] = [];
  for (const t of list) (f(t) ? yes : no).push(t);
  return [yes, no];
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export const notNull = <T>(t: T | null | undefined): t is T => t != null;

/** `Long` division truncating towards zero, as Kotlin does. */
export const idiv = (a: number, b: number) => Math.trunc(a / b);

/**
 * `"%.Nf".format(x)` as Java prints it: rounds half up on the shortest decimal form of [x]
 * (so 1.00005 → "1.0001", where `toFixed` gives "1.0000").
 */
export function fixed(x: number, digits: number): string {
  if (!Number.isFinite(x)) return String(x);
  const neg = x < 0 || Object.is(x, -0);
  let s = Math.abs(x).toString();
  if (/e/i.test(s)) return x.toFixed(digits);
  const [int, frac = ''] = s.split('.');
  if (frac.length <= digits) s = `${int}.${frac.padEnd(digits, '0')}`;
  else if (int.length + digits > 15) return x.toFixed(digits);
  else {
    const kept = Number(int + frac.slice(0, digits)) + (frac.charCodeAt(digits) >= 53 ? 1 : 0);
    const str = kept.toString().padStart(digits + 1, '0');
    s = `${str.slice(0, str.length - digits)}.${str.slice(str.length - digits)}`;
  }
  if (digits === 0) s = s.replace(/\.$/, '');
  const zero = /^[0.]*$/.test(s);
  return neg && !zero ? `-${s}` : s;
}
