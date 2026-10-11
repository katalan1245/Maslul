# Maslul: emulator test instructions

You are a Claude session with tools (an MCP) that control an Android emulator. You are testing a new build of **Maslul**, an Israeli public-transport app (route planning, lines, stops, live buses on a map). It is a React Native rewrite of an older Kotlin app and replaces it as an update: same app id `com.maslul.app`. Your job is to **find and report bugs, not fix them**. The code lives in another Claude session, which fixes what you report and sends new builds.

**Do everything yourself. Never ask the human to tap, type, install or check anything.** Decide for yourself when the UI is ambiguous, write down what you decided, and keep going. Run this file from top to bottom in one go and finish with the report.

## Files in this folder

The folder is `maslul-test` in the host's handoff folder (`C:\Users\Raz\Desktop\CS\Claude\shared\maslul\maslul-test`). Write your report and evidence here.

| File | What it is |
|---|---|
| `maslul-latest.apk` | The new app: versionCode 8, standalone release build (no Metro needed), from branch `feature/upstream-1.2.1` |
| `maslul-kotlin-v4.apk` | The **old** Kotlin app (versionCode 4), not used this round |
| `maslul-kotlin-1.2.1.apk` | The Kotlin app's last version, 1.2.1 (versionCode 7), not used this round |
| `build-info.txt` | Commit and build details. Quote the commit line at the top of your report |
| `maestro/` | Automated UI flows (Maestro), also readable as step-by-step scripts |
| `TESTING.md` | This file: the only instructions |
| `START-HERE.md` | A pointer to this file |
| `report.md` | Empty: **write your report here** |
| `evidence/` | Empty: **put every screenshot and log here** |
| `archive/` | Earlier rounds. **Don't read or use it**: those builds and findings are out of date, and everything still open is in this file |

All three APKs are signed with the same key, so the new one installs over either old one as an update.

## Rules

- Don't modify, rebuild or re-sign the APKs, and don't push anything anywhere.
- Take a screenshot at every check, named after the check (e.g. `B3-route-header.png`), and keep it in `evidence/`.
- A failure is a finding: record it and go on. Don't stop at the first failure.
- A missing file or tool only blocks the checks that need it. Only M1 needs `maestro/`. Mark those **couldn't test** and do every other check. Never end the run because one thing is missing.
- If a check is impossible, mark it **couldn't test** with the exact reason. Never skip silently.
- Keep what you **saw** separate from what you **guess** about the cause.
- The emulator was unstable last round: the launcher restarted, Play services crashed, and Android soft-restarted. If something odd happens right after one of those, repeat the check once before you report it, and say in the report whether it happened again.

## Tools: how to do what mobile-mcp can't

Use `adb` from a shell if you have one. If a command isn't available to you, mark the check **couldn't test** and give the reason.

| Need | How |
|---|---|
| Crash log | After each section, dump it: `adb logcat -b crash -d`, and the app's JS log with `adb logcat -d -t 3000 ReactNativeJS:V AndroidRuntime:E '*:S'` (save both to `evidence/`) |
| Lock / unlock the screen | `adb shell input keyevent KEYCODE_SLEEP`, then `adb shell input keyevent KEYCODE_WAKEUP` and swipe up |
| Recents | `adb shell input keyevent KEYCODE_APP_SWITCH`, then swipe Maslul's card up |
| Move the location | `adb emu geo fix <longitude> <latitude>`, repeated every few seconds along the route |
| Find an element with no visible text | `adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml`. Ids include `settings_button`, `my_shuttles`, `add_shuttle`, `rides_switch`, `on_board_switch`, `on_board`, `home_map_expand`, `shuttle_delete` |

## Set up

1. Set the emulator's **time zone to Israel**: Settings → System → Date & time → turn off automatic time zone → choose Jerusalem/Israel.
   - Last round it was UTC, which caused the time bugs below.
   - Write the time zone and the Israel time at the top of your report.
2. Location in Tel Aviv: `adb emu geo fix 34.7818 32.0853`.
3. **Buses don't run on Shabbat** (Friday evening to Saturday evening, about 19:00 Israel time) or at night. Mark the checks that need running buses **couldn't test (Shabbat)** if that's the case; don't count them as failures.

## Known and not being changed (don't report again)

1. The line timetable shows yesterday's date early in the day, while Stride hasn't loaded today's feed yet. The old app does the same. Over a weekend it can be Thursday's.
2. "Leave now" late in the evening lists tomorrow's routes, because tonight's buses are over. The old app does the same; the new one puts the day in front of the time.
3. The notification permission is asked on the first trip Start, as in the old app.
4. Line search "1" lists lines from all over the country in Stride's order, as in the old app.
5. On the stop screen, the Directions button covers a row until you scroll to the end; the list leaves room below its last row.
6. The low-memory killer on a 2 GB emulator closes Maslul (and Maestro). That's the environment, not the app.
7. The map's credits dialog (from the (i)) is MapLibre's own and stays light in the dark theme.
8. Right after a cold start, a tap on a shuttle in My shuttles can be missed once (1 in 4 last round); the second tap works.
9. The cable-car chip's icon (a seated figure) is the one the old app used; there's no cable-car icon in the app's icon set.
10. MapLibre's own screen-reader labels ("Showing a Map created with MapLibre…", the (i)) follow the phone's language, not the app's.
11. "Get off at the next stop" posts a heads-up alert, as "Get off now" does. The old app did the same.
12. The walking figure is mirrored in Hebrew: in English it reaches to the right, in Hebrew to the left. Compare with an English screenshot before reporting it.
13. Stations search in English for a train station ("Tel Aviv Center") finds nothing: the timetable data names stops in Hebrew only. Search in Hebrew.
14. Still open from last round, not changed in this build (don't report again): quote marks around a Hebrew stop name in Simple's steps; an odd 2 h 31 route and missing day prefixes in P6; the offline list (P5) drops the Walk card, the "Last today" tag and the banner; Stations shows a spinner for 10–15 s when it opens; the stop's long-press menu sits at the top right; the share preview's bidi order; at the largest font the "Shortest trip" tag overlaps "leave in" and the Options chip is cut; Home once came back with only the map (report it again only with the exact steps that lead to it).
15. From round 8, not changed (don't report again): a phone-language switch logs two `Running "main"` lines (Android rebuilds the screen, then the app reloads once for the new direction; it's right if the language is right and the screen never blank); a reminder set after "Not now" on the exact-alarm prompt can come late (the prompt says so; Android decides); the departures strip and "N buses go this way" count from now on a chosen-time search; no tight-transfer warning from a ride's drop-off onto a train; "No lines found" for a few seconds while Lines search loads; the Hebrew "System" chip cut in Settings; a Russian subtitle kept on a recent place in English; far-off places in a Haifa search; "Walk 1 min · 0 m"; the Home map not following a geo fix until relaunch. TalkBack on the time wheels (G9) can't be tested with injected touches; it's left for a person.

## What to test: re-test of last round's failures

This round is **short**: only what failed last round, and the fixes that couldn't be checked without a device. Everything else passed and isn't repeated. Do the checks in order. Use 4 GB RAM. Screenshot every check. Unless a check says otherwise, the app and the emulator are in English. If it's Shabbat or night, mark the checks that need running buses **couldn't test (Shabbat)**.

Install over the existing app (`adb install -r maslul-latest.apk`).

### K. Re-tests (round 9)

**K1. Route list order (G5).** Leave now at a stop-dense place (Ibn Gabirol/Arlozorov, `adb emu geo fix 34.7818 32.0853`), during the day: Where to? → Dizengoff Center, then Habima → Azrieli Center, then → Haifa. Each time, the **first** card's first bus comes after you'd walk to its stop (its "walk N min" is less than the bus's "in M min", or equal). A card whose bus comes a minute before you'd get there, says "Now", or started in the past is never first (it may be further down). Wait 30 s on the list and check again. 3 searches, a screenshot each. If the planner returns 429 with a shuttle saved: a banner says the search failed (optional, last round couldn't test).
**K2. Live guide when the bus goes by without you (G6).** From a place about 300 m from a stop, plan a trip whose first bus is live and a few minutes away, open its route and tap Start. Don't move toward the stop; let the bus pass. Within a minute of it passing, the guide (banner and notification) switches to the next bus of that step ("Walk to <stop> · Bus 56 in 4 min"), never "Bus 36 is arriving" for the passed one; the route screen's selected bus is the new one, and the header times follow it. Write down the times. Also leave a started trip alone for an hour past its bus: the guide says the bus has passed or names a later one, never "is arriving". Then, on another trip, move the location along the bus's path past the stop before the bus leaves: the guide stays on "Walk to <stop>".
**K3. Stations follows you (G11).** Near Savidor (`adb emu geo fix 34.7983 32.0837`), open Stations. Then `adb emu geo fix 34.7818 32.0853` and wait 20 s **without** Refresh: the list changes to the stops near Ibn Gabirol/Arlozorov. While Stations shows, `adb shell dumpsys location | grep -i "gps provider request"` shows a request from com.maslul.app that stays on (about every 10 s); after switching to another tab it goes off.
**K4. "variants" order (G2).** Lines → Light rail, line 1: "<agency>  ·  3 variants" in English, "3 варианта" in Russian, "3 חלופות" in Hebrew (the number before the word). Line 480 in Russian: "8 вариантов".
**K5. Small fixes from the iOS round.** On one route, tap Remind me three times: only **one** reminder comes (`adb shell dumpsys alarm | grep -c com.maslul.app` doesn't grow). A route with a train → details: the train step's heading says "N trains go this way", not "Next N trains of Train".
**K6. Map taps (new, from the original app).** On a route's map or a line's map, zoomed out so stops are small dots: tap about a fingertip (5 mm) beside a stop: its stop opens. Where two stops are close, the one nearer the finger opens. A tap on empty map far from any stop opens nothing.

### M. Automated flows (Maestro)

**M1.** App and emulator in English. Stop mobile-mcp's agent (`adb shell pkill -f com.mobilenext`), location in Tel Aviv (`adb emu geo fix 34.7818 32.0853`), then `maestro --device emulator-5554 test maestro/ --format junit --output evidence/maestro-report.xml --debug-output evidence/maestro-output`. All 11 should pass (the flows now set the Advanced switches themselves; both are on after a fresh install, as in the Kotlin app).

## Report

Write this round's results into the empty `report.md`, with screenshots and logs in `evidence/`, and the Maestro report as `evidence/maestro-report.xml`. Leave `archive/` alone. End your session with the Summary as your final message.

```
# Maslul test report
build: <commit line from build-info.txt>
emulator: <image, API level>   time zone: <...>   tested at: <date, Israel time>

## Summary
<n> pass, <n> fail, <n> couldn't test. Worst problem: <one line>

## Findings (most serious first)
### <short title>
- check: <e.g. R1.4>
- expected: ...
- actual: ...
- reproduce: <exact taps or commands>
- evidence: <screenshot file, crash-log excerpt>
- happened again on retry: yes / no / not retried
- guess at cause (optional): ...

## All checks
| check | result | note |
|---|---|---|
| K1 route order | pass | |
...
```
