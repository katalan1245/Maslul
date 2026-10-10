# Maslul: emulator test instructions

You are a Claude session with tools (an MCP) that control an Android emulator. You are testing a new build of **Maslul**, an Israeli public-transport app (route planning, lines, stops, live buses on a map). It is a React Native rewrite of an older Kotlin app and replaces it as an update: same app id `com.maslul.app`. Your job is to **find and report bugs, not fix them**. The code lives in another Claude session, which fixes what you report and sends new builds.

**Do everything yourself. Never ask the human to tap, type, install or check anything.** Decide for yourself when the UI is ambiguous, write down what you decided, and keep going. Run this file from top to bottom in one go and finish with the report.

## Files in this folder

The folder is `shared\maslul\maslul-test` in the host's handoff folder. Inside the build container it's `/share/maslul-test`. Write your report and evidence here too.

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
- Take a screenshot at every check, named after the check (e.g. `B3-route-header.png`), and keep it in `evidence/`.
- A failure is a finding: record it and go on. Don't stop at the first failure.
- A missing file or tool only blocks the checks that need it. Only B4 needs `maestro/`; this round no check needs `maslul-kotlin-v4.apk`. Mark those **couldn't test** and do every other check. Never end the run because one thing is missing.
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

## Already passed: no need to repeat

- Everything that passed in rounds 1–5: the upgrade from the old app, tabs, Back, settings, planning, line 480, the trip notification and "End trip", trips with the screen locked and after Recents, arrival sticking, Share, shuttles, About credits, dark theme and dark map labels, the map attribution on Home, times far away carrying their day, exact reminders, shuttle reminder text, the map after switching tabs (4 GB), line search on a weekend, ride within 15 min by hand, the trip guide on a simulated ride, starting a trip again, no alert left after End, the chip row, and in Hebrew: switching language both ways, every screen, map labels, a trip, the reminder toast and Share.

## What to test now, in this order

Round 7 does two things: it re-tests what was fixed after round 5 (B1–B5, which were round 6, never run), and it tests five new features (C1–C5). This build has **native changes**, so install it fresh over the old one: `adb install -r maslul-latest.apk`. Use 4 GB RAM. Screenshot every check; a layout finding needs its screenshot. Start with the app in English (Settings → Language → English) and the emulator in English. If it's Shabbat or night, mark the checks that need running buses **couldn't test (Shabbat)**.

**B1. Place search in English** (was finding 1). App in English. Where to? → type `ויצמן 5`, then ` כ`: a "…כפר סבא" result comes to the top. Clear it and type `haifa center`: "Haifa Center HaShemona" is listed. Then switch to עברית and do the same: the same places, at the top.

**B2. Language = System on a Hebrew phone** (was finding 2). App on Language → System. Set the emulator to Hebrew (Settings → System → Languages, עברית first) and reopen Maslul: Hebrew and right to left after one reload. Set the emulator back to English and reopen: English and left to right after one reload.

**B3. Hebrew details** (was findings 3, 5, 6, 7, 10), app in עברית:
1. Reset the exact-alarm grant (`adb shell appops set com.maslul.app SCHEDULE_EXACT_ALARM default` and `adb shell appops set --uid com.maslul.app SCHEDULE_EXACT_ALARM default`), open a route → תזכורת: the dialog is laid out right to left, its buttons too. אישור opens Android's "Alarms & reminders" page; לא עכשיו closes it and the reminder stays set.
2. A route's details: the time range at the top is on one line.
3. Start a trip, then the app's notification settings: the live-directions channel has a Hebrew name, and there's no second, unused live-directions channel (`adb shell dumpsys notification | grep -i -A2 com.maslul.app` too).
4. The element tree of Home and of a route's details (`uiautomator dump`): no "Bottom Sheet" labels; the Share button is labelled שיתוף נסיעה; Home's buttons are `quick_home` / `quick_work`.
5. A route with a train (as A3 last round): the train leg in the details no longer says "to 114"; it says רכבת (or "Train" in English).

**B4. Automated flows (Maestro)**, app and emulator in English. Stop mobile-mcp's agent (`adb shell pkill -f com.mobilenext`), put the location in Tel Aviv (`adb emu geo fix 34.7818 32.0853`), then `maestro --device emulator-5554 test maestro/ --format junit --output maestro-report.xml`. All 11 should pass. ride_within now reaches the ride search for the first time since round 4's fix (the search used to time out after 30 s): if it fails, quote the message and save `adb logcat -d -t 3000 ReactNativeJS:V '*:S'`.

**B5. Live buses**, only outside Shabbat and night (not seen in any round yet): on a stop screen some times turn green, and on line 1 or 480 bus icons appear on the map within about 30 s and move. A reminder set for a time during the session: its notification text (in the app's language).

**C. New features.** App and emulator in English unless a check says otherwise. Ids for `uiautomator dump`: `home_stop`, `board_row`, `remind_leave`, `saved_routes_banner`, `last_bus_banner`, `refresh_chip`, `favorite_stop`.

**C1. Last routes offline.** Plan a trip to Dizengoff Center and wait for the routes. Turn on airplane mode (`adb shell cmd connectivity airplane-mode enable`), then tap the refresh chip: the same routes come back under a banner "No new routes, showing the ones saved at HH:MM", without any whose bus has already left. Turn airplane mode off (`… airplane-mode disable`) and tap the banner's Try again: fresh routes, no banner, no route listed twice. Repeat the offline part in עברית: the banner is in Hebrew.

**C2. Stops away** (needs live buses, as B5). On a stop screen with green (live) times, some rows say "N stops away". During a trip (Start on a route), the waiting step says "Bus N in X min · N stops away".

**C3. Favourite stops on Home.** Stations tab → Arlozorov/Ibn Gabirol (or any stop near the location) → the star at the top. Back to the Navigate tab: Home's sheet has a "Favorite stops" section with that stop, its distance, and up to 3 lines with their times. Tap the stop's name: its stop screen opens. Star two more stops: at most 3 are shown, nearest first. Turn on airplane mode, wait 2 minutes on Home: the rows stay, and the stop's line says "Updated N min ago". Unstar all stops: the section disappears. Check it in עברית too (right to left, no English).

**C4. Reminder to leave from a stop.** On a stop screen, long-press a departure at least 30 minutes away → "Remind me to leave": a toast says the reminder is set. Long-press one leaving in under 10 minutes: the toast says it's too soon. Do the same from a row under a starred stop on Home. If the reminder's time comes during the session, record its notification text. In עברית, the menu item says תזכירו לי לצאת.

**C5. Last bus warning.** Plan a trip, open the time sheet and choose **Depart at** 23:30 on the next Sunday–Thursday. Results that include tomorrow-morning routes: the latest route before 04:00 has a "Last today" tag (only one card has it). Choose 10:00 the same day: no tag. If the session runs on a weekday evening after 22:30, also plan "Leave now" for a short trip: a banner "The last one today leaves at HH:MM from …" when the last bus is within the hour. No tag or banner is not a failure when the planner doesn't show any morning route (the app only claims a last bus when it can prove it); write down what the list showed.

## Report

Earlier rounds' reports and evidence are kept as `report-round2.md` … `report-round5.md` and `evidence-round2/` … `evidence-round5/` (with their `maestro-report-*.xml`). Write this round's results into the empty `report.md`, with screenshots in `evidence/`. End your session with the Summary as your final message.

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
| B1 place search in English | pass | |
...
```
