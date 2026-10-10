# Design notes

Decisions behind the React Native port, for whoever picks it up next. What has and hasn't been verified is in [STATUS.md](STATUS.md).

## Replacing the Kotlin app

- **Same identity.** The package is `com.maslul.app` with versionCode 5 and up (from `version.json`), so the store and sideloads treat this app as an update. An update only installs over the old app when both are signed with the same key. Releases therefore use the Kotlin app's `keystore.properties`, through `plugins/withReleaseSigning.js`. The same plugin points debug builds at `~/.android/debug.keystore`, the key the Kotlin app's debug builds use, instead of the Expo template's bundled one, so the upgrade can be tested with two debug builds.
- **Data migration** (`src/state/persist.ts`). On first launch the native module reads the old store once: SharedPreferences `maslul`, key `store_v1`. It's kotlinx JSON with defaults left out, nulls left out, enums by name and Sets as arrays. `readUserData` applies every Kotlin default and drops broken entries one by one instead of failing the whole store, then `migrated()` runs as it did in Kotlin. Details:
  - The result is saved under the same key in AsyncStorage, and `legacy_migrated_v1` marks the migration as done.
  - The old SharedPreferences are never written or deleted, so a bad migration loses nothing.
  - If the module is missing (Expo Go) the read throws, and the migration is tried again on the next launch rather than marked done.
  - iOS has no old app, so its reader returns null.

## Structure

- **The data layer is a file-for-file port** of `app/src/main/java/com/maslul/app/data`, with the same names, so a Kotlin fix maps straight onto TS. The Kotlin unit tests were ported one-to-one into `__tests__/`.
- **Time.** Instants are epoch seconds (`number`) and dates are `"YYYY-MM-DD"` strings. Israel time is computed by hand from the DST rule of the 2013 law (`src/data/time.ts`), checked against ICU for every hour from 2014 to 2035. This avoids relying on Hermes' time-zone data and keeps the times right whatever zone the phone is set to.
- **Screens keep Kotlin's model/screen split.** Each screen has a `Model` class (`src/ui/model.ts`) with plain fields, async methods and `changed()`; `useModel` subscribes the component.
  - `every()` replaces Kotlin's `while (true) { delay() }` loops and stops when the screen closes.
  - A per-job counter makes stale async results drop themselves, as cancelled coroutines did.
- **Navigation.** One native stack sits over three bottom tabs. Screens pass each other callbacks (a search's `onDone`, as the Kotlin models did), which React Navigation warns about. That's fine because navigation state is never persisted or deep-linked; `App.tsx` silences the warning. Pressing Back on a tab other than Navigate returns to Navigate (`backBehavior="firstRoute"`), like the Kotlin BackHandler.
- **User store** (`src/state/store.ts`) is one external store read through `useSyncExternalStore`. Saves are queued in order, so the last edit is the one that ends up on disk.

## Native module (`modules/maslul-native`)

It has three functions; everything else uses Expo and community libraries.

| Function | Android (Kotlin) | iOS (Swift) | Why native |
|---|---|---|---|
| `readLegacyStore()` | Reads the old SharedPreferences | Returns `null` | No JS API reads another app version's prefs |
| `fetchSiriVehicles(url, ua, snapshot)` | `HttpURLConnection` + `org.brotli:dec`, streamed through `android.util.JsonReader` | `URLSession` + Compression (`COMPRESSION_BROTLI`) + `JSONSerialization` | The snapshot is about 215 KB of brotli that expands to about 3.6 MB of JSON with about 6,000 vehicles. Hermes has no brotli, and parsing on the JS thread every 30 s would stutter the map. Vehicles come back as columns (NaN for missing numbers) to keep the bridge cheap |
| `updateTripNotification(task, title, text, progress, endUrl)` | Re-posts expo-location's foreground-service notification with a progress bar and an "End trip" action that opens `maslul://end-trip` | Returns `false` | expo-location's foreground notification is fixed at start; the Kotlin app updated it every step. iOS has no ongoing notification (the blue location indicator shows instead) |

The JS fallbacks (`jsSnapshotFetcher`, Node zlib) are used only by tests, which check the same parsing on a real snapshot in `fixtures/`.

## Live directions (`src/live/`)

- **Background location.** `expo-location` runs a foreground service of type `location`, as `LiveTripService` did, and `expo-task-manager` delivers updates to `TaskManager.defineTask`. `index.ts` imports the task module first, so a headless start finds it. The app needs no background-location permission; `ACCESS_BACKGROUND_LOCATION` is stripped from the manifest.
- **Surviving restarts.** The session is saved in AsyncStorage (`live_trip_v1`). After a restart, `restore()` picks it up if the location service is still running, and drops it otherwise.
- **Alerts.** Each alert key fires once per session. If the JS runtime restarts mid-trip, the set of fired alerts is lost, so an alert may repeat once; Kotlin's in-process service had the same limit.
- **Permissions** match the Kotlin app's, plus `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK` (expo-notifications keeps scheduled reminders across a reboot) and `ACCESS_WIFI_STATE` (MapLibre). The push (Firebase `c2dm`), install-referrer and launcher-badge permissions that expo-notifications' libraries bring in are removed through `blockedPermissions` in `app.config.ts`, since the app only posts local notifications. `SYSTEM_ALERT_WINDOW` is in debug builds only, for the dev menu.
- **Reminders** use expo-notifications DATE triggers. Like the Kotlin AlarmManager code, they're exact only when the system allows exact alarms, and otherwise come as windowed alarms. The emulator test found one ~2 min late, and the window can reach an hour. Unlike Kotlin, the manifest declares `SCHEDULE_EXACT_ALARM`: Android 12–13 grant it at install, and on 14+ it's off until the user allows it under Alarms & reminders. `USE_EXACT_ALARM` is left out because Play reserves it for alarm and calendar apps.

## Deliberate changes from the Kotlin app

Found by the emulator tests (`TESTING.md`); everything else follows Kotlin.

- **Trip guide** (`src/live/tripGuide.ts`). Once past the last stop and more than 100 m from it, the guide moves on to the walk, even when the user isn't on the planned walking path. Kotlin stayed on "Get off now" for the whole walk. Arrival sticks: walking on afterwards no longer turns it back into "N m to go".
- **Times more than an hour away** show as a time with its day when it isn't today (`Fmt.when`): "Bus 5 at Sun 21:05" instead of "Bus in 1208 min". The same goes for route cards and the reminder toast. After the last bus, the planner's routes are tomorrow's.
- **Shuttle days** collapse runs of three or more into a range ("Sun–Fri", "Sun, Mon, Wed–Sat"); Kotlin did this only for Sun–Thu.
- **Deleting a shuttle** asks first.
- **Reminders** for one of your own shuttles name it without "Bus" in front.
- **Exact alarms**: see Reminders above. When a reminder is set and "Alarms & reminders" is off, the app offers to open that setting (`canScheduleExactAlarms`/`openExactAlarmSettings` in the native module).
- **Position along a route** (`GeoMath.project`). Kotlin took, among all points within the snap radius, the one nearest the previous position, which on a finely drawn route lags the real position by up to that radius (~100 m on a real line 24 ride): stops were counted late and "Get off now" never came. It now takes the nearest point of the pass of the route closest to the previous position. That also places stops and vehicles more exactly.
- **Get off now** is kept while within 40 m of the stop, for up to a minute, since there the position is already the walk's start. Waiting at the boarding stop before the bus stays on the walk's countdown.
- **Line search** falls back from today's and yesterday's Stride feed to the newest one Stride has; over a weekend that's Thursday's. "No lines found" shows a search icon, not the no-connection cloud.
- **A failed route search** says whether the planner answered with an error, took too long, or couldn't be reached, and logs the error (`console.warn`), instead of always "Check your connection".
- **Route details** show the day in the header and the shared text when the trip isn't today.

## New features (not in the Kotlin app)

- **Stops away while waiting.** The live trip's waiting step reads "Bus 5 in 8 min · 2 stops away (live)", and "board soon" fires at 3 minutes *or* 2 stops away, whichever comes first (in traffic the minutes slip while the bus is already close). The stop screen shows "N stops away" under live times. Route cards and route details already showed it.

## Languages: English and Hebrew (`src/i18n/`)

- **Choosing.** Settings → Language: System (the phone's language; Hebrew if it's `he`/`iw`, otherwise English), עברית or English. The app name stays Maslul in both.
- **Strings.** `en.ts` holds every piece of app text and `he.ts` its Hebrew, typed against it, so a key missing from either breaks `tsc`. Code reads `S.section.key` when the text is shown, never at module load. Text that takes a number, name or vehicle is a function, so each language words it its own way.
- **Hebrew grammar.** Plurals ("החלפה אחת", "2 החלפות") and gender ("האוטובוס קרוב" / "הרכבת קרובה") come from helpers in `he.ts`. Sentences about a vehicle take its `VehicleKind` (`vehicleKind()` in `models.ts`) rather than an English word.
- **Right to left.** Hebrew forces RTL through `I18nManager.forceRTL`, which only shows after a restart, so `applyLanguage` (`device.ts`) reloads the app once. A guard key (`direction_reload_v1`) stops a reload loop if the platform doesn't take the new direction. Changing the language in Settings always reloads. React Native swaps left/right styles and row order by itself. Code mirrors what it doesn't: directional icons (`icons.tsx`), the progress bar's sweep, and the bus on the About screen. Times and ranges carry a right-to-left mark (`S.fmt.range`, `S.fmt.span`), so "14:05 ← 14:40" reads in order.
- **Names follow the app language.** Search, planning and stop times ask Transitous, Photon and Nominatim for it (`repo.language`), and map labels use `name:he` or `name:en` (`labelLanguage` in `darkStyle.ts`).
- **Background trips.** The live trip saves its language with the session, so a headless restart words the notification the same way. The native trip notification takes the "End trip" label from JS.
- **Limits.**
  - In English, stop and line names often stay Hebrew: Transitous has no English names for most Israeli stops.
  - Photon has no Hebrew, so its results come back in whatever the map data holds.
  - Names saved before a switch (a dropped pin, a saved trip's place) keep the language they were saved in.
  - Android notification channel names update only after the reload.
- `__tests__/hebrew.test.tsx` renders the main screens in Hebrew and fails on any English string from `en.ts` that shows up.

## Map

- **MapLibre React Native 11** draws the map with OpenFreeMap styles: positron for light, and dark with the Kotlin app's `brightenDark` overrides, fetched once with the app's User-Agent.
- Vehicles, the user's heading beam and markers are GeoJSON sources with SDF icons (`assets/map/*@3x.png`, made by `scripts/make-assets.mjs`), so their colours are set at runtime.
- **Vehicles glide** to new positions. The animation keys on the vehicles' content, not the array's identity, because screens rebuild the list on every render; keying on the array caused an endless re-render loop, caught by the screen tests.
- **Attribution.** The attribution button stays on, bottom-left, as the OpenStreetMap and OpenFreeMap licences require. The MapLibre logo is hidden, as in the Kotlin app. On Home the sheet covers it, as in Kotlin, and the full credit is in About. With the map expanded, the Home buttons sit above it.
- **Dark labels.** The dark style's overrides are filtered by paint-key prefix. A symbol layer's keys are `text-*`/`icon-*`, not `symbol-*`; the first port dropped them, which left the labels dim.

## Network

`src/data/http.ts` sends the Kotlin app's User-Agent, `Maslul/<version> (+https://github.com/Tom-stack3/Maslul)`, on every request and times out after 30 s. Nominatim calls are queued at least 1.1 s apart, per its usage policy. MOTIS requests use whole-second times. Stride often has no routes yet for today, so line lookups fall back to earlier days, as in Kotlin.

## Testing

- `npm test` runs offline:
  - the ported unit tests;
  - the migration and parsers on real recorded responses (`fixtures/`, each with its URL);
  - whole-app screen flows with `@testing-library/react-native`, driven through the same test ids as the Kotlin AppFlowTest, with native libraries mocked in `jest.setup.js` and a fake repository in `__tests__/support/fakeRepo.ts`.
- `npm run test:live` checks the real services. Tests that depend on what's running right now (Stride's day, Shabbat, night) warn and skip rather than fail.
- `.maestro/` holds the AppFlowTest scenarios as device flows; shared steps live in `.maestro/subflows/` so Maestro doesn't run them as tests of their own. The home-sheet gestures can only be checked there.
