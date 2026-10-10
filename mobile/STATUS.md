# Maslul React Native rewrite: status

Branch `rewrite/react-native` (the owner pushes it to their fork). Development is complete, the Android app compiles, and three emulator rounds have run (below). Left: re-testing round 3's fixes, live buses on a device, and iOS on a Mac.

## Verified here (in the container, without a device)

| What | How |
|---|---|
| All Kotlin `data/` code ported to TypeScript | Strict `tsc` clean |
| Kotlin unit tests (all 15 files) ported | `npm test`: 25 suites, 176 tests pass |
| Old-store migration: every field and default, broken entries, once only, retry when unreadable | Unit tests plus a whole-app first-launch test |
| Parsers on real service responses (15 recorded fixtures, incl. a 3.6 MB SIRI snapshot) | Offline tests |
| Live services: Transitous plan/geocode/stop times, Stride, SIRI, Photon, Nominatim, ride and shuttle planning, on-board | `npm run test:live`: 18 pass. Time-dependent parts skip with a warning (Shabbat, night, Stride's day) |
| The Kotlin AppFlowTest scenarios (line search, planning, options, advanced switches, on-board, shuttles) plus route detail, trip, stations/stop, pick-on-map, About credits | Whole-app screen tests with native libraries mocked |
| Live directions logic: start, alerts once, stop, restore after restart | Tests against mocked location and notifications |
| Text and behaviour parity with the Kotlin UI | Every user-visible Kotlin string found in the port; every screen operation and navigation path matched |
| SDK versions; native modules linked | `expo install --check` clean; `expo-doctor` clean apart from 2 checks that need the blocked Expo API; autolinking lists every native library and `maslul-native` |
| Android config: `com.maslul.app`, versionCode 5, permissions, background location removed, release-signing patch | `expo prebuild` output inspected |
| JS compiles for both platforms | `expo export` to Hermes bytecode, Android and iOS |
| **Android native compile**: our Kotlin module, every library, the C++/NDK parts | `./gradlew assembleDebug assembleRelease` succeed. No compiler warnings from `maslul-native` |
| Maestro flows are valid | `maestro check-syntax` (Maestro 2.11.0) on all 11 flows and 3 sub-flows. Running them needs a device |
| Upgrade test is possible: debug builds of both apps share the machine's debug key | `apksigner` shows the same certificate on the Kotlin app's and this app's debug APKs |
| Built APKs: `com.maslul.app`, versionCode 5, arm64-v8a + x86_64; release has no debug-only permissions | `aapt2 dump badging`/`permissions`, `apksigner verify` on both APKs |

### Hebrew (branch `feature/hebrew`)

| What | How |
|---|---|
| Every string has a Hebrew version | `he.ts` is typed against `en.ts`: `tsc` clean |
| No English left on the main screens in Hebrew: Home, Settings, search, routes, Options, route details, Lines, a line and its timetable, Stations | `__tests__/hebrew.test.tsx`; 27 suites, 188 tests pass |
| First launch in Hebrew turns on right-to-left and reloads once | Same test, with the reload mocked |
| Plurals, gender and day names | Unit checks in the same test |

On the emulator (round 5, build 851a0b3): switching to Hebrew and back takes one reload; every screen, the map labels, a whole trip and its notification, the reminder toast and Share are Hebrew; right to left holds on every screen. The owner approved the Hebrew wording, with one change: Saturday reads יום שבת.

Fixed after round 5 and not yet re-tested (round 6 in `TESTING.md`):
- Place search in English: it asked the geocoders for English names, so a Hebrew town after the street stopped matching and names changed (2 Maestro flows failed). Search now sends no language, as in round 4.
- Language = System ignored a Hebrew phone: Android's "he_IL" didn't match the check.
- The exact-alarm dialog wasn't mirrored (Android's own dialog follows the phone): it's the app's dialog now.
- The live-directions notification channel was "Maslul" with an English description.
- The details header wrapped onto two lines in Hebrew; a train leg showed its number as its destination ("to 114"); Share had no screen-reader label; the bottom sheet's labels were English.

Not changed: the walking figure (mirrored in Hebrew; the tester read it as facing right), the cable-car icon (the Kotlin app's), MapLibre's own screen-reader labels (they follow the phone's language). Not verified: iOS.

## Verified on the Android emulator

A separate Claude session with mobile-mcp and adb ran `TESTING.md` on a Pixel 9 AVD (API 37, 2 GB RAM), on release build b0925a6 and earlier. Its report is `/share/maslul-test/report.md`.

- **Upgrade from the Kotlin app** (versionCode 4 → 5, `adb install -r`): Home/Work, favourite places, line and stop, shuttle, theme, walk speed, rail preference, the Advanced switches and the reminder lead all migrated. They survive a kill, and the old data isn't read again.
- Every tab opens and Back works, with no Maslul crash in `logcat -b crash`. Map tiles load in light and dark, with Hebrew and English names.
- Trip planning, the trip notification with its progress bar and "End trip", the trip with the screen locked and after a swipe from Recents, the arrival alert firing once, and Share.
- Shuttles: create, edit and delete persist. Dark theme on every screen.
- **Reminders:** without "Alarms & reminders" allowed (Android 14+ leaves it off) they are windowed: 52 s late in round 3, and allowed up to an hour for far-off trips. Once allowed they arrive on the second (round 3). The app now offers to open that setting; untested.

- **Maestro** (first run, 9 Oct 23:27, build b0925a6): 4 of 11 flows passed. Five failures were flow bugs, now fixed. Picking a search result matched the typed text in the field (Maestro ignores case). The "Still needed" line was under the keyboard. The slider swipe stops at 115 min, not 120. With the selector fixed, the host's rerun passed plan_trip, options_keep_routes and advanced_tools. One failure was an app bug: home_sheet, where the expanded Home sheet covered the search card. `MapSheet` sized itself by the window instead of its container above the tab bar, which also put the Home buttons over the map attribution. ride_within (rides on Shabbat) is still to be re-run.

- **Round 3** (10 Oct, Shabbat night, build 54cda38, 4 GB RAM): 13 pass, 3 fail. Passed: arrival sticking, times far away with their day, dark-map labels, the map attribution on Home, shuttle day ranges, edit after a cold start and the delete dialog, shuttle reminder text, the map after switching tabs (0.5 s). Maestro 9 of 11.

- **Round 4** (10 Oct, Shabbat, build 95c7ed3, 4 GB RAM): 25 pass, 3 fail, 1 couldn't test (live buses, Shabbat). Every round-3 fix passed: the trip guide on a simulated ride (stop countdown, "Get off now" at the stop with its alert, the walk after it, waiting at the boarding stop), the exact-alarm prompt with both answers and the exact alarm afterwards, line search on a weekend, ride within 15 min by hand, the day in the route header and in Share. Maestro 10 of 11.

Fixed after round 4 (passed in round 5 except where said):
- Ending a trip and starting another in the same session guided from where the last one ended, until the app was force-stopped. The "Get off now" alert stayed in the shade after End trip.
- ride_within failed in Maestro: "Fetch request has been canceled" 32 s into the search. The screen's lookups behind the shown routes (other lines on each hop, the ride after a tight transfer) all went to Transitous at once, and Transitous answers a client one request at a time. Here a ride search took 3 s alone and 18 s behind 16 others. With cold caches after clearState the queue passed the 30 s timeout. They now go two at a time, and are dropped once a newer search starts. A timeout now reads "took too long", not "Couldn't show the routes found".
- Share and the reminder said "Train Train" for a train (no line number).
- Not changed: the Options chip cut off at the edge when the time chip shows a day. The chip row scrolls sideways (Refresh stays fixed), and the cut-off chip is the sign of it.

- **Round 5** (10 Oct, Shabbat, build 851a0b3): 10 pass, 3 fail, 1 couldn't test. All four round-4 fixes passed: a trip started again three times in a row, no alert left after End, "Train from …", the chip row. The Hebrew results are above. ride_within stopped at the place search (finding above), so the ride-search timeout fix is still unchecked.

## Not verified yet

- **iOS native compile.** The Swift module and CocoaPods have never been built (needs a Mac).
- **Live vehicles** (SIRI brotli decoding at runtime) and green live times: every test session so far fell on Shabbat or at night.
- **Compass** after rotating (mobile-mcp has no two-finger gesture).
- **Blank map after switching back to Navigate** (known bug 6), seen only on the 2 GB emulator; re-test with more RAM.
- **iOS as a whole.**

## Phase B: build (done for Android)

Building Android needs JDK 17 and the Android SDK (platform 36, build-tools 36, NDK 27.1, CMake 3.22; Gradle downloads what's missing), and network access to `dl.google.com`, `maven.google.com`, `repo.maven.apache.org`/`repo1.maven.org`, `repo.reactnative.dev` (Maven Central redirects the React Native binaries there), `plugins.gradle.org`, `services.gradle.org` and `jitpack.io`.

```bash
cd mobile && npm ci && npm run prebuild
cd android && ./gradlew assembleDebug                         # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease                                     # debug-signed without keystore.properties
cd mobile/ios && pod install && cd .. && npm run ios          # on the Mac
```

For the emulator session: `npm run build:test-apk` builds the standalone APK and publishes it to the host handoff folder `/share/maslul-test` (Windows: `C:\Users\Raz\Desktop\CS\Claude\shared\maslul\maslul-test`). It goes there as `maslul-latest.apk`, with `TESTING.md`, the Maestro flows, the old Kotlin app (`maslul-kotlin-v4.apk`, signed with the same debug key) and `build-info.txt` (commit, configuration, checksums; written last). The tester writes `report.md` and `evidence/` there. `npm run publish:test` re-publishes the last build without rebuilding.

Or by hand: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`, then `npm start` for Metro (the debug build loads its JS from Metro). The release APK runs on its own.

## Phase C: device checklist

### Android emulator

1. `maestro test .maestro/` runs all 11 flows (the 3 shared steps in `subflows/` run from inside them). The shuttle ride-time slider is set by swipe; if that's flaky, set it by hand.
2. **Map.** Light and dark styles load. Attribution sits bottom-left. Rotate the map: the compass appears, and tapping it resets north. Your location and heading beam show. Live buses show on a line, glide between updates, and show labels.
3. **Live data.** On a line or stop screen during service hours, vehicles appear within about 30 s, and arrival times turn live (green).
4. **Live directions.** Start a route:
   - the notification shows the current step with a progress bar;
   - lock the screen and walk the emulator's route (Extended controls → Location → Routes): the steps advance and alerts fire once;
   - "End trip" in the notification stops it;
   - kill the app mid-trip: reopening shows the trip still running.
5. **Reminders.** "Remind me" on a route a few minutes out: the notification arrives on time.
6. **Back button.** Back from any screen returns to the previous one. On the Lines or Stations tab, Back goes to Navigate, then exits.

### Upgrade migration (most important)

Both builds must be signed with the same key. Two debug builds built on the same machine work: both use `~/.android/debug.keystore` (`plugins/withReleaseSigning.js` points this app's debug build there), so build the Kotlin app first, which creates it.

1. Install the Kotlin app (versionCode 4): `adb install app/build/outputs/apk/debug/app-debug.apk` from the repo root, after `sh gradlew assembleDebug` there (`gradlew` is committed without its execute bit).
2. In it, set Home and Work, add two favourite places, a favourite line, a favourite stop, a saved trip and a shuttle. Change the theme, walk speed and rail preference, and switch on both Advanced switches.
3. Install this app over it, without uninstalling (versionCode 5): `adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk`, or `npm run android`.
4. Everything from step 2 is there. Kill and reopen: still there, and the old data is not read again.
5. Change something, reopen: the change stays.

### iOS (Mac)

`pod install` and the build compile the Swift module. Then:
- the same flows and hand checks as Android, except the notification progress bar (iOS shows the blue location indicator instead);
- live vehicles (Swift brotli and JSON);
- a background trip with "while using the app" location permission;
- reminders.

### After that

Fix what the devices find. Then the owner signs a release build with `keystore.properties` (see README).

## History of this work

1. Phase A (development) is done:
   - parity review;
   - tests for migration, live trip and screens;
   - version alignment, which found `expo-asset` and `expo-font` missing as direct dependencies;
   - Maestro flows;
   - docs.
2. Phase B (Android build) is done: debug and release APKs build in the container. Changes it led to: the iOS SIRI parser reuses its date formatters, and the push and launcher-badge permissions that expo-notifications' libraries add are blocked (see NOTES.md).
3. Bugs the tests caught and that are fixed: an endless re-render in the map's vehicle gliding (it would have frozen the Line and Trip screens), and the two missing native dependencies above.
