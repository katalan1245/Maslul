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

## What to test: re-test of last round's failures

This round is **short**: only what failed last round, and the fixes that couldn't be checked without a device. Everything else passed and isn't repeated. Do the checks in order. Use 4 GB RAM. Screenshot every check. Unless a check says otherwise, the app and the emulator are in English. If it's Shabbat or night, mark the checks that need running buses **couldn't test (Shabbat)**.

Install over the existing app (`adb install -r maslul-latest.apk`).

### G. Re-tests

**G1. Language (H4, F6, F10).** Settings → Language → System. While Maslul is open, set the emulator to Hebrew (Settings → System → Languages), then go back to Maslul: Hebrew after **one** reload, never a blank white screen (wait 30 s before calling it blank; save `adb logcat -d -t 3000 ReactNativeJS:V '*:S'` and count `Running main`). Back to English: one reload. Repeat both twice. Then in the app: Settings → Language → עברית: after the reload you are **on Settings**, not Home. Back to English: one reload, on Settings again. Русский → English: no reload, still on Settings. In Simple Maslul (X1), its language buttons: after a reload you're on Simple's settings.
**G2. Map labels and "variants" (X3, H2).** English → Русский with no reload: the Home map and line 480's map relabel in Russian within a few seconds, and back to English the same, without a restart. Lines tab → Light rail: line 1 (Jerusalem) shows "3 variants" in English, "3 חלופות" in Hebrew, "3 варианта" in Russian.
**G3. Chosen time (P2).** Plan to Dizengoff Center, time sheet → Depart at, an hour from now: the Walk card's arrival is the walk from that time, not from now. Tap the refresh chip: the time chip still says the chosen time and the routes are for it.
**G4. Home after unstarring (L3).** Star three stops, scroll Home's sheet down to them, then unstar all three: the sheet shows the places again (no blank sheet).
**G5. Route list order (W1).** Leave now, a trip with several options, at a time buses run: the first cards are ones you can still catch; one whose bus has already passed or that started in the past is never first. With a shuttle saved, when the planner fails (HTTP 429, often last round): a banner says the search failed, with Try again, instead of listing only shuttle routes.
**G6. Live guide (T1).** As T1: on the walk to the stop, move the location along the bus's own path, past the stop, **before** the bus leaves: the guide stays on "Walk to <stop>" and doesn't jump onto the bus. After a live bus passes the stop without you, write down what the guide and the stop screen say, with times (last round it re-timed into a trip that got off before boarding).
**G7. Reminders (R1, R2, F12).**
1. Set two reminders (Remind me on routes) at least 20 minutes ahead; `adb shell dumpsys alarm | grep -A3 com.maslul.app` lists them. Revoke "Alarms & reminders" (`adb shell appops set --uid com.maslul.app SCHEDULE_EXACT_ALARM default`): Android kills the app. Open Maslul again: `dumpsys alarm` lists both again (inexact now), and they arrive.
2. A route starting with a train → Remind me: the notification's "Leave at HH:MM" is not after the "Train … at HH:MM", and the train time matches the route's (live if it is).
3. A "Not now" (inexact) reminder: does its notification appear? Give the time it came.
**G8. Shuttles (W5, R2).** New shuttle → One time → 21:00 → Add: it's added, with no Repeating run. Also 19:30. Save a shuttle Habima → Azrieli with a departure about 40 minutes from now and another 3 hours later; plan from Habima to Azrieli, Leave now: the shuttle route leaves at the **first** departure, not the later one. The card names the shuttle by its own name ("Test Shuttle from Habima"), not "Bus Test Shuttle".
**G9. Time wheels with TalkBack (W6).** TalkBack on, time sheet: touch the hour wheel: focus is on the whole wheel ("Hour, 08"), not on one number; a one-finger swipe up/down steps it by one; the number in the wheel's middle is the one Set time uses. The same in the shuttle editor.
**G10. Tight train transfer (X7).** A route with a tight change onto a train: the card says "to catch the train" and has an "If missed, the next train at …" line. If the planner fails often (429), retry a few times and say so.
**G11. Stations (W4).** Near Savidor Center (`adb emu geo fix 34.7983 32.0837`), Stations: no stop listed twice (also after Refresh twice). Then `adb emu geo fix 34.7818 32.0853` (1.6 km away) and wait 10 s without Refresh: the list changes to the stops near the new place. In Where to?, search `תל אביב מרכז`: the station has the train icon there too.
**G12. Small fixes.**
1. (X2) Full app's Work set to an address. Simple Maslul → settings → the Work button: its dialog shows that address, with no Clear. Change the address, then Clear: it shows the full app's Work again; Save: the list shows it.
2. (N4) Where to? with the start at Current location: "Current location" isn't offered as the destination; picking a place closes the keyboard.
3. (F15) Rows under a favourite stop on Home: "then HH:MM  HH:MM" never repeats a time.
4. Ride card (Advanced → rides): the drop-off time on a ride card matches the times in its details.
5. "Last today" isn't shown while night buses keep running within the hour, nor on tomorrow's routes.

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
| G1 language | pass | |
...
```
