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
- A missing file or tool only blocks the checks that need it. Only M1 needs `maestro/`, and only U1–U3 need `maslul-kotlin-v4.apk`. Mark those **couldn't test** and do every other check. Never end the run because one thing is missing.
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

## What to test: a full pass over the whole app

This round is a **complete re-test before release**: every area, from scratch, even what passed in rounds 1–6. It also covers five new features (marked *new*). Do the sections in this order. Use 4 GB RAM. Screenshot every check; a layout finding needs its screenshot. Unless a check says otherwise, the app and the emulator are in English. If it's Shabbat or night, mark the checks that need running buses **couldn't test (Shabbat)**; don't count them as failures.

### U. Upgrade from the old app (most important; do it first)

**U1.** `adb uninstall com.maslul.app`, then `adb install maslul-kotlin-v4.apk`. Open it, grant location and notifications, and enter (write down exactly what you entered): Home and Work (two addresses), two favourite places, a favourite line (Lines tab) and a favourite stop (Stations tab), a shuttle (Settings → My shuttles), dark theme, a changed walking speed and rail preference (Route options), and both Advanced switches on.
**U2.** `adb shell am force-stop com.maslul.app`, then `adb install -r maslul-latest.apk`: it installs **without uninstalling** (quote any error). Open it: every item from U1 is there (one screenshot each). The favourite stop also shows on Home under "Favorite stops" (*new*).
**U3.** Kill and reopen: still all there. Set the theme back to light, kill, reopen: it stays light.

### N. Basics and the map

**N1.** Tabs (Navigate, Lines, Stations) switch; Android Back goes back one screen and leaves the app from a tab. No crash on any screen (dump the crash log after each section, as in Tools).
**N2.** Map: streets and labels draw; rotate with two fingers: a compass appears, tapping it turns north up. Lines tab for 10 s, back to Navigate: the tiles show again within a few seconds (give the time).
**N3.** Full-screen map (the button at the bottom right): the (i) at the bottom left is fully visible and opens the OpenStreetMap/OpenFreeMap credit. A "Places" button sits on the **same row** as the two square buttons, at the same height, not floating above them (*new*); with Settings → "Already on a bus" on, "On a bus?" shares the row and nothing overlaps or is cut off. Tap Places: the sheet comes back. Dragging the sheet down does the same.
**N4.** Dark theme: look over every screen for unreadable text or wrong colours; map labels are bright and readable. Back to light.
**N5.** Settings → About: the credits list GNU AGPL v3, Transitous, Open Bus, Stride, Photon, Nominatim, OpenFreeMap and © OpenStreetMap contributors.

### P. Planning a trip

**P1.** Where to? → type `ויצמן 5`, then ` כ`: a "…כפר סבא" result comes to the top. Clear it and type `haifa center`: "Haifa Center HaShemona" is listed. Pick Dizengoff Center: routes are listed with times, line chips and "leave in".
**P2.** Options: closing it untouched keeps the routes; changing walking speed searches again. Time: Leave now → Depart at a later time → Arrive by: the list updates each time. Routes whose bus is tomorrow carry the day ("Sun 00:49 → 01:04"). The chip row scrolls sideways and Options is reachable.
**P3.** Open a route: the time range at the top is on one line, the route is on the map, the steps make sense. Share: the text lists the trip (with the day if it's not today); a route with a train says "Train from …", never "Train Train" or "to 114".
**P4.** Pick on map (in Where to?): drag the map under the pin; the address under it updates; Choose sets it and plans.
**P5. Last routes offline** (*new*). Plan to Dizengoff Center and wait for the routes. Airplane mode on (`adb shell cmd connectivity airplane-mode enable`), tap the refresh chip: the same routes come back under "No new routes, showing the ones saved at HH:MM", without any whose bus has left. Airplane mode off (`… disable`), tap the banner's Try again: fresh routes, no banner, nothing listed twice.
**P6. Last bus warning** (*new*). Open the time sheet and choose **Depart at** 23:30 on the next Sunday–Thursday. If the list reaches into tomorrow morning, the latest route before 04:00 has a "Last today" tag (one card only). Choose 10:00 the same day: no tag. On a weekday evening after 22:30, also "Leave now" on a short trip: a banner "The last one today leaves at HH:MM from …" when the last bus is within the hour. No tag is not a failure when the list shows no morning route (the app only claims a last bus it can prove); write down what the list showed.

### L. Lines and stops

**L1.** Lines tab: search `480` and `1`: lines are listed (also on a weekend); open 480: its stops and timetable. Search `zzzz`: "No lines found" with a search icon. Star line 480.
**L2.** Stations tab: open a stop near you: departures are listed. Star it (the star at the top).
**L3. Favourite stops on Home** (*new*). Navigate tab: the sheet has a "Favorite stops" section with the starred stop, its distance, and up to 3 lines with their times. Tap the stop's name: its stop screen opens; tap a row: its trip opens. Star two more stops: at most 3 show, nearest first. Airplane mode on, 2 minutes on Home: the rows stay, and the stop's line says "Updated N min ago". Airplane mode off. Unstar all stops: the section disappears.
**L4. Reminder from a stop** (*new*). On a stop screen, long-press a departure at least 30 minutes away → "Remind me to leave": a toast says the reminder is set. Long-press one leaving in under 10 minutes: "too soon". Do the same from a row under a starred stop on Home. If a reminder's time comes during the session, record its notification text.
**L5. Stops away** (*new*; needs live buses). On a stop screen with green (live) times, some rows say "N stops away".

### T. A trip with live directions

**T1.** Plan to Dizengoff Center, take a bus route, Start (grant notifications). Move the location along the route with `adb emu geo fix` every few seconds. Waiting at the stop: "Walk to <stop>" with "Bus N in M min" (*new*: plus "· N stops away" when the bus is live). On the bus: one stop before the last, "Get off at the next stop"; at the last, "Get off now" with its alert. 150 m off to the side: "Walk to Dizengoff Center · N m to go". At the destination: "You've arrived", and it stays when you move 200 m away.
**T2.** Lock the screen mid-trip and keep moving the location for a minute: on unlocking, the notification kept updating and the app shows the new position. Swipe Maslul away from Recents, wait 20 s, reopen: the trip and its notification are still there.
**T3.** End trip: the trip notification and the "Get off now" alert are gone (`adb shell dumpsys notification --noredact | grep -A2 com.maslul.app`). Start the same route again: the guide starts from the beginning. Android's notification settings for Maslul: the live-directions channel has one entry, with a proper name.

### R. Reminders

**R1.** Reset the exact-alarm grant (`adb shell appops set com.maslul.app SCHEDULE_EXACT_ALARM default`). On a route → Remind me: a toast, then "Get reminders on time?". Not now: the reminder is still set. Set another and tap Allow: Android's "Alarms & reminders" page opens; switch it on, go back. With it allowed, no dialog.
**R2.** A reminder a few minutes ahead arrives on time (`adb shell dumpsys alarm | grep -A3 com.maslul.app` shows it exact), also with the app in the background. A shuttle's reminder says "Leave at … · <shuttle name> from …"; a route starting with a train says "Train from …".

### S. Shuttles

**S1.** Settings → My shuttles → add: Save with nothing filled lists what's missing ("a name, where it leaves from, …"); times like `soon` are refused, `07:30, 17:00` reads "2 departures a day". Fill it in, running Sun–Fri: the list shows "Sun–Fri".
**S2.** Kill, reopen, tap the shuttle at once (3 times): "Edit shuttle" each time. Edit its name: shown at once. Delete asks first: Cancel keeps it, Delete removes it. Changes survive a kill.

### A. Advanced tools

**A1.** Settings → Advanced: rides on. Plan to Haifa Center HaShemona; ride chip → 15 min → within: routes come back (no 30 s timeout; if it fails, quote the message and save `adb logcat -d -t 3000 ReactNativeJS:V '*:S'`).
**A2.** "Already on a bus" on: the "On a bus?" button on Home lists the rides around (or "No rides found around you").

### H. Hebrew

**H1.** Settings → Language → עברית: one reload, Hebrew and right to left.
**H2.** Walk through every screen in Hebrew: Home (with a starred stop and the full-screen map), search, routes and Options, a route's details, a line and its timetable, Stations and a stop (and its long-press menu, תזכירו לי לצאת), Settings, My shuttles and a new shuttle, About. Record any English UI text (names of streets and stops may be English), mirrored layout mistakes, and cut-off text.
**H3.** Map labels in Hebrew, in the dark theme too. A trip in Hebrew (as T1, briefly): the guide steps and the notification are Hebrew. A reminder: the toast, the exact-alarm dialog (reset the grant first; laid out right to left, its buttons too) and the notification are Hebrew. Share a route: Hebrew text. P5 offline in Hebrew: the banner is Hebrew.
**H4.** Settings → שפה → English: one reload, left to right. Then Language → System; set the emulator to Hebrew (Settings → System → Languages) and reopen Maslul: Hebrew after one reload. Emulator back to English: English after one reload.
**H5.** In Hebrew, the place search (P1) finds the same places at the top.

### V. Live buses (weekday daytime only; not seen in any round yet)

**V1.** On a stop screen some times turn green; on line 1 or 480 bus icons appear on the map within about 30 s and move. If no bus ever appears while buses run, say so even without an error on screen.

### M. Automated flows (Maestro)

**M1.** App and emulator in English. Stop mobile-mcp's agent (`adb shell pkill -f com.mobilenext`), location in Tel Aviv (`adb emu geo fix 34.7818 32.0853`), then `maestro --device emulator-5554 test maestro/ --format junit --output maestro-report.xml`. All 11 should pass.

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
