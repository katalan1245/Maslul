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
- Take a screenshot at every check, named after the check (e.g. `H3-route-card.png`), and keep it in `evidence/`.
- A failure is a finding: record it and go on. Don't stop at the first failure.
- A missing file or tool only blocks the checks that need it. Only H9 needs `maestro/`; this round no check needs `maslul-kotlin-v4.apk`. Mark those **couldn't test** and do every other check. Never end the run because one thing is missing.
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

- Everything that passed in rounds 1–4: the upgrade from the old app, tabs, Back, settings, planning, line 480, the trip notification and "End trip", trips with the screen locked and after Recents, arrival sticking, Share, shuttles, About credits, dark theme and dark map labels, the map attribution on Home, times far away carrying their day, the exact-alarm prompt and exact reminders, shuttle reminder text, the map after switching tabs (4 GB), line search on a weekend, ride within 15 min by hand, and the trip guide on a simulated ride (stop countdown, "Get off now", the walk after it, waiting at the boarding stop).

## What to test now, in this order

Round 5 has two parts: re-tests of what was fixed after round 4 (A1–A5, app in English), then the new **Hebrew** language (H1–H9). This build has **native changes**, so install it fresh over the old one: `adb install -r maslul-latest.apk`. Use 4 GB RAM again. Screenshot every check; a layout finding needs its screenshot. If it's Shabbat or night, mark the checks that need running buses **couldn't test (Shabbat)**; a simulated ride by `geo fix` works at any hour.

**A1. Starting a trip again** (was finding 1). Do R1 of round 4 once up to "Get off now" (your `R1-observed-text.txt` fixes work). Tap End trip, put the location back at the start (`adb emu geo fix 34.7818 32.0853`) and Start the same route again **without** force-stopping the app. The first step is "Walk to <stop>", and on the bus it counts "4 stops", "3 stops", … as in a first run. Repeat End → Start once more.

**A2. The alert after End trip** (was finding 3). In A1, after "Get off now" fired its alert, tap End trip: the "Get off now" alert is gone from the shade (`adb shell dumpsys notification --noredact | grep -A2 com.maslul.app`).

**A3. Share for a train** (was finding 4). Share a route with a train leg (as R5.2): the train line reads "• Train from …", not "Train Train". Also set a reminder on a route that starts with a train: its text says "Train from …".

**A4. The chip row** (was finding 5). On the routes screen with "Depart … · Tomorrow", swipe the chip row left: the Options chip comes fully into view and opens Options. The row scrolls sideways by design; report only if Options can't be reached.

**A5. Live buses**, only outside Shabbat and night (not seen in any round yet): on a stop screen some times turn green, and on line 1 or 480 bus icons appear on the map within about 30 s and move.

Now the Hebrew part. Report what looks wrong without guessing at the Hebrew: the wording was reviewed separately.

**H1. Switching to Hebrew.** Emulator in English. Settings → Language (שפה) → עברית.
- The app reloads by itself within a few seconds and opens in Hebrew. Say if it didn't reload, or reloaded more than once.
- The layout is right to left: the tab bar reads ניווט · קווים · תחנות from the right, the back arrow points right, list rows start at the right.
- Kill the app and reopen: still Hebrew, no extra reload.

**H2. Every screen in Hebrew.** Walk through: Home (לאן?), search, a route list and Options (אפשרויות), a route's details, a line and its timetable (לוח זמנים), Stations and a stop, Settings, My shuttles and a new shuttle, About. Record any English UI text you see. Stop, line and place names are data and may be in either language.

**H3. Right-to-left layout.** On the same screens, look for:
- text that overlaps, is cut off, or sits on the wrong side;
- times and line numbers inside Hebrew sentences out of order (e.g. a route card's "14:05 – 14:40" must read 14:05 first, from the right);
- icons that point the wrong way (arrows, chevrons, the walking figure should face left);
- the loading bar under the search field sweeping from right to left;
- the chip row on the routes screen starting at the right and scrolling;
- the map: the compass and buttons stay clear of each other, the (i) attribution is reachable.

**H4. Map labels.** Navigate tab, zoom into Tel Aviv: street and place names in Hebrew. Dark theme too.

**H5. A trip in Hebrew.** Plan to "דיזנגוף סנטר" and start it.
- The notification's text is Hebrew, and its action is "סיום הנסיעה"; tapping it ends the trip.
- Move the location along the route (as in A1): the steps and alerts are in Hebrew, ending with "הגעתם".
- `adb shell dumpsys notification | grep -i -A2 com.maslul.app`: what the channel names say.

**H6. Reminder in Hebrew.** Set a reminder: the toast, the exact-alarm dialog (reset it first with `adb shell appops set com.maslul.app SCHEDULE_EXACT_ALARM default`) and the notification are in Hebrew. Share a route: the text is Hebrew.

**H7. Back to English.** Settings → שפה → English: one reload, the layout is left to right again, every screen English. Then Settings → Language → System: stays English (the emulator is English).

**H8. Phone in Hebrew.** Set the emulator's language to Hebrew (Settings → System → Languages), keep the app on System, reopen it: Hebrew and right to left after one reload. Set the emulator back to English afterwards.

**H9. Automated flows (Maestro)**, with the app and the emulator in English (after H7 and H8). Stop mobile-mcp's agent (`adb shell pkill -f com.mobilenext`), put the location back in Tel Aviv (`adb emu geo fix 34.7818 32.0853`), then `maestro --device emulator-5554 test maestro/ --format junit --output maestro-report.xml`. All 11 should pass; ride_within was the one failure in round 4 (finding 2: the ride search queued behind the screen's other lookups and timed out). If it fails again, quote the message and save `adb logcat -d -t 3000 ReactNativeJS:V '*:S'`. The flows match English text, so they aren't run in Hebrew.

## Report

Earlier rounds' reports and evidence are kept as `report-round2.md` … `report-round4.md` and `evidence-round2/` … `evidence-round4/` (with their `maestro-report-*.xml`). Write this round's results into the empty `report.md`, with screenshots in `evidence/`. End your session with the Summary as your final message.

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
| A1 starting a trip again | pass | |
...
```
