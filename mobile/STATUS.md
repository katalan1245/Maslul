# Maslul React Native rewrite: status

Branch `rewrite/react-native`, local commits only (never pushed). Development is complete. What's left needs a real device (Phase B/C below).

## Verified here (in the container, without a device)

| What | How |
|---|---|
| All Kotlin `data/` code ported to TypeScript | Strict `tsc` clean |
| Kotlin unit tests (all 15 files) ported | `npm test`: 21 suites, 167 tests pass |
| Old-store migration: every field and default, broken entries, once only, retry when unreadable | Unit tests plus a whole-app first-launch test |
| Parsers on real service responses (15 recorded fixtures, incl. a 3.6 MB SIRI snapshot) | Offline tests |
| Live services: Transitous plan/geocode/stop times, Stride, SIRI, Photon, Nominatim, ride and shuttle planning, on-board | `npm run test:live`: 18 pass. Time-dependent parts skip with a warning (Shabbat, night, Stride's day) |
| The Kotlin AppFlowTest scenarios (line search, planning, options, advanced switches, on-board, shuttles) plus route detail, trip, stations/stop, pick-on-map, About credits | Whole-app screen tests with native libraries mocked |
| Live directions logic: start, alerts once, stop, restore after restart | Tests against mocked location and notifications |
| Text and behaviour parity with the Kotlin UI | Every user-visible Kotlin string found in the port; every screen operation and navigation path matched |
| SDK versions; native modules linked | `expo install --check` clean; `expo-doctor` clean apart from 2 checks that need the blocked Expo API; autolinking lists every native library and `maslul-native` |
| Android config: `com.maslul.app`, versionCode 5, permissions, background location removed, release-signing patch | `expo prebuild` output inspected |
| JS compiles for both platforms | `expo export` to Hermes bytecode, Android and iOS |

## Not verified yet (needs the device environment)

- **Native compile.** Gradle, the Kotlin and Swift code in `modules/maslul-native`, and CocoaPods have never been built.
- **Anything on screen.** Map look and gestures, the bottom sheets, the dark theme, icons, splash, keyboard behaviour.
- **Native module at runtime.** SIRI brotli decoding and parsing, the old-store read on a real upgrade, the live-trip notification with progress and "End trip".
- **Live directions in the background,** with the screen off, through the foreground service.
- **Reminders** firing on time.
- **iOS as a whole.**

## Phase B: build (first thing in the device environment)

Gradle needs network access to `dl.google.com`, `maven.google.com`, `repo.maven.apache.org`/`repo1.maven.org`, `plugins.gradle.org` and `services.gradle.org`, plus JDK 17 and the Android SDK.

```bash
cd mobile && npm ci && npm run prebuild && npm run android     # debug build onto the emulator
cd mobile/ios && pod install && cd .. && npm run ios           # on the Mac
```

## Phase C: device checklist

### Android emulator

1. `maestro test .maestro/` runs all 11 flows (plus 3 shared sub-flows). The shuttle ride-time slider is set by swipe; if that's flaky, set it by hand.
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

Both builds must be signed with the same key. Two debug builds work, since both use the default debug keystore.

1. Install the Kotlin app: `./gradlew installDebug` from the repo root (versionCode 4).
2. In it, set Home and Work, add two favourite places, a favourite line, a favourite stop, a saved trip and a shuttle. Change the theme, walk speed and rail preference, and switch on both Advanced switches.
3. Install this app over it, without uninstalling: `npm run android` (versionCode 5).
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
2. Bugs the tests caught and that are fixed: an endless re-render in the map's vehicle gliding (it would have frozen the Line and Trip screens), and the two missing native dependencies above.
