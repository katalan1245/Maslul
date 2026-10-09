/**
 * Israeli public-transport operators and their brand colours, so every line badge, route
 * rail and map line can be told apart by company (Egged green, Dan blue, Metropoline
 * orange, …). The MOT GTFS feed carries no route_color, so this is the main colour source.
 *
 * Keys are the MOT GTFS agency_id (== Stride operator_ref == Transitous agencyId) plus the
 * agency name in Hebrew and English. Names win over ids because ids get reused when a
 * franchise changes hands (e.g. 4 was Egged Taavura, now Electra Afikim Transport).
 */

export interface Operator {
  key: string;
  /** ARGB brand colour. */
  color: number;
  ids: string[];
  names: string[];
}

/** Legal-form words ignored when matching names. */
const NOISE = new Set(['בעמ', 'ltd', 'inc', 'company', 'co', 'חברת', 'the']);

const op = (key: string, color: number, ids: string[], ...names: string[]): Operator => ({ key, color, ids, names });

const all: Operator[] = [
  op('egged', 0xff00913f, ['3'], 'אגד', 'Egged'),
  op('egged-taavura', 0xff5e9732, [], 'אגד תעבורה', 'Egged Taavura', 'Egged Transport'),
  op('derech-egged', 0xff2e7d32, ['135'], 'דרך אגד עוטף ירושלים', 'דרך אגד', 'Derech Egged'),
  op('dan', 0xff0067c5, ['5'], 'דן', 'Dan'),
  op('dan-badarom', 0xff2f80d0, ['31'], 'דן בדרום', 'Dan Badarom', 'Dan South', 'Dan in the South'),
  op('dan-beer-sheva', 0xff1e88b8, ['32'], 'דן באר שבע', 'Dan Beer Sheva', "Dan Be'er Sheva"),
  op('dan-netivim', 0xff3a6fb7, ['39'], 'דן נתיבים', 'Dan Netivim'),
  op('metropoline', 0xfff28c00, ['15'], 'מטרופולין', 'Metropoline', 'Metropolin'),
  op('kavim', 0xff00a99d, ['18'], 'קווים', 'Kavim'),
  op('superbus', 0xffd71920, ['16'], 'סופרבוס', 'Superbus', 'Super Bus'),
  op('electra-afikim', 0xff6cb33f, ['25'], 'אלקטרה אפיקים', 'Electra Afikim'),
  op('electra-afikim-transport', 0xff6cb33f, ['4'], 'אלקטרה אפיקים תחבורה', 'Electra Afikim Transport'),
  op('afikim', 0xff6cb33f, [], 'אפיקים', 'Afikim'),
  op('extra', 0xffe4007c, ['37'], 'אקסטרה', 'Extra'),
  op('extra-jerusalem', 0xffc2186b, ['38'], 'אקסטרה ירושלים', 'Extra Jerusalem'),
  op('tnufa', 0xff00b3e3, ['34'], 'תנופה', 'Tnufa'),
  op('nateev-express', 0xfff5c400, ['14'], 'נתיב אקספרס', 'Nateev Express', 'Nativ Express'),
  op('golan', 0xff8d6e3f, ['24'], 'מועצה אזורית גולן', 'Golan Regional Council', 'Golan'),
  op('galim', 0xff1976d2, ['23'], 'גלים', 'Galim'),
  op('beit-shemesh-express', 0xff9e1b32, ['35'], 'בית שמש אקספרס', 'Beit Shemesh Express'),
  op('nazareth-tourism', 0xffb07b2c, ['7'], 'נסיעות ותיירות', 'נסיעות ותיירות נצרת',
    'Nazareth Transport and Tourism', 'Nazareth Travel and Tourism', 'Nazareth Tourism'),
  op('gb-tours', 0xff7cb342, ['8'], 'גי.בי.טורס', 'GB Tours', 'G.B. Tours'),
  op('sam', 0xff5c6bc0, ['6'], 'ש.א.מ', 'SAM', 'S.A.M'),
  op('eilot', 0xffd08a3c, ['10'], 'מועצה אזורית אילות', 'Eilot Regional Council', 'Eilot'),
  op('united-tours', 0xff455a64, ['40'], 'יונייטד טורס', 'United Tours'),
  // Jerusalem light rail: CityPass, operated by Kfir since 2023.
  op('jerusalem-lrt', 0xffe2001a, ['21'], 'כפיר', 'Kfir', 'סיטיפס', 'CityPass', 'City Pass', 'Jerusalem Light Rail'),
  // Tel Aviv light rail (Red line), operated by Tavlit for NTA.
  op('tavlit', 0xffe3232c, ['22'], 'תבל', 'Tavlit', 'נת"ע', 'NTA', 'Tel Aviv Light Rail', 'Dankal'),
  op('carmelit', 0xff8e4ec6, ['20'], 'כרמלית', 'Carmelit'),
  op('cable-express', 0xff0e9aa7, ['33'], 'כבל אקספרס', 'Cable Express'),
  op('israel-railways', 0xff1c3f94, ['2'], 'רכבת ישראל', 'Israel Railways', 'Israel Railway', 'Rakevet Israel'),
  // Shared taxis (sherut): yellow like the cabs themselves.
  op('sherut', 0xffffb300, ['91', '93', '97', '98'], 'מוניות', 'Sherut', 'Taxi'),
  // East Jerusalem unified bus companies (Jerusalem-… איחוד).
  op('east-jerusalem', 0xff4a6fa5, ['42', '44', '45', '47', '49', '50', '51'], 'איחוד', 'ירושלים הר הזיתים', 'East Jerusalem'),
];

/** Merges runs of single-letter tokens ("s a m" -> "sam"). */
function collapseInitials(t: string[]): string[] {
  const out: string[] = [];
  let buf = '';
  for (const w of t) {
    // Kotlin's length counts UTF-16 units, as JS does.
    if (w.length === 1) buf += w;
    else {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      out.push(w);
    }
  }
  if (buf) out.push(buf);
  return out;
}

function tokens(s: string): string[] {
  const words = s
    .toLowerCase()
    .replace(/["'׳״`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((w) => w !== '' && !NOISE.has(w));
  // "ש.א.מ" / "g.b." collapse to one token so they still match.
  return collapseInitials(words);
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function containsRun(hay: string[], needle: string[]): boolean {
  if (needle.length > hay.length) return false;
  for (let i = 0; i <= hay.length - needle.length; i++) {
    if (sameList(hay.slice(i, i + needle.length), needle)) return true;
  }
  return false;
}

// Longest alias first so "דן בדרום" beats "דן" and "אגד תעבורה" beats "אגד".
const byName: [string[], Operator][] = all
  .flatMap((o) => o.names.map((n): [string[], Operator] => [tokens(n), o]))
  .filter(([t]) => t.length > 0)
  .sort((a, b) => b[0].length - a[0].length);

const byId = new Map<string, Operator>(all.flatMap((o) => o.ids.map((id): [string, Operator] => [id, o])));

function lastAfter(s: string, c: string): string {
  const i = s.lastIndexOf(c);
  return i < 0 ? s : s.substring(i + 1);
}

/** WCAG relative luminance of an ARGB colour, 0 (black) .. 1 (white). */
function luminance(argb: number): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch((argb >>> 16) & 0xff) + 0.7152 * ch((argb >>> 8) & 0xff) + 0.0722 * ch(argb & 0xff);
}

export const Operators = {
  all,

  /**
   * Finds the operator for a GTFS agency id and/or agency name. Accepts ids with a feed
   * prefix (e.g. "il-Israel-MOT_15") and names in any case/punctuation.
   */
  find(agencyId: string | null | undefined, agencyName: string | null | undefined): Operator | null {
    if (agencyName != null) {
      const t = tokens(agencyName);
      if (t.length > 0) {
        const exact = byName.find(([alias]) => sameList(alias, t));
        if (exact) return exact[1];
        const run = byName.find(([alias]) => containsRun(t, alias));
        if (run) return run[1];
      }
    }
    if (agencyId == null) return null;
    const id = lastAfter(lastAfter(agencyId.trim(), '_'), ':').replace(/^0+/, '');
    return id ? (byId.get(id) ?? null) : null;
  },

  findByRef(operatorRef: number | null | undefined, agencyName: string | null | undefined): Operator | null {
    return Operators.find(operatorRef != null && operatorRef > 0 ? String(operatorRef) : null, agencyName);
  },

  /** ARGB brand colour, or null when the operator is unknown. */
  colorOf(agencyId: string | null | undefined, agencyName: string | null | undefined): number | null {
    return Operators.find(agencyId, agencyName)?.color ?? null;
  },

  luminance,

  /** WCAG contrast ratio of white text on [argb]. */
  whiteContrast: (argb: number) => 1.05 / (luminance(argb) + 0.05),

  /**
   * True when white text would be hard to read on [argb]. Badge text is bold, so white is
   * kept down to the WCAG large-text ratio of 3:1 (brand greens/blues stay white), and
   * light colours like orange or yellow get dark text.
   */
  prefersDarkText: (argb: number) => Operators.whiteContrast(argb) < 3.0,
};
