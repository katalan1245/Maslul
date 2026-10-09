import { Operators } from '../src/data/operators';

const key = (id: string | null, name: string | null) => Operators.find(id, name)?.key ?? null;

test('matches Hebrew names from the feed', () => {
  const cases: [string, string][] = [
    ['egged', 'אגד'], ['dan', 'דן'], ['metropoline', 'מטרופולין'], ['kavim', 'קווים'], ['superbus', 'סופרבוס'],
    ['electra-afikim', 'אלקטרה אפיקים'], ['electra-afikim-transport', 'אלקטרה אפיקים תחבורה'], ['extra', 'אקסטרה'],
    ['extra-jerusalem', 'אקסטרה ירושלים'], ['tnufa', 'תנופה'], ['nateev-express', 'נתיב אקספרס'],
    ['golan', 'מועצה אזורית גולן'], ['galim', 'גלים'], ['beit-shemesh-express', 'בית שמש אקספרס'],
    ['dan-badarom', 'דן בדרום'], ['dan-beer-sheva', 'דן באר שבע'], ['dan-netivim', 'דן נתיבים בעמ'],
    ['nazareth-tourism', 'נסיעות ותיירות'], ['jerusalem-lrt', 'כפיר'], ['tavlit', 'תבל'], ['israel-railways', 'רכבת ישראל'],
    ['sam', 'ש.א.מ'], ['gb-tours', 'גי.בי.טורס'], ['derech-egged', 'דרך אגד עוטף ירושלים'],
    ['east-jerusalem', 'ירושלים-רמאללה איחוד'], ['sherut', 'מוניות מטרו קו'],
  ];
  for (const [k, name] of cases) expect([name, key(null, name)]).toEqual([name, k]);
});

test('matches English names loosely', () => {
  expect(key(null, 'Metropoline')).toBe('metropoline');
  expect(key(null, '  METROPOLINE Ltd. ')).toBe('metropoline');
  expect(key(null, 'Egged')).toBe('egged');
  expect(key(null, 'Egged Taavura')).toBe('egged-taavura');
  expect(key(null, 'Dan Badarom')).toBe('dan-badarom');
  expect(key(null, 'Israel Railways')).toBe('israel-railways');
  expect(key(null, 'CityPass')).toBe('jerusalem-lrt');
  expect(key(null, 'Nazareth Transport and Tourism')).toBe('nazareth-tourism');
  expect(key(null, 'S.A.M')).toBe('sam');
});

test('falls back to agency id', () => {
  expect(key('15', null)).toBe('metropoline');
  expect(key('3', '')).toBe('egged');
  expect(key('5', 'unknown co')).toBe('dan');
  expect(key('il-Israel-MOT_2', null)).toBe('israel-railways');
  expect(Operators.findByRef(18, '')?.key).toBe('kavim');
  expect(key('9999', 'Some Other Bus')).toBeNull();
  expect(key(null, null)).toBeNull();
  expect(Operators.findByRef(0, '')).toBeNull();
});

test('name wins over reused id', () => {
  // id 4 used to be Egged Taavura; the name is authoritative.
  expect(key('4', 'אגד תעבורה')).toBe('egged-taavura');
  expect(key('4', null)).toBe('electra-afikim-transport');
});

test("doesn't match inside other words", () => {
  // "דן" must not match inside "ירדן", nor "Dan" inside "Danish".
  expect(key(null, 'ירדן')).toBeNull();
  expect(key(null, 'Danish Buses')).toBeNull();
});

test('brand colours', () => {
  expect(Operators.colorOf('15', 'מטרופולין')).toBe(0xfff28c00);
  expect(Operators.colorOf(null, 'אגד')).toBe(0xff00913f);
  expect(Operators.colorOf(null, 'דן')).toBe(0xff0067c5);
  expect(Operators.colorOf(null, 'nobody')).toBeNull();
  // Major operators should be distinguishable from each other.
  const majors = ['אגד', 'דן', 'מטרופולין', 'קווים', 'סופרבוס', 'אלקטרה אפיקים', 'אקסטרה', 'רכבת ישראל'].map((n) => Operators.colorOf(null, n));
  expect(new Set(majors).size).toBe(majors.length);
  expect(Operators.colorOf(null, 'דן')).not.toBe(Operators.colorOf(null, 'רכבת ישראל'));
});

test('readable text colour', () => {
  expect(Operators.prefersDarkText(0xfff28c00)).toBe(true); // Metropoline orange -> dark text
  expect(Operators.prefersDarkText(0xfff5c400)).toBe(true); // yellow -> dark text
  expect(Operators.prefersDarkText(0xff00913f)).toBe(false); // Egged green -> white
  expect(Operators.prefersDarkText(0xff0067c5)).toBe(false); // Dan blue -> white
  expect(Operators.prefersDarkText(0xff1c3f94)).toBe(false); // Railways navy -> white
  // Every brand colour gets a text colour with at least 3:1 contrast.
  for (const o of Operators.all) {
    const white = Operators.whiteContrast(o.color);
    const black = (Operators.luminance(o.color) + 0.05) / 0.05;
    const chosen = Operators.prefersDarkText(o.color) ? black : white;
    expect([o.key, chosen >= 3.0]).toEqual([o.key, true]);
  }
});
