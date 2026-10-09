# Maslul: emulator test instructions

You are a Claude session with tools (an MCP) that control an Android emulator. You are testing a new build of **Maslul**, an Israeli public-transport app (route planning, lines, stops, live buses on a map). It is a React Native rewrite of an older Kotlin app and replaces it as an update: same app id `com.maslul.app`. Your job is to **find and report bugs, not fix them**. The code lives in another Claude session, which fixes what you report and sends new builds.

**Do everything yourself. Never ask the human to tap, type, install or check anything.** Decide for yourself when the UI is ambiguous, write down what you decided, and keep going. Run this file from top to bottom in one go and finish with the report.

## Files in this folder

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
| Find an element with no visible text | `adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml`. Ids include `settings_button`, `my_shuttles`, `add_shuttle`, `rides_switch`, `on_board_switch`, `on_board` |

## Set up

1. Set the emulator's **time zone to Israel**: Settings → System → Date & time → turn off automatic time zone → choose Jerusalem/Israel.
   - Last round it was UTC, which caused the time bugs below.
   - Write the time zone and the Israel time at the top of your report.
2. Location in Tel Aviv: `adb emu geo fix 34.7818 32.0853`.
3. **Buses don't run on Shabbat** (Friday evening to Saturday evening, about 19:00 Israel time) or at night. Mark the checks that need running buses **couldn't test (Shabbat)** if that's the case; don't count them as failures.

## Already reported: don't re-test these on the new app (R0 compares them on the old one)

These are being fixed. Don't spend time on them. If you happen to see one behave differently (worse, or with a crash), add a note.

1. Times are mixed between the device's time zone and Israel time when the device isn't on Israel time (arrival times, time picker, "Bus in 1276 min").
2. A second trip started right after one ends says "You've arrived" at once and fires the arrival alert again.
3. Trip steps don't advance: "Walk to…" stays until it jumps to "arrived".
4. The line timetable shows yesterday's date.
5. "Leave now" lists routes that already left as Best/Fastest.
6. The map is blank for up to 30 s after switching back to Navigate.
7. The notification permission is only asked on the first trip Start, which delayed that trip's notification.
8. Seen once each, not reproduced: the Home sheet vanished with the map buttons behind the tab bar; Maslul left the screen right after granting location.

## Already passed: no need to repeat

- About credits and licence.
- Every tab opens without a crash.
- Back button.
- Theme, walking speed and rail preference persist (new app).
- Trip planning to "Dizengoff Center".
- Map tiles in light and dark, the location dot, Hebrew and English street names.
- Line 480's screen.
- Trip notification with progress bar and "End trip".
- Trip survives going to the background.
- Arrival alert fires once.
- Share route.

## What to test now, in this order

Number your findings and checks R1, R2… as below.

**R0. Same scenarios on the old app.** So far only the new app has been tested. The old Kotlin app is the reference: the new one should behave the same unless it fixes something. For each scenario below, record **same as the new app** or **different** (say how), with a screenshot of each app.
1. `adb uninstall com.maslul.app`, then `adb install maslul-kotlin-v4.apk`. Open it, grant location and notifications.
2. Using the old app, repeat what you did last round on the new one:
   - **Planning:** "Dizengoff Center", leave now. Do routes that already left show up as Best/Fastest? (known bug 5)
   - **Line 480:** what date does the timetable show? (known bug 4)
   - **Trip:** start one and move the location along it. Do the steps advance from "Walk to…" through the bus step? (known bug 3) When it arrives, end it and start another trip at once. Does it say "You've arrived" straight away? (known bug 2)
   - **Notification permission:** when is it asked, at first launch or on the first trip Start? (known bug 7)
   - **Map:** switch to another tab and back to Navigate. Is the map blank for a while? (known bug 6)
   - **Time zone:** set the emulator to **UTC** for a moment. Plan a trip and compare the times shown with the Israel time. Do the arrival times, the time picker or "Bus in N min" look wrong? (known bug 1) Then set the time zone back to Israel.
   - **Anything else** that looked odd in the new app last round: is the old app the same?
3. Then go on to R1, which starts from a clean install of the old app.

**R1. Upgrade migration (most important).** This checks that people updating from the old app keep their data. If `maslul-kotlin-v4.apk` isn't in the folder, stop and report that; it should be there now.
1. `adb uninstall com.maslul.app`, then `adb install maslul-kotlin-v4.apk`. Open it and grant location and notifications.
2. In the **old** app, enter this data and write down exactly what you entered:
   - **Home** and **Work** (two different addresses);
   - **two favourite places**;
   - a **favourite line** (Lines tab) and a **favourite stop** (Stations tab);
   - a **shuttle**: Settings → My shuttles → add;
   - **theme** dark;
   - **walking speed** and **rail preference** changed (they're under Route options);
   - **both Advanced switches** on in Settings.
3. `adb shell am force-stop com.maslul.app`, then `adb install -r maslul-latest.apk`. It must install **without uninstalling**. If it fails, quote the error.
4. Open the new app. Check **every item** from step 2, one screenshot each.
5. Kill it (`adb shell am force-stop com.maslul.app`) and reopen: everything is still there.
6. Change the theme back to light, kill, reopen: it stays light (the old data must not be read again over it).

**R2. Shuttles** (new app): Settings → My shuttles. Create a shuttle, edit it (change its name or time), then delete it. Each change shows up at once and survives a kill and reopen.

**R3. Stops and lines:**
- Stations tab: open a stop near you. Arrival times are listed, and during service hours some turn **green** (live).
- Lines tab: search line **1** and open it.
- During service hours, on line 1 or 480, bus icons appear on the map within about 30 s and move.

**R4. Map:**
- Rotate the map with two fingers: a compass appears, and tapping it turns north up.
- Tap the **(i)** at the bottom-left: the credit "© OpenStreetMap contributors" / OpenFreeMap appears. The (i) button is the intended design, the same as the old app.

**R5. Trip with the screen locked.**
1. Plan a trip to "Dizengoff Center" and start it.
2. Lock the screen (see Tools).
3. Move the location along the route for a minute or two.
4. Unlock: the notification kept updating, and the app shows the new position.

**R6. Trip after a swipe from Recents.** Start a trip, open Recents, swipe Maslul away, wait 20 s, reopen. The trip should still be running, and the notification should still be there.

**R7. Reminder arrives.**
1. On a route leaving in about 5 minutes, tap "Remind me" and note the time it says.
2. Stay on the home screen and wait.
3. Record when the notification arrives and how far off it was.
4. If the emulator restarts before then, say so and try once more.

**R8. Dark theme and Hebrew on the remaining screens.** Turn on dark theme and check for unreadable text, wrong colours and garbled Hebrew on:
- the Lines tab and a line screen;
- the Stations tab and a stop screen;
- the trip screen;
- My shuttles and the shuttle editor;
- pick on map (in the "Where to?" search);
- on a bus (Settings → turn on the On-board switch, then the on-board button).

**R9. Automated flows, if time allows.**
- With a shell: install [Maestro](https://maestro.dev) (needs Java 17+) and run `maestro test maestro/ --format junit --output maestro-report.xml`.
- Without Maestro: pick 3 flows (`search_line.yaml`, `shuttle_save.yaml`, `on_board.yaml`) and do their steps yourself:
  - `launchApp: clearState: true` means `adb shell pm clear com.maslul.app`, then open the app and allow every permission;
  - `tapOn` means tap;
  - `inputText` means type;
  - `assertVisible` and `extendedWaitUntil` mean it must be on screen;
  - `runFlow` means do that file's steps with its `env` values.

## Report

Write `report.md` in this folder, with `evidence/` next to it. End your session with the Summary as your final message.

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
| R1.4 home/work | pass | |
...
```
