# Maslul: emulator test instructions

You are a Claude session with tools (an MCP) that control an Android emulator. You are testing a new build of **Maslul**, an Israeli public-transport app (route planning, lines, stops, live buses on a map). It is a React Native rewrite of an older Kotlin app and replaces it as an update: same app id `com.maslul.app`. Your job is to **find and report bugs, not fix them**. The code lives in another Claude session, which fixes what you report and sends new builds.

**Do everything yourself. Never ask the human to tap, type, install or check anything.** Decide for yourself when the UI is ambiguous, write down what you decided, and keep going. Run this file from top to bottom in one go and finish with the report.

## Files in this folder

The folder is `C:\Users\Raz\Desktop\CS\Claude\shared\maslul\maslul-test` on the Windows host. Inside the build container it's `/share/maslul-test`. Write your report and evidence here too.

| File | What it is |
|---|---|
| `maslul-latest.apk` | The new app: versionCode 5, standalone release build (no Metro needed) |
| `maslul-kotlin-v4.apk` | The **old** Kotlin app (versionCode 4), for the upgrade test only |
| `build-info.txt` | Commit and build details. Quote the commit line at the top of your report |
| `maestro/` | Automated UI flows (Maestro), also readable as step-by-step scripts |
| `TESTING.md` | This file |

Both APKs are signed with the same key, so the new one installs over the old one as an update.

## Rules

- Don't modify, rebuild or re-sign the APKs, and don't push anything anywhere.
- Take a screenshot at every check, named after the check (e.g. `R1-home-work.png`), and keep it in `evidence/`.
- A failure is a finding: record it and go on. Don't stop at the first failure.
- A missing file or tool only blocks the checks that need it. Only R6 needs `maestro/`; this round no check needs `maslul-kotlin-v4.apk`. Mark those **couldn't test** and do every other check. Never end the run because one thing is missing.
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

## Already passed: no need to repeat

- Everything that passed in rounds 1–3: the upgrade from the old app, tabs, Back, settings, planning, line 480 (on a weekday), the trip notification and "End trip", trips with the screen locked and after Recents, arrival sticking, Share, shuttles (Sun–Fri label, edit after a cold start, delete dialog), About credits, dark theme and dark map labels, the map attribution on Home, times far away carrying their day, the exact reminder once allowed, shuttle reminder text, the map after switching tabs (4 GB), and Hebrew text.

## What to test now, in this order

Round 4 re-tests what was fixed after round 3. This build has **native changes**, so install it fresh over the old one: `adb install -r maslul-latest.apk`. Use 4 GB RAM again. If it's Shabbat or night, mark the checks that need running buses **couldn't test (Shabbat)**; a simulated ride by `geo fix`, as you did in R1 last time, works at any hour.

**R1. Trip guide on the bus** (was finding 1 and the stop-count lag). Same trip as last round: plan to "Dizengoff Center", take the line 24 route (or any bus route), Start, and step through the same `geo fix` points along the route (your `R1-R6-observed-text.txt` list works).
1. At the stop one before the last (Kaplan on line 24): "Get off at the next stop".
2. At the last stop: **"Get off now"**, with its alert.
3. 150 m off to the side, away from the walking path: within one or two fixes, "Walk to Dizengoff Center · N m to go".
4. Also: stay at the last stop for over a minute: it moves on to the walk by itself.
5. Waiting at the boarding stop before the bus is due shows "Walk to <stop>" with "Bus N in M min" (or "at <time>"), not the bus step.
Write down each fix and what the app and notification showed, as last time.

**R2. Reminders without the exact-alarm grant** (was finding 2). Reset it first: `adb shell appops set com.maslul.app SCHEDULE_EXACT_ALARM default`.
1. Set a reminder ("Remind me" on a route or a shuttle a few minutes out). After the "Reminder set" toast, a dialog asks "Get reminders on time?".
2. "Not now" closes it; the reminder is still set (`dumpsys alarm`: windowed, as before).
3. Set another and tap "Allow": Android's "Alarms & reminders" page for Maslul opens. Switch it on and go back. `appops get` says allow, and `dumpsys alarm` shows the new reminder (set again after allowing) exact, `window=0`.
4. With it allowed, setting a reminder shows no dialog.

**R3. Line search over a weekend** (was finding 4). Lines tab, search 480 and 1: lines are listed, even on Saturday when Stride has no feed for today or yesterday; opening 480 shows its stops. Search "zzzz": "No lines found" with a search icon, not the crossed-out cloud.

**R4. Ride within 15 min** (was finding 3). As the ride_within flow: Settings → Advanced → rides on; to "Haifa Center HaShemona"; ride chip → 15 min → within.
- If routes say "Get dropped off …": pass.
- If not, the message now names the cause. Quote it exactly, and save `adb logcat -d -t 3000 ReactNativeJS:V '*:S'` right after: the app logs "Route search failed" with the error.

**R5. Route details on another day** (was finding 6). Late in the evening or on Shabbat, open a route whose bus is tomorrow: the header says "Sun 00:49 → 01:04". Share it: the first line has the day too.

**R6. Automated flows (Maestro).** As last round: stop mobile-mcp's agent (`adb shell pkill -f com.mobilenext`), put the location back in Tel Aviv (`adb emu geo fix 34.7818 32.0853`) **before** the run (last round two flows failed only because R1 left it at Dizengoff Center), then `maestro --device emulator-5554 test maestro/ --format junit --output maestro-report.xml`. All 11 should pass; search_line and ride_within were the two app failures (R3, R4).

**R7. Live buses**, only outside Shabbat and night (not seen in any round yet): on a stop screen some times turn green, and on line 1 or 480 bus icons appear on the map within about 30 s and move.

## Report

Earlier rounds' reports and evidence are kept as `report-round2.md`, `report-round3.md` and `evidence-round2/`, `evidence-round3/` (with their `maestro-report-*.xml`). Write this round's results into the empty `report.md`, with screenshots in `evidence/`. End your session with the Summary as your final message.

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
| R1.3 off the path after the last stop | pass | |
...
```
