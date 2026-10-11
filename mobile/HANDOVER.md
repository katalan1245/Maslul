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
| `feature/upstream-1.2.1` | pushed up to `c796b7c` (2026-10-11): round 9 (Android, APK from `0fd27de`, same code) and iOS round 4 test it | **The branch under test.** Everything: the rewrite, its fixes, the upstream 1.1.1–1.2.1 port, the iOS fixes, round-6 and round-7 fixes and the first feature requests. 293 tests |
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

## Round 10 (2026-10-12): Android round 9 and iOS round 4 read and fixed

- **Testing rule from the user (2026-10-12):** test rounds re-test **only what changed**. No sanity passes (install checksums, crash-log dumps, Maestro, the "known" list); the testers report only on the listed checks. Keep `TESTING.md` and `TESTING-ios.md` that short.
- **Fixed, each with a test:** `6808c40` "variants" bidi (a mark after the agency name too); `0ce9ddc` a stale vehicle report no longer predicts the bus at "now" (`eta.ts`: the distance floor counts from a report at most a minute old), so "is arriving · 6 stops away" is gone in the guide, the cards and the ranking; `3401dca` `ranked()` applies the live order (`liveOrder`), so re-ranking between live refreshes no longer puts a gone bus first; `d49f6ba` `choose` moves the walk after any switched ride, and `nextIfPassed` re-picks later rides the new bus no longer reaches and asks `repo.ridesAfter` when the plan has no later run.
- **Not fixed:** K5's train step (a delayed train's get-off time after the next step's departure; "+11 min" for a train 3 min later): needs a look at live train `alightExpected`. Place search "No results" for 4–10 s before results (Search.tsx sets `loading` before the call; cause not found). The `ExpoModulesCore` invalidated-callback log after a language reload (harmless).
- **K6/L7 was a checklist mistake:** the Kotlin app opens stops only from the Home map (`NavHome.kt`); line maps follow vehicles. Stop taps on line/route maps would be a new feature; ask the user.
- **Round 10 checklists:** Android N1–N4, iOS round 5 P1–P3. Archives: `/share/maslul-test/archive/round9/`, `/share/maslul-ios-test/*-round4`.

## Round 9 (2026-10-11): Android round 8 and iOS round 3 read and fixed

- **Android round 8** (`/share/maslul-test/archive/round8/`; summary in `STATUS.md`). Fixed, each with a test: G5 `9f13a82` (Leave now ranks first only a route you reach before its bus, without the 90 s slack), G6 `78ef314` (`ActiveTrip.nextIfPassed`: the started trip takes the step's next catchable bus when its bus passes before you board; `RouteDetailModel.adopt` follows it), G11 `cdb8f33` (Stations watches the position every 10 s while focused), G2 `e331129` (a direction mark before the agency on line rows). Plus upstream's map taps `5d787d2`.
- **Not bugs / not changed:** G1's two `Running "main"` lines (Android recreating the activity, then our one reload); the inexact Not-now reminder (same Android call as Kotlin; the prompt says it may be late). Both, and the round's minors, are in TESTING.md's "Known" item 15.
- **iOS round 3** (results page plus a small zip in the user's Claude app; summary saved as `/share/maslul-ios-test/ios-report-round3.md`, no screenshots here): 13 pass, 0 fail. Fixed in `4a5d5bf`: a gone bus shown as arriving (`rideGone` in `tripGuide.ts`, used by `nextIfPassed`), Remind me twice (`cancelReminder`), "trains of Train". `TESTING-ios.md` round 4 (L1–L7) re-tests everything since 3791f6f.
- **Round 9 Android checklist:** `TESTING.md` section K (K1–K6) and M1. The top-level `/share/maslul-test/bash.exe.stackdump` (and the one in `maestro/`) are the host's Git Bash dumps; left in place.

## Round 8 (2026-10-11): what changed and what's waiting

- **Round 7 reports** (Android: `/share/maslul-test/archive/round7/`; iOS: `/share/maslul-ios-test/ios-report-round2.md`, `evidence-round2/`, `logs-round2/`; the iOS tester calls it "round 3" inside). Fixed, each with a test:
  - Language: H4 blank screen after the phone goes Hebrew (`applyLanguage` waits for the rebuilt screen to settle before `reloadAppAsync`); a reload from Settings comes back to Settings (`language_from_settings_v1`); map labels follow a change without a reload (`mapStyle` caches the style without labels).
  - Guide and naming: the guide never moves ahead of a ride that hasn't left (`notAheadOfRides`); "Train Train" (`modeLine`/`rideName` in `fmt.ts`); reminders use one `departs` time; reminders re-armed on every Android launch.
  - Routes: a 429 with only shuttle routes shows `search_failed_banner`; Leave now sorts catchable first; refresh keeps the chosen time; the Walk card counts from the chosen time.
  - Shuttles: a one-time departure after 19:00 can be added; a shuttle taken all the way offers its first departure (it was merged into the later one). A shuttle ride goes by its own name ("Bus Test Shuttle" before).
  - "Last today": not when another bus follows within 60 min, nor on another calendar day.
  - Smaller: "N variants" translated; Photon train stations get the train icon; duplicate nearby stops; Stations re-looks-up after moving 500 m and drops its list when location is revoked; Simple's Clear on Home/Work; no Current location for both ends; board row "then" times deduped; the ride card's drop-off time; Home's sheet scrolls back when it shrinks; the wheels are one TalkBack control; Maestro flows set the Advanced switches (both on after a fresh install, as in Kotlin).
- **Not fixed, listed as known in the checklists:** T1's re-timed trip after the bus passes (only the guide part fixed; needs a real ride to see), Home with only the map (no trigger found), English station names in Stations search (Transitous has Hebrew only), and the minors: Simple's quote marks, P6's 2 h 31 route, P5 offline drops, Stations' slow spinner, the long-press menu position, share bidi, largest-font overlaps; iOS: XL time wrap, Hebrew phone + English app mirroring, no foreground banner, "Start" on a restored trip, Russian Options button, small cuts.
- "חלופות" (line variants): approved by the user.
- **Unverified on devices:** everything above, especially the H4 settle wait, TalkBack on the wheels, re-armed reminders and the Maestro `checked` selector.

## Testing state

- **Checks here:** `npx tsc --noEmit` is clean; `npx jest --selectProjects app` passes 293 tests. The `live` project calls real services (Transitous, Stride); run it only on purpose, e.g. `npx jest --selectProjects live __tests__/live/rideShuttle.test.ts`.
- **Round 8 (started 2026-10-11 by the user, both on `3791f6f`):** a short re-test of what failed.
  - **Android:** `/share/maslul-test/TESTING.md` (section G, G1–G12, and Maestro M1), APK published 2026-10-11 with clean `build-info.txt`. The report lands in `/share/maslul-test/report.md` with `evidence/` (both empty until then). The tester can't see `/workspace`, only `/share`.
  - **iOS:** `TESTING-ios.md` round 3 (J1–J9). Results come back through the user: a Claude artifact link (read it with the Artifact tool's `read`; `path: maslul-ios-results.zip` for the zip, or `paths` for single files), or a zip the user attaches. Unzip into a fresh folder under `/share/maslul-ios-test/` (rounds 1–2 are archived there as `*-round1`, `*-round2`).
- **Next session, when the user brings the results:**
  1. Read both reports in full (and look at the evidence a finding cites) before fixing anything.
  2. Fix on `feature/upstream-1.2.1`, a test for each (check it fails without the fix), `npx tsc --noEmit` and `npx jest --selectProjects app`, commit.
  3. Archive: Android: move `report.md` and `evidence/` to `/share/maslul-test/archive/round8/`, leave an empty `report.md` and `evidence/`. iOS: rename to `ios-report-round3.md`, `evidence-round3/`, `logs-round3/`.
  4. Update the checklists in the repo, `mobile/TESTING.md` (published to `/share` by the build; don't draft it in `/share`, the publish overwrites it, also any `TESTING.md.tmp`) and `mobile/TESTING-ios.md`, re-testing only what failed. Commit them **before** building, or `build-info.txt` says "with uncommitted changes".
  5. Rebuild and publish: in `mobile/`, `JAVA_HOME=$HOME/jdk/jdk-17.0.20.1+1 ANDROID_HOME=$HOME/android-sdk npm run build:test-apk` (about 15 min; run it in the background; look for "BUILD SUCCESSFUL" in the log).
  6. Update this file and `STATUS.md`; ask the user about pushing.
- **Committing:** set the identity only through env vars, never `git config`: `GIT_AUTHOR_NAME`/`GIT_COMMITTER_NAME` = `Raz Katlan`, `GIT_AUTHOR_EMAIL`/`GIT_COMMITTER_EMAIL` = `61606539+katalan1245@users.noreply.github.com`; end the message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No personal info or session links in code, comments, docs or commit messages.
- **Tests that fit this codebase:** screen flows render `<App />` with `jest.mock('../src/state/services', () => ({ repo: require('./support/fakeRepo').makeFakeRepo() }))` and override the fake's fields per test; repository logic can use `new TransitRepository(null as never)` when nothing reaches the network. A test that changes `expo-location` mocks or `location.report` leaks into later tests in the same file: give it its own file (as `stationsNearby.test.tsx`).
- **Results before this round:** Android rounds 1–7 (`STATUS.md`); iOS rounds 1–2 (`STATUS.md`, "Verified on iOS").
- **Never seen:** a real ride on a phone on a weekday (real GPS, live buses during a trip, battery savers stopping the trip service).

## Waiting on the user

- Examples for BUGS 2 (trains not showing) and 3 (routing): from, to, time, what showed, what was expected.
- Feature 6 (lift times with traffic): no free source; TomTom/HERE need an account and key. Keep or drop?
- Whether the working Markdown files stay in git (see "Known open items").
- A Russian speaker to read `src/i18n/ru.ts` (all written here, unreviewed).

## The plan, in order

1. **Round 8** (above): run it, read both reports, fix on `feature/upstream-1.2.1`, add tests, commit, rebuild, re-test only what failed. Archive each round as described under "Build and environment".
2. **Merge** `feature/upstream-1.2.1` into `rewrite/react-native` once it passes (ask first).
3. **Full code review,** when the user says so.
4. **A real weekday ride** with the release-like build.
5. **Release:** the user builds and signs it.
6. **PR to `Tom-stack3/Maslul`,** only when the user asks. It **restructures the repo**: the React Native app moves from `mobile/` to the root and the Kotlin `app/` and its Gradle files are deleted. Paths to fix then: the docs' `mobile/` and `/workspace/app` references, `scripts/publish-test.sh` (`../app` for the old Kotlin APK; `KOTLIN_121_APK` for the 1.2.1 one), the READMEs, any CI, and `.gitignore`.
7. **The rest of the feature requests** (`FEATURE-REQUESTS.md`, local; 2 design pass, 4 trip state, 6 traffic), together with the user. The user had them started early on this branch (2026-10-11).

## Porting upstream (done, untested on devices)

Upstream released 1.1.1, 1.2.0 (Simple Maslul) and 1.2.1 (the whole app in Russian, grace, wider walk, one-drive lifts). [UPSTREAM-PORT.md](UPSTREAM-PORT.md) maps every change, file by file, to where it lands here and marks the deliberate differences; `NOTES.md` has the summary.

- **versionCode** is 9 (upstream's 1.2.2 is 8).
- **Russian** covers the whole app, translated here: a Russian speaker should read `src/i18n/ru.ts`. Where upstream had the same phrase (`StringsRu.kt`, `SimpleStrings.kt`) its wording is used.
- **Simple Maslul** lives in `src/ui/simple/` and follows the app's language (upstream gives it its own).
- **Not covered by automated tests:** the location-permission prompt on Simple's home (E5), real layout on phones, iOS.
- Not in `FEATURES.md`: these come from upstream.
- **After 1.2.1** (checked 2026-10-11): finger-sized map taps (`cf51350`) ported (U1). **1.2.2** (`6ce84e5`, 2026-10-12) ported (V1–V11 in `UPSTREAM-PORT.md`). Re-check `git fetch upstream; git log master..upstream/master` before the PR.

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
