# Handover: Maslul React Native rewrite

Read this first. A fresh session should be able to start from this file alone. The details are in other files:
- `STATUS.md`: test history and what's been verified.
- `NOTES.md`: the design, deliberate changes from the Kotlin app, and the new features.
- `AGENTS.md`: repo rules.
- `TESTING.md`: the full Android pass.
- `TESTING-ios.md`: the iPhone pass.
- `FEATURES.md`: what's new compared with the original app, in user-facing words.
- `FEATURE-REQUESTS.md`: what the user wants next. **Local only, not in git** (ignored via `.git/info/exclude`); the user will turn them into GitHub issues later.
- `BUGS.md`: bugs the user reported, to fix later. **Local only, not in git**, like `FEATURE-REQUESTS.md`.
- `UPSTREAM-PORT.md`: every upstream 1.1.1–1.2.1 change and where it landed here.

## The project

- **What it is:** the original Kotlin Android app (`/workspace/app`) rewritten in Expo SDK 57, React Native 0.86 and TypeScript in `/workspace/mobile`. It runs on Android and iOS, in English, Hebrew (full right-to-left) and Russian.
- **It replaces the old app as an update:**
  - Same app id: `com.maslul.app`.
  - On first launch, `src/state/persist.ts` and the native `readLegacyStore` migrate the old app's data once. That can't be undone on users' phones, so the migration has to be right before release.
- **Native code:** `modules/maslul-native`, Kotlin for Android and Swift for iOS. It reads the old store, downloads and parses the live-bus snapshot off the JS thread, updates the trip notification, and checks exact alarms.
- **Licence:** AGPL-3.0. The About credits and the OSM/OpenFreeMap credit must stay.
- **Upstream:** the original developer's repo is `Tom-stack3/Maslul`. The user's goal is to test everything fully, port upstream's new versions, and eventually offer all of this to the original developer as a PR. That PR **restructures the repo**: the React Native app moves out of `mobile/` to the repo root and the Kotlin `app/` (with its Gradle files) is removed. Until then everything stays in `mobile/`.

## Git state (2026-10-11)

| Branch | Fork (`origin`) | What |
|---|---|---|
| `feature/upstream-1.2.1` | pushed up to `fc049e4` (the build under test). After it, 3 local doc commits (`00d9b9f`, `99549d6`, `58fc8e1`: how the iOS tester hands back its results), plus this handover; not pushed, the user hasn't said yes | **The branch under test.** Everything: the rewrite, its fixes, the upstream 1.1.1–1.2.1 port, the iOS round-1 fixes, round-6 fixes and the first feature requests. 275 tests |
| `rewrite/react-native` | pushed, `19875c5` | The rewrite and the iOS round-1 fixes, without the upstream port. Fully contained in the branch above |
| `master` | 3 commits behind the local one | Fast-forwarded to upstream's 1.2.1 (`076af78`), not pushed |

- Push only when the user says yes, each time. The Mac pulls `feature/upstream-1.2.1` from the fork.
- **Remotes:**
  - `origin` is the user's fork, `katalan1245/Maslul`.
  - `upstream` is `Tom-stack3/Maslul`. **Never push there.**
- **History:** it was rewritten on 2026-10-10 to remove `Claude-Session:` lines, then force-pushed. PR #1 on GitHub still lists its 8 old commits; only GitHub Support can purge those.

## Rules from the user

- **Pushing, PRs, merging:** never push, open a PR or merge unless the user asks for it in the current request. Each push needs its own yes. Local commits are fine; say what's committed and ask about pushing.
- **Privacy:** no personal information in code, comments, docs or git messages, and no session links. Crediting Claude in commits is fine.
- **Commit identity:**
  - Author and committer are `Raz Katlan` / `61606539+katalan1245@users.noreply.github.com`.
  - Set them through the `GIT_AUTHOR_*` / `GIT_COMMITTER_*` env vars, never through git config. Never use any other email.
- **Release signing:** the user signs releases with a private `keystore.properties` that stays out of the repo and out of `/share`.
- **Container:** don't change the container or the firewall, and don't expose credentials.
- **Branches:** the user tests both platforms together on `feature/upstream-1.2.1`, so fixes go there. Once a round passes, merge it into `rewrite/react-native` (ask first). On 2026-10-11 the user asked to start the feature requests on this branch too, skipping whatever needs them (those are done together).
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
- `home.recentHint`: "חפשו מקום, או לחצו לחיצה ארוכה על המפה כדי לקבל הוראות הגעה לשם." (it was hardcoded English before);
- the two offline-routes strings: `routes.savedShown` and `routes.savedAllLeft`;
- "אחרון להיום";
- "האחרון להיום יוצא ב-… מהתחנה …";
- "תזכירו לי לצאת";
- "לחיצה ארוכה לתזכורת יציאה";
- `common.tryRefresh`: "לחצו על רענון כדי לנסות שוב." (new with the iOS fixes).

And the Russian: all of `src/i18n/ru.ts` was translated here, so a Russian speaker should read it.

They should also check the wording of `FEATURES.md`.

## Known open items

- **Home with the map full screen:** the sheet goes down to a 64 px "PLACES" strip (`strip` on `MapSheet`) instead of away; the user disliked floating buttons. Round 7 is the first device look (Android N3, F9; iOS I12).
- **Last bus on quiet nights:** unverified whether the planner's next page reaches past 04:00. If it doesn't, the feature just stays silent, which is safe.
- **iOS round-1 fixes, none seen on a device yet** (I14 in `TESTING-ios.md`): Language = System via the native `preferredLanguage` constant; `writingDirection` on all text (`textDirection` in `theme.ts`); the app redrawing when the text size changes (`Fragment key={fontScale}` in `App.tsx`, nav state kept); Photon `lang=default`. Nominatim still follows iOS's Accept-Language (last fallback only).
- **To discuss with the user — the Markdown files.** Should the working docs (`HANDOVER`, `STATUS`, `UPSTREAM-PORT`, `TESTING*`, `FEATURES`, `scripts/START-HERE.md`) stay in git? Suggested: keep them in the fork for now (the Mac and the testers get them that way), and leave them out of the PR to the original repo: there only the code, the READMEs, `AGENTS.md` and a trimmed `NOTES.md` (e.g. `docs/architecture.md`) go; `FEATURES.md` and `UPSTREAM-PORT.md` become the PR description. The user hasn't decided.

## Round 7 (2026-10-11): what changed and what's waiting

- **Android round 6** (report in `/share/maslul-test/archive/round6/`): all 15 findings handled. #3 ("Last today" missing) is a known limitation, not fixed: the check looks one page ahead and night buses keep running. Fixes: same-name stops (`exactRadius`), details/share match the card (`keepRides`, live legs), the live guide's restart race and last-walk distance, page order, language/text-size keep the screen (`navMemory`, native `currentLanguage`, no reload for same direction), "Train Train", Back on the full map, re-granted location, reminders re-made exact (`rescheduleReminders`), star state and row labels, time wheels instead of the keyboard.
- **BUGS.md:** 1 (arrive-by with a lift) and 4 (fastest first; Options → "Show first") fixed. 2 (trains don't show) and 3 (routing) need the user's examples.
- **FEATURE-REQUESTS.md done:** 1 time wheels (`components/wheels.tsx`), 3 repeating shuttles (kept as plain times, shown as runs), 5 lift only to the driver's destination, 7 lift time (row in the ride sheet → time sheet), 9 search (stop codes via Stride + Transitous, near-first, own places first), 10 train-station icons (`Place.mode`). 8 express lines: the fast-lane shuttles 861–864 are ordinary buses in the MOT GTFS, so nothing to add (W7 checks it).
- **Left for doing together:** 2 design pass (needs the user's eye), 4 trip state (needs real rides), 6 traffic (no free traffic source; TomTom/HERE need an account and key), BUGS 2 and 3 (need examples).
- **Unverified natively:** the Kotlin/Swift `currentLanguage` (the APK build compiles the Kotlin), the wheels' feel on phones (snap, nested scrolling in the sheet, TalkBack/VoiceOver).
- **Round 7 has been run** on build `fc049e4` (APK published 2026-10-11 02:14 Israel time). See "Testing state" for where the reports are. **Next session: read both reports in full, then fix.**

## Testing state

- **Checks here:** `npx tsc --noEmit` is clean; `npx jest --selectProjects app` passes 275 tests. The `live` project calls real services (Transitous, Stride); run it only on purpose, e.g. `npx jest --selectProjects live __tests__/live/rideShuttle.test.ts`.
- **Round 7 (finished 2026-10-11), both on build `fc049e4`, versionCode 8:**
  - **Android:** the Windows-host session ran `/share/maslul-test/TESTING.md` (sections U, N, P, L, T, R, S, A, H, V, X, **W** new features, **F** one check per round-6 finding, M Maestro). Its report is `/share/maslul-test/report.md` with `evidence/` (written 08:26). Also there: `bash.exe.stackdump`, a crash dump of the tester's own shell, not the app; look at it only if the report mentions it. The tester can't see `/workspace`, only `/share`.
  - **iOS:** the Mac session ran `TESTING-ios.md` (I1–I15; I15 is the new features). It may also cover the round-2 checks whose report never arrived. Its results come back through the user: a Claude artifact link (read it with the Artifact tool's `read`, and `path: maslul-ios-results.zip` for the zip), or a zip the user hands over (put it in `/share/maslul-ios-test/` and unzip it into a fresh folder there; round 1 is archived there as `*-round1`). The hand-back instructions (zip + artifact) are in the 3 unpushed commits, so the Mac may not have had them; ask the user how the results came back.
  - Read both reports in full before fixing anything. Then: fix on `feature/upstream-1.2.1` with a test each, commit, archive the round (Android: move `report.md` and `evidence/` to `/share/maslul-test/archive/round7/`; iOS: `*-round2` names in `/share/maslul-ios-test/`), rebuild and publish (`JAVA_HOME=$HOME/jdk/jdk-17.0.20.1+1 ANDROID_HOME=$HOME/android-sdk npm run build:test-apk`, look for "BUILD SUCCESSFUL"; it publishes to `/share/maslul-test` and leaves `report.md`/`evidence/` alone, so create them empty afterwards), and write the next checklists (re-test what failed).
- **Things to watch for in the reports, untested before this round:** the time wheels (snap, scrolling inside the sheet, TalkBack/VoiceOver, Hebrew order, large text); the two Maestro flows that now tap wheel rows by position (`shuttle_missing`, `shuttle_save`: a failure there may be the flow, not the app); the native `currentLanguage` (Kotlin and Swift) behind F6/H4 and I9; lifts with arrive-by and "Only at their destination" (W2); stop-code search (W3); fast-lane line 861 (W7, data-dependent).
- **Results before this round:** Android rounds 1–6 (`STATUS.md`); iOS round 1: 12 pass, 3 fail, all fixed (`STATUS.md`, "Verified on iOS").
- **Never seen:** a real ride on a phone on a weekday (real GPS, live buses during a trip, battery savers stopping the trip service).

## Waiting on the user

- Examples for BUGS 2 (trains not showing) and 3 (routing): from, to, time, what showed, what was expected.
- Feature 6 (lift times with traffic): no free source; TomTom/HERE need an account and key. Keep or drop?
- Whether the working Markdown files stay in git (see "Known open items").
- A Russian speaker to read `src/i18n/ru.ts` (all written here, unreviewed).
- Pushing the 3 local doc commits and this handover.

## The plan, in order

1. **This test round** (above): read both reports, fix on `feature/upstream-1.2.1`, add tests, commit, rebuild, re-test only what failed. Archive each round as described under "Build and environment".
2. **Merge** `feature/upstream-1.2.1` into `rewrite/react-native` once it passes (ask first).
3. **Full code review,** when the user says so.
4. **A real weekday ride** with the release-like build.
5. **Release:** the user builds and signs it.
6. **PR to `Tom-stack3/Maslul`,** only when the user asks. It **restructures the repo**: the React Native app moves from `mobile/` to the root and the Kotlin `app/` and its Gradle files are deleted. Paths to fix then: the docs' `mobile/` and `/workspace/app` references, `scripts/publish-test.sh` (`../app` for the old Kotlin APK; `KOTLIN_121_APK` for the 1.2.1 one), the READMEs, any CI, and `.gitignore`.
7. **The rest of the feature requests** (`FEATURE-REQUESTS.md`, local; 2 design pass, 4 trip state, 6 traffic), together with the user. The user had them started early on this branch (2026-10-11).

## Porting upstream (done, untested on devices)

Upstream released 1.1.1, 1.2.0 (Simple Maslul) and 1.2.1 (the whole app in Russian, grace, wider walk, one-drive lifts). [UPSTREAM-PORT.md](UPSTREAM-PORT.md) maps every change, file by file, to where it lands here and marks the deliberate differences; `NOTES.md` has the summary.

- **versionCode** is 8 (upstream's 1.2.1 is 7).
- **Russian** covers the whole app, translated here: a Russian speaker should read `src/i18n/ru.ts`. Where upstream had the same phrase (`StringsRu.kt`, `SimpleStrings.kt`) its wording is used.
- **Simple Maslul** lives in `src/ui/simple/` and follows the app's language (upstream gives it its own).
- **Not covered by automated tests:** the location-permission prompt on Simple's home (E5), real layout on phones, iOS.
- Not in `FEATURES.md`: these come from upstream.

## Feature requests and ideas

In `FEATURE-REQUESTS.md` (local only, not in git), with each one's status there. Done on 2026-10-11: 1, 3, 5, 7, 8 (nothing needed), 9, 10. Open, to do with the user: 2 design pass, 4 trip state, 6 traffic.

## Build and environment

- **Test APK:**
  - In `mobile/`, run `JAVA_HOME=$HOME/jdk/jdk-17.0.20.1+1 ANDROID_HOME=$HOME/android-sdk npm run build:test-apk`. To refresh the Kotlin 1.2.1 APK too, set `KOTLIN_121_APK` to an `assembleDebug` build of `master` (made in a temporary `git worktree`; it's already in `/share`, so normally not needed).
  - It runs prebuild --clean, assembleRelease and `scripts/publish-test.sh`, and publishes to `/share/maslul-test` with `build-info.txt` written last.
  - It takes about 2 minutes. Check the log for `BUILD SUCCESSFUL`, not the exit code of a `tail`.
  - Commit first, or `build-info.txt` says "with uncommitted changes".
  - All test APKs are signed with the debug key `~/.android/debug.keystore` (SHA-256 `1a5ac6dd…`), so each installs over the others.
- **Between test rounds:**
  - Move `report.md` and `evidence/` into `archive/roundN/` (as `report.md` and `evidence/`), then leave an empty `report.md` and `evidence/`. The folder's top level stays: `START-HERE.md`, `TESTING.md`, the three APKs, `build-info.txt`, `maestro/`, `report.md`, `evidence/`, `archive/`.
  - If renaming `evidence/` is refused (a host-side lock), copy it with `cp -r` and ask the user to clear the original.
- **iOS project here:** `npx expo prebuild -p ios --no-install` generates `ios/` for inspection. It's gitignored; delete it afterwards. There's no Xcode here, so iOS builds happen only on the user's Mac.
- **`android/`** is generated and gitignored.
- **Expo locales:** in `locales/*.json`, keys under `"ios"` go only to iOS. Top-level keys go to Android too.
- **The shell** is fish, so wrap Bash scripts in `bash -c`.
- **Tests:**
  - The fake repo is `__tests__/support/fakeRepo.ts`. Override it per test by assigning `fake.plan`, `fake.stopBoard` and so on.
  - App flows are in `appFlow.test.tsx`, Hebrew in `hebrew.test.tsx` (`launchHebrew`).
  - The i18n types enforce key parity between `en.ts`, `he.ts` and `ru.ts`.
  - Russian in `russian.test.tsx`, Simple Maslul in `simple.test.tsx`.
