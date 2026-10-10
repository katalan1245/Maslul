# Porting upstream 1.1.1, 1.2.0 and 1.2.1

The original Kotlin app (`Tom-stack3/Maslul`) released three versions after the rewrite was ported from its 1.1.0 (`fab01ac`):

- **1.1.1** (`f4309d7`): at most 3 lines per ride on route cards; Getting a ride and Already on a bus on by default.
- **1.2.0** (`6b02824`): Simple Maslul, with big buttons and plain directions in English, Hebrew and Russian.
- **1.2.1** (`076af78`): the whole app in Hebrew and Russian, a longer walk when it helps, and lifts that are one drive.

This file maps every change in those versions, file by file, to where it lives in `mobile/`, and whether it's ported. It was built from `git diff fab01ac 076af78 -- app/` and upstream's own tests. Lines that only swap English text for a translated string aren't listed one by one: the rewrite already had its own i18n (see the "Text" row).

Status: **Done**, **To do**, **Different** (deliberately not the same; the reason is given), **Not needed** (has no counterpart in this app).

## 1.1.1

| # | Upstream change | Where upstream | Where here | Status |
|---|---|---|---|---|
| A1 | `rides` and `onBoard` default to on. Stores that never set them read as on | `UserStore.kt` | `userStore.ts` `DEFAULT_SETTINGS`; `legacyMigration.test.ts` | Done |
| A2 | A combined ride's badges show the first 3 lines, then "+N" | `Routes.kt` `CombinedBadges` | `routeCards.tsx` `CombinedBadges` | Done |
| A3 | The card's "+N more" is tappable: shows all departures, then "Show fewer" | `Routes.kt` `RideOptions` | `routeCards.tsx` `RideOptions` | Done |
| A4 | Docs: the advanced tools are on from the start | `docs/advanced-features.md` | `FEATURES.md`/`NOTES.md` don't claim otherwise | Done |

## 1.2.0 and 1.2.1: data and settings

| # | Upstream change | Where upstream | Where here | Status |
|---|---|---|---|---|
| B1 | `simpleMode` setting (off by default) | `UserStore.kt` | `userStore.ts` `Settings.simpleMode` | Done |
| B2 | `simpleButtons`: 5 buttons (Home, Family, Work, Heart, Shopping), each with icon, label and place; 15 icons | `UserStore.kt` `SimpleButton`, `SimpleIcon`, `DefaultSimpleButtons` | `userStore.ts` | Done |
| B3 | Home and Work buttons fall back to the full app's Home and Work | `UserStore.kt` `simpleSlots()` | `userStore.ts` `simpleSlots` | Done |
| B4 | Setting one button; an out-of-range index is ignored | `UserStore.kt` `withSimpleButton` | `userStore.ts` `Edits.setSimpleButton` | Done |
| B5 | The app language, stored as `settings.simpleLanguage` (EN, HE, RU; absent = the phone's) | `UserStore.kt` `AppLanguage` | `userStore.ts` reads `language`, else `simpleLanguage` | Done |
| B6 | versionCode 7 (1.2.1) | `build.gradle.kts` | `version.json`: 8 | Done |
| B7 | The current location is one place in any language (dedupe key) | `Models.kt` `Place.key` | `models.ts` `placeKey` | Done |
| B8 | Saved trips and route endpoints name the current location in the current language | `Strings.kt` `shownName` | Already so: `NavHome.tsx` `SavedTripRow`, `Routes.tsx` `nameOf` | Done |

## 1.2.1: the whole app in Russian

| # | Upstream change | Where upstream | Where here | Status |
|---|---|---|---|---|
| C1 | Every string of the full app in Russian | `i18n/StringsRu.kt` | `src/i18n/ru.ts` (same wording where the phrase is the same) | Done |
| C2 | Russian plurals (1 остановка, 3 остановки, 5 остановок) | `L10n.ruPlural` | `ru.ts` `plural`; `russian.test.tsx` | Done |
| C3 | Language picker in Settings: phone, English, עברית, Русский | `Settings.kt` | `Settings.tsx` (from `LANGUAGES`) | Done |
| C4 | A Russian phone gets Russian | `AppLanguage.forLocale` | `device.ts` `deviceLang` | Done |
| C5 | Russian is left to right | `AppLanguage.rtl` | `device.ts` `applyLanguage` | Done |
| C6 | Notification channels, the trip notification and the guide speak the language | `Notifications.kt`, `LiveTripService.kt`, `TripGuide.kt` | Already from `S` (the Hebrew work) | Done |
| C7 | Light rail is "трамвай" in Russian ("трамвай близко", "Ближайшие трамваи") | `StringsRu.kt` | `models.ts` `vehicleKind`: LIGHT_RAIL is its own kind; "train" in English and Hebrew, "трамвай" in Russian | Done |
| C8 | Text: the rest of the app's strings moved to i18n | all screens | Done in the Hebrew work; Hebrew and Russian leak tests | Done |
| C9 | Place names: Simple Maslul asks the geocoder in its language; the full app doesn't (English ranks matches worse) | `MaslulApp.kt` | The whole app asks in its language (`App.tsx` `repo.language`), as decided for Hebrew. Stop names come back in Hebrew either way | Different |
| C10 | Map labels | — (upstream shows the map's default labels) | `darkStyle.ts`: the app's language, Russian falling back to the local name | Different |
| C11 | iOS: location prompt and localisation list | — (Android only) | `locales/ru.json`, `CFBundleLocalizations` | Done |

## 1.2.1: planning

| # | Upstream change | Where upstream | Where here | Status |
|---|---|---|---|---|
| D1 | A lift is one drive: an itinerary with more than one car leg is dropped | `TransitousApi.kt` plan filter | `transitousApi.ts` plan filter; `parsing.test.ts` | Done |
| D2 | "The driver can take me up to…" plans with `preTransitModes = CAR` (driven right to the stop), not `CAR_DROPOFF` | `Rides.kt` `WITHIN_MODES`, `Routes.kt` | `routesModel.ts` `request` | Done |
| D3 | Grace: up to 3 min over the walk limit, or over the lift's minutes; kept only when 10 min sooner (arriving by: leaving 10 min later), or when nothing is within the limits | `Grace.kt` | `src/data/grace.ts` `Grace`; `grace.test.ts` | Done |
| D4 | Grace needs a second plan call with the limits raised by 3 min, merged with the main results | `Routes.kt` `fetch` | `routesModel.ts` `planWithRail` (the main request is sent first) | Done |
| D5 | Later/earlier pages are graced too | `Routes.kt` `more` | `routesModel.ts` `more` | Done |
| D6 | Cards over a limit are tagged "Longer walk" or "Longer ride" | `Routes.kt` tags | `Routes.tsx` | Done |
| D7 | WiderWalk: when nothing leaves within 2 h (or, arriving by, arrives within 2 h before), plan again with a 50-min walk and add what gets there 20 min sooner. Not for lifts, on-board or walk-only | `WiderWalk.kt`, `Routes.kt` `widenWalk` | `src/data/grace.ts` `WiderWalk`, `routesModel.ts` `widenWalk`; `grace.test.ts`, `appFlow.test.tsx` | Done |
| D8 | A note above the cards explains the longer walks | `Routes.kt` `WiderWalkNote` | `Routes.tsx` (`wider_walk_note`) | Done |
| D9 | The options sheet's walk slider explains the grace and the wider walk | `Routes.kt` options sheet | `routeSheets.tsx` `OptionsSheet` | Done |
| D10 | Cards leaving on another day than the one asked say which ("Tomorrow", "Sat, 10 Oct") | `Routes.kt` tags | `Routes.tsx`; `appFlow.test.tsx` | Done |
| D11 | Error kinds (location, no routes, network) for screens that word errors their own way | `Routes.kt` `RouteError` | `routesModel.ts` `errorKind` | Done |
| D12 | Trains: a headsign that is only a train number is replaced by where the trip ends (`tripTo`) | `TransitousApi.kt` `headsignOf` | `transitousApi.ts` `headsignOf`; `parsing.test.ts`. With no `tripTo`, upstream shows the bare number; the port already showed nothing there, and still does | Different |
| D13 | A ride without a number reads as "the train": "3 min to catch the train", "If missed, the next train at …" | `Strings` `theVehicle`, `theNextVehicle`, `nextLine` | `routeCards.tsx` `TransferWarning`, `en/he/ru.ts`; `routeCards.test.tsx` | Done |

## 1.2.0: Simple Maslul

| # | Upstream change | Where upstream | Where here | Status |
|---|---|---|---|---|
| E1 | Settings: a "Simple Maslul" switch with a confirmation dialog | `Settings.kt` | `Settings.tsx` (`simple_switch`, `simple_confirm`); `simple.test.tsx` | Done |
| E2 | With Simple Maslul on, the app opens in it, with no tab bar; back on its home leaves the app | `MainActivity.kt`, `AppState.kt` | `App.tsx`: its own navigator, remounted when the setting changes; Android Back on its home leaves the app (stack root). The live-trip banner is hidden there (it opens a full-app screen) | Done |
| E3 | Home: "Where are you going?", 5 place buttons in strong colours plus "Other address", 2 per row; a small Settings link | `SimpleHome.kt` | `src/ui/simple/SimpleScreens.tsx` `SimpleHomeScreen` | Done |
| E4 | A button with no place asks for its address first ("Where is “Grandkids”?"), then saves it to the button | `SimpleHome.kt` | `SimpleHomeScreen` `open`; `simple.test.tsx` | Done |
| E5 | Asks for location permission on opening | `SimpleHome.kt` | `SimpleHomeScreen` (`location.requestPermission`) | Done |
| E6 | Search: one big field, recents (6) when empty, results, "Nothing found", "No internet" | `SimpleSearch.kt` | `SimpleSearchScreen` | Done |
| E7 | Routes from the current location: up to 3 options (then "More options"), the first marked "Best"; no car rides; ones that left drop out; "Leave now / in N min / at 14:05 / tomorrow at 17:59 / on Sunday at 08:00"; Live mark; line badges; "Arrive at"; changes count | `SimpleRoutes.kt` | `SimpleRoutesScreen`, `leaveText`; `simple.test.tsx` | Done |
| E8 | A walk of up to 20 min is offered as its own card, before or after the rides depending on which arrives first | `SimpleRoutes.kt` | `SimpleRoutesScreen` `WalkCard` | Done |
| E9 | When every option has left, it searches again; errors in plain words with "Try again" | `SimpleRoutes.kt` | `SimpleRoutesScreen` (uses `errorKind`, D11) | Done |
| E10 | Trip: numbered plain steps (walk to the stop, take bus 18, towards, leaves at, platform, "Or: 22", get off at, ride N stops, you're there), live | `SimpleRoutes.kt` `SimpleTripScreen`, `SimpleSteps.kt` | `SimpleTripScreen`, `src/ui/simple/steps.ts`; `simple.test.tsx` | Done |
| E11 | Simple Settings: language (English, עברית, Русский), the buttons (name, picture, address, clear), "Switch to full Maslul" with a confirmation | `SimpleSettings.kt` | `SimpleSettingsScreen`. The language buttons set the app's language (no "phone" choice, as upstream). The edit dialog hides while its address search is open on top | Done |
| E12 | Simple Maslul's own plainer words in 3 languages | `SimpleStrings.kt` | `en/he/ru.ts` `simple` section, upstream's wording; Hebrew and Russian leak tests cover the Simple screens | Done |
| E13 | Hebrew right to left in Simple Maslul | `SimpleFrame` | The whole app is right to left in Hebrew (one reload), so Simple Maslul is too | Done |
| E14 | iOS: Simple Maslul must work there too | — | `TESTING-ios.md` I13; `TESTING.md` X1–X7 | Done (untested on a device) |

## Found while mapping (not new upstream)

| # | What | Status |
|---|---|---|
| F1 | The Kotlin app (1.1.0 already) shows "If you miss it: checking the next rides…" while it looks up the rides after a transfer; the port shows nothing until they arrive | Was already there, but in English only: now in `S.detail.missChecking` | Done |

## Checked file by file

Every file in `git diff --stat fab01ac 076af78 -- app/` (60 files) was checked against the rows above. The ones without a row of their own changed only to take their text from i18n (row C8): `AddressSearch.kt`, `Shuttles.kt`, `Fmt.kt`, `Common.kt`, `Live.kt`, `TransitMap.kt`, every screen in `ui/lines/` and `ui/nav/` apart from `Routes.kt` and `Settings.kt`, and `live/`. `docs/screenshots/simple/` are upstream's README pictures.

## Tests ported

| Upstream test | Here |
|---|---|
| `RideOptionsTest` (3 badges, +N, expand and collapse) | `routeCards.test.tsx` |
| `GraceTest` | `grace.test.ts` |
| `WiderWalkTest` | `grace.test.ts`; on screen, `appFlow.test.tsx` |
| `SimpleModeTest` | `simple.test.tsx` (plus the whole flow, offline) |
| `LocalizationTest` (language carries over, plurals, current-location key) | `legacyMigration.test.ts`, `russian.test.tsx` |
| `ParsingTest` (train headsigns) | `parsing.test.ts` |
| `RideShuttleSmokeTest.aLiftIsOneDrive` (live) | Offline instead: `parsing.test.ts` feeds the plan filter a two-drive itinerary |
| `TransitModeTest` (vehicle words by language, "the train") | `transitMode.test.ts` |
| `AppFlowTest.switchingLanguageRedrawsTheApp` | The app reloads on a language change (by design); covered by `hebrew.test.tsx` and `russian.test.tsx` |
