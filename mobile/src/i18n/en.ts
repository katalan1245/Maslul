/**
 * The app's English text, the source for every language: he.ts must have the same keys. Entries
 * that take numbers or names are functions, so each language can word them its own way.
 */
export const en = {
  fmt: {
    /** Indexed by ISO day of week, 1 = Monday. */
    days: ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as readonly string[],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as readonly string[],
    now: 'Now',
    today: 'Today',
    tomorrow: 'Tomorrow',
    /** "Sat, 10 Oct". */
    date: (day: string, d: number, month: string) => `${day}, ${d} ${month}`,
    /** "Sat 18:15". */
    dayTime: (day: string, time: string) => `${day} ${time}`,
    min: (n: number) => `${n} min`,
    /** "1 h 05 min", or "2 h" on the hour. */
    hours: (h: number, m: number) => (m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')} min`),
    meters: (m: number) => `${m} m`,
    km: (km: string) => `${km} km`,
    updatedNow: 'Updated just now',
    updatedSec: (s: number) => `Updated ${s}s ago`,
    updatedMin: (m: number) => `Updated ${m} min ago`,
    updatedAt: (time: string) => `Updated at ${time}`,
  },
  modes: {
    WALK: 'Walk',
    BUS: 'Bus',
    TRAIN: 'Train',
    LIGHT_RAIL: 'Light rail',
    METRO: 'Carmelit',
    CABLE_CAR: 'Cable car',
    FERRY: 'Ferry',
    CAR: 'Car',
    OTHER: 'Transit',
  },
  stop: {
    platform: (p: string) => `Platform ${p}`,
    floor: (f: string) => `Floor ${f}`,
    floorAfterPlatform: (f: string) => `floor ${f}`,
    /** A line with no number of its own. */
    trainLine: 'Train',
    cableLine: 'Cable',
  },
  common: {
    back: 'Back',
    clear: 'Clear',
    notSet: 'Not set',
    cancel: 'Cancel',
    delete: 'Delete',
    save: 'Save',
    close: 'Close',
    moveUp: 'Move up',
    moveDown: 'Move down',
  },
  settings: {
    title: 'Settings',
    places: 'Places',
    home: 'Home',
    work: 'Work',
    favoritePlaces: 'Favorite places',
    addFavorite: 'Add favorite',
    addFavoritePlace: 'Add favorite place',
    addFavoriteHint: 'Tap a favorite above to edit or remove it',
    appearance: 'Appearance',
    themes: { SYSTEM: 'System', LIGHT: 'Light', DARK: 'Dark' },
    language: 'Language',
    /** Each language is named in itself, so it can be found whatever the app's language. */
    languages: { SYSTEM: 'System', HE: 'עברית', EN: 'English' },
    reminders: 'Departure reminders',
    remindersHint: 'Notify me this long before I need to leave',
    advanced: 'Advanced',
    rides: 'Getting a ride (טרמפ)',
    ridesHint: 'Find the best place to be dropped off and go on by bus or train',
    onBoard: 'Already on a bus',
    onBoardHint: "Plan the rest of the trip from the bus or train you're on",
    myShuttles: 'My shuttles',
    shuttlesNone: 'Company or private shuttles with a fixed timetable',
    shuttlesCount: (n: number) => `${n} shuttles`,
    about: 'About',
    version: (v: string) => `Version ${v}`,
    sourceCode: 'Source code on GitHub',
    madeBy: 'Made with ♥ by Tommy and contributors',
    /** The data sources, as credited in the Kotlin app. */
    credits:
      'Maslul is a free, open-source transit app for Israel, licensed under the GNU AGPL v3.\n\n' +
      '• Routes & timetables: Israel Ministry of Transport GTFS, routed by Transitous (transitous.org).\n' +
      '• Live vehicles: Ministry of Transport SIRI feed, published by Open Bus / The Public Knowledge Workshop (Hasadna).\n' +
      '• Line search & daily schedules: Open Bus Stride API.\n' +
      '• Search: Transitous, Photon (komoot) and Nominatim, OpenStreetMap data.\n' +
      '• Maps: OpenFreeMap, © OpenStreetMap contributors.\n\n' +
      "Live arrival times are estimated from each vehicle's reported position and are typically 30–90 s behind real time.",
  },
};
