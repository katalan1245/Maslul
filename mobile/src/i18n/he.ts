import type { Strings } from '.';

/** Hebrew text. Western digits throughout, as on Israeli signs and timetables. */
export const he: Strings = {
  fmt: {
    days: ['', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת', 'יום א׳'],
    months: ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'],
    now: 'עכשיו',
    today: 'היום',
    tomorrow: 'מחר',
    date: (day, d, month) => `${day}, ${d} ב${month}`,
    dayTime: (day, time) => `${day} ${time}`,
    min: (n) => `${n} דק׳`,
    hours: (h, m) => (m === 0 ? `${h} ש׳` : `${h} ש׳ ${String(m).padStart(2, '0')} דק׳`),
    meters: (m) => `${m} מ׳`,
    km: (km) => `${km} ק״מ`,
    updatedNow: 'עודכן עכשיו',
    updatedSec: (s) => `עודכן לפני ${s} שנ׳`,
    updatedMin: (m) => `עודכן לפני ${m} דק׳`,
    updatedAt: (time) => `עודכן ב-${time}`,
  },
  modes: {
    WALK: 'הליכה',
    BUS: 'אוטובוס',
    TRAIN: 'רכבת',
    LIGHT_RAIL: 'רכבת קלה',
    METRO: 'כרמלית',
    CABLE_CAR: 'רכבל',
    FERRY: 'מעבורת',
    CAR: 'רכב',
    OTHER: 'תחבורה ציבורית',
  },
  stop: {
    platform: (p) => `רציף ${p}`,
    floor: (f) => `קומה ${f}`,
    floorAfterPlatform: (f) => `קומה ${f}`,
    trainLine: 'רכבת',
    cableLine: 'רכבל',
  },
  common: {
    back: 'חזרה',
    clear: 'ניקוי',
    notSet: 'לא הוגדר',
    cancel: 'ביטול',
    delete: 'מחיקה',
    save: 'שמירה',
    close: 'סגירה',
    moveUp: 'הזזה למעלה',
    moveDown: 'הזזה למטה',
  },
  settings: {
    title: 'הגדרות',
    places: 'מקומות',
    home: 'בית',
    work: 'עבודה',
    favoritePlaces: 'מקומות מועדפים',
    addFavorite: 'הוספת מועדף',
    addFavoritePlace: 'הוספת מקום מועדף',
    addFavoriteHint: 'הקישו על מועדף כדי לערוך או להסיר אותו',
    appearance: 'תצוגה',
    themes: { SYSTEM: 'לפי המכשיר', LIGHT: 'בהיר', DARK: 'כהה' },
    language: 'שפה',
    languages: { SYSTEM: 'לפי המכשיר', HE: 'עברית', EN: 'English' },
    reminders: 'תזכורות יציאה',
    remindersHint: 'להזכיר לי כמה זמן לפני שצריך לצאת',
    advanced: 'מתקדם',
    rides: 'טרמפ',
    ridesHint: 'למצוא איפה הכי כדאי לרדת מהטרמפ ולהמשיך באוטובוס או ברכבת',
    onBoard: 'כבר באוטובוס',
    onBoardHint: 'לתכנן את המשך הנסיעה מהאוטובוס או מהרכבת שאתם בהם',
    myShuttles: 'ההסעות שלי',
    shuttlesNone: 'הסעות של מקום העבודה או פרטיות, עם לוח זמנים קבוע',
    shuttlesCount: (n) => `${n} הסעות`,
    about: 'אודות',
    version: (v) => `גרסה ${v}`,
    sourceCode: 'קוד המקור ב-GitHub',
    madeBy: 'נעשה עם ♥ על ידי Tommy והתורמים',
    credits:
      // Starts with a right-to-left mark: a paragraph that begins with a Latin word is otherwise laid out left to right.
      '‏Maslul היא אפליקציית תחבורה ציבורית חינמית בקוד פתוח לישראל, ברישיון GNU AGPL v3.\n\n' +
      '• מסלולים ולוחות זמנים: GTFS של משרד התחבורה, בתכנון של Transitous (transitous.org).\n' +
      '• מיקום כלי רכב בזמן אמת: ממשק SIRI של משרד התחבורה, בהפצת Open Bus / הסדנא לידע ציבורי.\n' +
      '• חיפוש קווים ולוחות זמנים יומיים: Open Bus Stride API.\n' +
      '• חיפוש: Transitous, ‏Photon (komoot) ו-Nominatim, נתוני OpenStreetMap.\n' +
      '• מפות: OpenFreeMap, ‏© OpenStreetMap contributors.\n\n' +
      'זמני ההגעה בזמן אמת מחושבים לפי המיקום שכל כלי רכב מדווח, ובדרך כלל מפגרים ב-30 עד 90 שניות אחרי המציאות.',
  },
};
