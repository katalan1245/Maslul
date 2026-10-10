# Handover: Maslul React Native rewrite

Read this first. A fresh session should be able to start from this file alone. The details are in other files:
- `STATUS.md`: test history and what's been verified.
- `NOTES.md`: the design, deliberate changes from the Kotlin app, and the new features.
- `AGENTS.md`: repo rules.
- `TESTING.md`: the full Android pass.
- `TESTING-ios.md`: the iPhone pass.
- `FEATURES.md`: what's new compared with the original app, in user-facing words.

## The project

- **What it is:** the original Kotlin Android app (`/workspace/app`) rewritten in Expo SDK 57, React Native 0.86 and TypeScript in `/workspace/mobile`. It runs on Android and iOS, in English and Hebrew (full right-to-left).
- **It replaces the old app as an update:**
  - Same app id: `com.maslul.app`.
  - On first launch, `src/state/persist.ts` and the native `readLegacyStore` migrate the old app's data once. That can't be undone on users' phones, so the migration has to be right before release.
- **Native code:** `modules/maslul-native`, Kotlin for Android and Swift for iOS. It reads the old store, downloads and parses the live-bus snapshot off the JS thread, updates the trip notification, and checks exact alarms.
- **Licence:** AGPL-3.0. The About credits and the OSM/OpenFreeMap credit must stay.
- **Upstream:** the original developer's repo is `Tom-stack3/Maslul`. The user's goal is to test everything fully, port upstream's new versions, and eventually offer all of this to the original developer as a PR.

## Git state (2026-10-10)

| Branch | Local | Fork (`origin`) | What |
|---|---|---|---|
| `rewrite/react-native` | `f290b03` | `b4b5ca0` | The rewrite, Hebrew, iOS prep, and the five "daily rider" features. 220 tests |
| `master` | the fork's copy of the original | same | Behind upstream by 1.1.1 and 1.2.0 |

- **Not pushed yet:**
  - `6d8ff22`: TESTING.md and TESTING-ios.md as one full pass.
  - `f290b03`: FEATURES.md.
  - Push only when the user says yes. The Mac clones the fork, so it needs this push to get the newest `TESTING-ios.md`.
- **Remotes:**
  - `origin` is the user's fork, `katalan1245/Maslul`.
  - `upstream` is `Tom-stack3/Maslul`. **Never push there.**
- **Feature branches:**
  - The five features (offline routes, stops away, favourite stops, last bus, stop reminder) were combined in `feature/daily-rider`, one `--no-ff` merge each.
  - It was merged into `rewrite/react-native` as `b4b5ca0`: a local merge, pushed directly to the fork, with no PR.
  - All feature branches have been deleted. The user is done with feature branches for now.
- **History:** it was rewritten on 2026-10-10 to remove `Claude-Session:` lines, then force-pushed. PR #1 on GitHub still lists its 8 old commits; only GitHub Support can purge those.

## Rules from the user

- **Pushing, PRs, merging:** never push, open a PR or merge unless the user asks for it in the current request. Each push needs its own yes. Local commits are fine; say what's committed and ask about pushing.
- **Privacy:** no personal information in code, comments, docs or git messages, and no session links. Crediting Claude in commits is fine.
- **Commit identity:**
  - Author and committer are `Raz Katlan` / `61606539+katalan1245@users.noreply.github.com`.
  - Set them through the `GIT_AUTHOR_*` / `GIT_COMMITTER_*` env vars, never through git config. Never use any other email.
- **Release signing:** the user signs releases with a private `keystore.properties` that stays out of the repo and out of `/share`.
- **Container:** don't change the container or the firewall, and don't expose credentials.
- **Branches:**
  - Test fixes go straight on `rewrite/react-native`.
  - A new feature gets its own branch off it.
- **Code review:** the user decides when one runs. Don't start one on your own.
- **Agents:** keep fan-out small. Parallel review agents used up the session limit once without reporting anything.

## What's in `rewrite/react-native` now

Beyond the plain rewrite and Hebrew (see `FEATURES.md` for the user-facing list):
- **Offline routes** (`src/state/savedRoutes.ts`; `routesModel.ts` `savedAt`):
  - The routes from the last 5 searches (6 routes each) are saved.
  - A failed search shows them, without the ones that have already left, under the banner `saved_routes_banner`.
- **Stops away:** "N stops away" for a live bus (1–40 stops) on the trip guide and the stop board. The "board soon" alert also comes at 2 stops away.
- **Favourite stops on Home** (`src/ui/screens/favoriteStops.tsx`):
  - Up to 3 starred stops, nearest first, each with 3 lines.
  - It refreshes every 60 s while Home is focused and the app isn't in the background.
  - When a refresh fails, it keeps the last board and shows "updated …".
- **Last bus** (`src/data/lastBus.ts`; `routesModel.findLast`):
  - It runs on leave-now and depart-at searches from 20:00 (Friday from 12:00).
  - It makes one extra planner call for the next page, and only claims a last route when it sees a route after 04:00 with nothing in between.
  - The card gets the tag "Last today". When that route leaves within the hour, the banner `last_bus_banner` shows.
  - There's no holiday calendar, so holiday eves aren't covered.
- **Stop reminder** (`src/ui/components/reminders.tsx`; `remindToLeave` in `Stop.tsx`):
  - Long-press a departure on a stop's screen, or on Home's favourite stops, and choose "Remind me to leave".
  - The reminder time is the departure, minus the walk (straight line × 1.3 at the user's walk speed), minus the reminder minutes from Settings.
  - It shares the exact-alarm dialog with the route reminders.
- **Fixes:**
  - **Release builds:** `64f1a42` nests the iOS-only Hebrew strings in `locales/he.json` under `"ios"`. Top-level keys leak into Android and fail release lint (ExtraTranslation).
  - **iOS field text sat low:** `inputType()` in `theme.ts` drops `lineHeight` from TextInputs.
  - **The Places button floated on Home:** it's now in the buttons' row (`SheetButtons` in `NavHome.tsx`).
  - Both design fixes are in `2962923`.

**The user should review these Hebrew strings:**
- the two offline-routes strings: `routes.savedShown` and `routes.savedAllLeft`;
- "אחרון להיום";
- "האחרון להיום יוצא ב-… מהתחנה …";
- "תזכירו לי לצאת";
- "לחיצה ארוכה לתזכורת יציאה".

They should also check the wording of `FEATURES.md`.

## Known open items

- **Hardcoded English on Home:** the empty Recent hint ("Search for a place, or long-press the map to get directions there.") is written directly in `NavHome.tsx`, so Hebrew users see English. The Hebrew leak test misses it because the string isn't in `en.ts`. Fix: move it to i18n.
- **Narrow phones:** the row with "On a bus?", Places and the two round buttons may be tight. Not checked on a small screen.
- **Last bus on quiet nights:** unverified whether the planner's next page reaches past 04:00. If it doesn't, the feature just stays silent, which is safe.
- **The iOS text fix** hasn't been confirmed on the user's iPhone 17.

## Testing state

- **Checks here:**
  - `npx tsc --noEmit` is clean.
  - `npx jest --selectProjects app` passes 220 tests.
  - The `live` project calls real services; run it only on purpose.
- **Android, full pass:**
  - `TESTING.md` covers the whole app in sections U (upgrade from `maslul-kotlin-v4.apk`), N, P, L, T, R, S, A, H, V and M (11 Maestro flows).
  - Its APK, built from `6d8ff22`, is in `/share/maslul-test`, with an empty `report.md` and `evidence/`.
  - The tester is a separate Claude session on the Windows host, with mobile-mcp. It can't see `/workspace`, only `/share`.
- **iOS:**
  - The user has a Mac and an iPhone 17, and runs `TESTING-ios.md` (I1–I12) there with a Claude session. The report comes back through the user.
  - Some iOS build has already run, because the user saw the text offset on the iPhone. No full report has come back yet.
- **Never seen:**
  - Live buses: every test session fell on Shabbat or at night.
  - A real ride on a phone on a weekday. It's needed for real GPS, live buses, and battery savers stopping the trip service.

## The plan, in order

1. **Full test:**
   - Wait for the Android report (`/share/maslul-test/report.md` and `evidence/`) and the iOS report. Read them before fixing anything.
   - Fix on `rewrite/react-native`, add tests, commit, rebuild, and re-test only what failed.
   - Between rounds, archive the old report as described under "Build and environment".
2. **Port upstream 1.1.1 and 1.2.0.** This must happen before release and before any PR to the original. See the next section.
3. **Full code review,** when the user says so.
4. **A real weekday ride** with the release-like build.
5. **Release:** the user builds and signs it.
6. **PR to `Tom-stack3/Maslul`,** only when the user asks.

## Porting upstream (the original moved on)

The original released two versions on 2026-10-09, both for the Kotlin app only.

**1.1.1:**
- Route cards show at most 3 lines per ride.
- "Getting a ride" and "Already on a bus" are on by default: `rides` and `onBoard` default to `true`. Check what the migration does with users who never touched them.

**1.2.0, Simple Maslul:** an optional mode for older users ("made for grandparents"), turned on in Settings.
- A home screen with six big buttons for places, and plain step-by-step directions.
- Its own language setting: English, Hebrew or **Russian**. Russian exists only in Simple Maslul.
- New stored fields: `simpleMode`, `simpleLanguage` and the buttons (`SimpleIcon`).
- About 1,500 lines of Kotlin in `app/src/main/java/com/maslul/app/ui/simple/`. `SimpleStrings.kt` has all three languages.

**What it means for the rewrite:**
- **versionCode** must be **7 or more**. The original's is 6 and ours is 5 (`mobile/version.json`). Android refuses an update with a lower code.
- **The migration** (`persist.ts` and the native `readLegacyStore`) must carry the Simple Maslul fields and the new defaults. Add tests next to the existing migration tests.
- **Russian** is left to right. The i18n setup (`src/i18n/`, with typed key parity between `en.ts` and `he.ts`) can take a third language. There are two options; ask the user which:
  - **Simple Maslul only**, as the original does: copy the strings from `SimpleStrings.kt`. This is small.
  - **The whole app:** about 490 strings, plus Russian plurals (one/few/many: 1 остановка, 3 остановки, 5 остановок). A Russian speaker should check the wording.
- **Hebrew and RTL:** the Simple screens need the same RTL care and leak tests (`hebrew.test.tsx`) as the rest.
- **iOS:** the Simple screens must work there too, so add checks to `TESTING-ios.md` and to `TESTING.md`.

**How to bring it in:**
1. `git fetch upstream`, then fast-forward the local `master` to `upstream/master`. Pushing `master` to the fork needs a yes.
2. *Merge* (don't rebase) `master` into `rewrite/react-native`. Our branch doesn't touch `app/`, so there should be no conflicts.
3. Read the Kotlin diff (`git diff <old master>..master -- app/`) and port it to React Native on a branch such as `feature/simple-maslul`. 1.1.1 is small and can go straight on `rewrite/react-native`.
4. Don't add them to `FEATURES.md`: they come from upstream, so they aren't new compared with the original. Note the port in `NOTES.md` instead.

## Later ideas (not decided)

- **"Get off soon" alert:** the recommended next feature.
- A home-screen widget with the next departures, after release.
- Service alerts: strikes, detours and closures. First find a reliable free source.
- Share my trip live.
- A commute shortcut by time of day.
- The stop board on the lock screen.
- Shabbat and holiday awareness. It needs a Hebrew calendar, which would also let the last bus cover holiday eves.
- Crowding or reliability per line.
- **Dropped by the user:** a screen-reader pass.

## Build and environment

- **Test APK:**
  - In `mobile/`, run `JAVA_HOME=$HOME/jdk/jdk-17.0.20.1+1 ANDROID_HOME=$HOME/android-sdk npm run build:test-apk`.
  - It runs prebuild --clean, assembleRelease and `scripts/publish-test.sh`, and publishes to `/share/maslul-test` with `build-info.txt` written last.
  - It takes about 2 minutes. Check the log for `BUILD SUCCESSFUL`, not the exit code of a `tail`.
  - Commit first, or `build-info.txt` says "with uncommitted changes". An untracked file like this one counts.
- **Between test rounds:**
  - Archive `report.md`, `evidence/` and `maestro-report*.xml` as `*-roundN`, then leave an empty `report.md` and `evidence/`.
  - If renaming `evidence/` is refused (a host-side lock), copy it with `cp -r` and ask the user to clear the original.
- **iOS project here:** `npx expo prebuild -p ios --no-install` generates `ios/` for inspection. It's gitignored; delete it afterwards. There's no Xcode here, so iOS builds happen only on the user's Mac.
- **`android/`** is generated and gitignored.
- **Expo locales:** in `locales/*.json`, keys under `"ios"` go only to iOS. Top-level keys go to Android too.
- **The shell** is fish, so wrap Bash scripts in `bash -c`.
- **Tests:**
  - The fake repo is `__tests__/support/fakeRepo.ts`. Override it per test by assigning `fake.plan`, `fake.stopBoard` and so on.
  - App flows are in `appFlow.test.tsx`, Hebrew in `hebrew.test.tsx` (`launchHebrew`).
  - The i18n types enforce key parity between `en.ts` and `he.ts`.
