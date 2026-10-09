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
- A missing file or tool only blocks the checks that need it. Only R9 needs `maestro/`; this round no check needs `maslul-kotlin-v4.apk`. Mark those **couldn't test** and do every other check. Never end the run because one thing is missing.
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

1. The line timetable shows yesterday's date early in the day, while Stride hasn't loaded today's feed yet. The old app does the same.
2. "Leave now" late in the evening lists tomorrow's routes, because tonight's buses are over. The old app does the same; the new one now puts the day in front of the time.
3. The notification permission is asked on the first trip Start, as in the old app.
4. Line search "1" lists lines from all over the country in Stride's order, as in the old app.
5. On the stop screen, the Directions button covers a row until you scroll to the end; the list leaves room below its last row.
6. The low-memory killer on a 2 GB emulator closes Maslul (and Maestro). That's the environment, not the app.

## Already passed: no need to repeat

- Upgrade from the old app (all of R1 last round) and everything listed in the last report as pass: tabs, Back, theme and settings persistence, planning, line 480, trip notification and "End trip", trip with the screen locked and after Recents, arrival alert once, Share, shuttles saved/edited/deleted, About credits, dark theme on every screen, Hebrew text.

## What to test now, in this order

Round 3 re-tests what was fixed after round 2. Number checks R1, R2… as below. If it's Shabbat or night, mark the checks that need running buses **couldn't test (Shabbat)**.

**Before you start:** if the emulator can be restarted with more RAM (4 GB), do that and say so in the report. Install the new build over whatever is there: `adb install -r maslul-latest.apk`.

**R1. Trip guide after getting off** (was finding 2 and 3).
1. Plan a trip to "Dizengoff Center" that includes a bus, and start it.
2. Move the location along the route (`adb emu geo fix`, every few seconds) through the walk and the bus ride.
3. At the last bus stop the step is "Get off now". Then move **about 150 m away from that stop in a direction off the planned walking path**: within one or two updates the step becomes "Walk to Dizengoff Center · N m to go".
4. Walk on to the destination: "You've arrived". Then move 200 m away: it must **stay** "You've arrived".
Screenshot each step, the app and the notification.

**R2. Times far away carry their day** (was finding 4). Late in the evening or on Shabbat, when the next bus is tomorrow:
- the trip's first step says "Bus N at <Day> HH:MM", not "Bus N in 1208 min";
- route cards show the leave time with its day, e.g. "Sat 18:13 – 18:52";
- "Remind me" says "Reminder set for Sat 18:03 (...)".
If the next bus is today and within the hour it's still "in N min", which is right. Say which case you saw.

**R3. Dark map labels** (was finding 5). Dark theme, Navigate tab, zoom into Tel Aviv: street and place labels are bright and easy to read. Compare with your round-2 screenshot.

**R4. Map attribution on Home** (was finding 6). Expand the map (the full-screen button). The (i) at the bottom-left is fully visible, and tapping it opens the credit dialog, not "Which ride are you on?". Turn on the On-board switch first (Settings → Advanced) so the "On a bus?" button is shown.

**R5. Shuttles** (was finding 7 and 8).
1. Create a shuttle running Sun, Mon, Tue, Wed, Thu, Fri: the list shows "Sun–Fri".
2. Kill the app, reopen, go to My shuttles and tap the shuttle **at once**. Do this 3 times: it opens "Edit shuttle" each time, never a blank "New shuttle". If it ever opens a blank form, say where exactly you tapped (`uiautomator dump` right before helps).
3. Delete: a dialog asks "Delete <name>?". Cancel keeps it; Delete removes it.

**R6. Reminders on time** (was finding 1). The app now declares the exact-alarm permission.
1. `adb shell appops get com.maslul.app SCHEDULE_EXACT_ALARM`: write down what it says.
2. With it as it is, set a reminder (Settings → reminders 2 min, on a route ~5 min out; a shuttle works on Shabbat). `adb shell dumpsys alarm | grep -A3 com.maslul.app`: is it exact or windowed? When does the notification arrive?
3. `adb shell appops set com.maslul.app SCHEDULE_EXACT_ALARM allow`, set another reminder, and repeat: now it should be exact and arrive within a few seconds.
4. The notification for a shuttle says "Leave at … · <shuttle name> from …", without "Bus" in front.

**R7. Blank map after switching tabs** (old known bug 6). Lines tab, wait 10 s, back to Navigate: how long until the map tiles show? Do it 3 times and give the times. Say how much RAM the emulator has.

**R8. Live buses**, only outside Shabbat and night: on a stop screen some times turn green, and on line 1 or 480 bus icons appear on the map within about 30 s and move. Rotate the map if you can (compass appears; tap it turns north up).

**R9. Automated flows (Maestro).** Maestro needs the UI-automation slot that mobile-mcp's on-device agent holds, and enough memory.
1. Stop mobile-mcp's agent: `adb shell pkill -f com.mobilenext` (and don't use mobile-mcp tools until the run ends).
2. `maestro --device emulator-5554 test maestro/ --format junit --output maestro-report.xml`.
3. Last run's failures in plan_trip, options_keep_routes, advanced_tools, shuttle_save and shuttle_missing were the flows' own; they're fixed in this `maestro/`. home_sheet failed on an app bug, fixed in this build. All 11 should pass, except ride_within, which may find no rides on Shabbat or at night; then say so.
4. If the driver still doesn't start, quote the error and the `lowmemorykiller` lines, and mark it **couldn't test**.

## Report

First rename last round's `report.md` to `report-round2.md` (and `evidence/` to `evidence-round2/`) so nothing is overwritten. Then write a new `report.md` in this folder, with a new `evidence/` next to it. End your session with the Summary as your final message.

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
