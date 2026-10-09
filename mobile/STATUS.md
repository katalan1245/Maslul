# Maslul React Native rewrite: status

Branch `rewrite/react-native`, local commits only (never pushed). Development is complete, the Android app compiles, and two emulator rounds have run (below). Left: re-testing the fixes, Maestro and live buses on a device, and iOS on a Mac.

## Verified here (in the container, without a device)

| What | How |
|---|---|
| All Kotlin `data/` code ported to TypeScript | Strict `tsc` clean |
| Kotlin unit tests (all 15 files) ported | `npm test`: 23 suites, 173 tests pass |
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

## Verified on the Android emulator

A separate Claude session with mobile-mcp and adb ran `TESTING.md` on a Pixel 9 AVD (API 37, 2 GB RAM), on release build b0925a6 and earlier. Its report is `/share/maslul-test/report.md`.

- **Upgrade from the Kotlin app** (versionCode 4 → 5, `adb install -r`): Home/Work, favourite places, line and stop, shuttle, theme, walk speed, rail preference, the Advanced switches and the reminder lead all migrated. They survive a kill, and the old data isn't read again.
- Every tab opens and Back works, with no Maslul crash in `logcat -b crash`. Map tiles load in light and dark, with Hebrew and English names.
- Trip planning, the trip notification with its progress bar and "End trip", the trip with the screen locked and after a swipe from Recents, the arrival alert firing once, and Share.
- Shuttles: create, edit and delete persist. Dark theme on every screen.
- **Reminders arrive, but late:** ~1 m 45 s (windowed alarms; see NOTES.md). The exact-alarm permission has been added since and is untested.

Fixed after that round and not yet re-tested: the trip guide stuck on "Get off now", arrival not sticking, "Bus in 1208 min", dim dark-map labels, the Home buttons over the map attribution, shuttle delete confirmation and day ranges. The list is in NOTES.md, "Deliberate changes".

## Not verified yet

- **iOS native compile.** The Swift module and CocoaPods have never been built (needs a Mac).
- **Live vehicles** (SIRI brotli decoding at runtime) and green live times: every test session so far fell on Shabbat or at night.
- **Compass** after rotating (mobile-mcp has no two-finger gesture).
- **Maestro flows** on a device: the 2 GB emulator's low-memory killer stops Maestro's driver, and mobile-mcp holds the UI-automation slot it needs.
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
