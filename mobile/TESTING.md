# Maslul: emulator test instructions

You are a Claude session with tools (an MCP) that control an Android emulator. You are testing a new build of **Maslul**, an Israeli public-transport app (route planning, lines, stops, live buses on a map). It is a React Native rewrite of an older Kotlin app and replaces it as an update: same app id `com.maslul.app`. Nothing in this build has run on a device before, so expect bugs. Your job is to **find and report them, not fix them**. The code lives in another Claude session, which will fix what you report and send a new build.

**Do everything yourself. Never ask the human to tap, type, install or check anything.** Use your emulator tools to install APKs, tap, type, swipe, press Back, take screenshots, set the location and read logs. Where this file shows an `adb` or `maestro` command, run it if you have a shell that reaches the emulator; otherwise do the same thing with your MCP tools. Decide for yourself when the UI is ambiguous, and write down what you decided. Run the whole file in one go, from step 1 to the report.

## Files in this folder

| File | What it is |
|---|---|
| `maslul-latest.apk` | The new app: versionCode 5, standalone release build (JS bundled, no Metro needed) |
| `maslul-kotlin-v4.apk` | The **old** Kotlin app (versionCode 4), only for the upgrade test in step 2 |
| `build-info.txt` | Commit and build details. Quote the commit line at the top of your report |
| `maestro/` | Automated UI flows (Maestro) |
| `TESTING.md` | This file |

Both APKs are signed with the same debug key, so the new one installs over the old one as an update.

## Rules

- Don't modify, rebuild or re-sign the APKs, and don't push anything anywhere.
- Take a screenshot at every check, and name the files after the step (e.g. `2.5-home-work.png`).
- Something that fails is a finding: write it down and go on to the next step. Don't stop at the first failure.
- If a step is impossible (no network, no tool for it), say so in the report rather than skipping it silently.
- If you can't find an element by its text, dump the UI hierarchy (`adb shell uiautomator dump /sdcard/ui.xml && adb pull /sdcard/ui.xml`, or your tool's equivalent) and use the ids in it. The app's controls have ids such as `settings_button`, `rides_switch`, `on_board_switch`, `on_board`.
- Separate what you **saw** from what you **guess** about the cause.

## Step 1: set up

- An emulator with a **Google APIs** image, **x86_64, API 34 or newer**, with internet access. The app uses live services: api.transitous.org, open-bus-siri-requester.hasadna.org.il, open-bus-stride-api.hasadna.org.il, photon.komoot.io, nominatim.openstreetmap.org, tiles.openfreemap.org.
- Put the device in Tel Aviv: `adb emu geo fix 34.7818 32.0853` (longitude first).
- Start from a clean slate: `adb uninstall com.maslul.app` (it's fine if it says it isn't installed).
- Leave a crash log running for the whole session, and attach anything relevant from it to the report: `adb logcat -c && adb logcat -v time AndroidRuntime:E ReactNativeJS:V ReactNative:V Expo:V '*:F' > logcat.txt &`

## Step 2: upgrade migration (most important, do it first)

This checks that people updating from the old app keep their data.

1. `adb install maslul-kotlin-v4.apk` and open it. Grant location and notifications.
2. In the **old** app, create data. Write down exactly what you entered, since you'll compare it later:
   - set **Home** and **Work** (any two addresses);
   - add **two favourite places**;
   - one **favourite line** (from the Lines tab), one **favourite stop** (from Stations);
   - a **saved trip** if the UI offers it;
   - a **shuttle** (Settings → shuttles);
   - in Settings, change the **theme** (e.g. dark), the **walking speed** and the **rail preference**, and turn **both Advanced switches** on.
3. `adb shell am force-stop com.maslul.app`
4. Install the new app **over** it, without uninstalling: `adb install -r maslul-latest.apk`. It must succeed. If it fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, report that and do steps 3 onwards after `adb uninstall com.maslul.app && adb install maslul-latest.apk`.
5. Open it. Check that **every item from step 2** is there with the same values. Screenshot each screen you check.
6. Kill it and reopen: everything is still there.
7. Change one setting, kill, reopen: the change stayed (the old data must not be read again over it).

## Step 3: first launch and crashes

- The app opens to the map with a bottom sheet ("Where to?"). No red error screen, no crash dialog.
- Visit every tab (Navigate, Lines, Stations) and Settings → About. **About** must show the data-source credits and AGPL-3.0 license.
- Check `logcat.txt` for `FATAL EXCEPTION` and for `ReactNativeJS` errors.

## Step 4: automated flows

If you have a shell that reaches the emulator, install [Maestro](https://maestro.dev) if needed (needs Java 17+), then run from this folder:

```bash
maestro test maestro/ --format junit --output maestro-report.xml
```

- It runs 11 flows. Each one clears the app's data and grants permissions itself.
- The flows talk to the live services, so times and results vary.
- The shuttle flows set a slider by swiping. If only that swipe fails, say so; it's a known weak spot of the flow, not necessarily an app bug.
- For each failing flow, include the flow name, the failing step from the output, and the screenshot Maestro saves (`~/.maestro/tests/<run>/`).
- **Without Maestro:** each `maestro/*.yaml` file is a readable script. Do its steps yourself with your tools, in order:
  - `launchApp: clearState: true` means `adb shell pm clear com.maslul.app`, then open the app and allow every permission it asks for;
  - `tapOn: "text"` or `id: x` means tap that element;
  - `inputText` means type;
  - `assertVisible` and `extendedWaitUntil` mean check that it's on screen, waiting up to the timeout;
  - `runFlow: file: subflows/...` means run that file's steps with the `env` values given.
  Report each flow as pass or fail the same way.

## Step 5: hand checks

Do these yourself with your tools, after the flows. For each one, report **pass**, **fail** (with what you saw), or **couldn't test** (with why).

1. **Map.**
   - Tiles load in both light and dark theme (Settings).
   - The OpenStreetMap/OpenFreeMap attribution is visible at the bottom-left.
   - Rotate with two fingers: a compass appears, and tapping it turns north up.
   - The blue location dot is shown.
2. **Live buses.**
   - Open a busy line, e.g. search line **1** or **480** in Lines. Bus icons should appear on the map within about 30 seconds and move between updates.
   - On a stop screen, some arrival times turn **green** (live).
   - This only works when buses are running: not on Shabbat (Friday evening to Saturday evening) or late at night. Note the local Israel time you tested at.
3. **Live directions** (the in-trip guidance):
   - Plan a trip (e.g. to "Dizengoff Center") and start it from a route's detail screen.
   - A notification should appear with the current step and a **progress bar**.
   - Move the emulator along the route: Extended controls → Location → Routes, or repeated `adb emu geo fix` calls. Steps should advance, and each alert should fire **once**.
   - **Lock the screen** while moving: the notification keeps updating.
   - **"End trip"** in the notification stops it.
   - Start another trip, then swipe the app away from recents and reopen it: the trip should still be running.
4. **Reminders.** On a route leaving in a few minutes, tap "Remind me". The notification should arrive at the right time. Note how many seconds off it was.
5. **Back button.**
   - From any screen, Back returns to the previous one.
   - On the Lines or Stations tab, Back goes to Navigate, and Back again leaves the app.
6. **Dark theme.** Switch it on and look over every screen for unreadable text or wrong colours.
7. **Hebrew/RTL text** (street and stop names) displays correctly, not garbled or mirrored oddly.

## Report

End your session with the report's Summary section as your final message. Write `report.md` in this folder and put the logs next to it (`logcat.txt`, `maestro-report.xml`, screenshots). Use this format:

```
# Maslul test report
build: <commit line from build-info.txt>
emulator: <image, API level>   tested at: <date, Israel time>

## Summary
<n> pass, <n> fail, <n> couldn't test. Worst problem: <one line>

## Findings (most serious first)
### <short title>
- step: <e.g. Step 2.5 / flow plan_trip.yaml / hand check 3>
- expected: ...
- actual: ...
- reproduce: <exact taps or commands>
- evidence: <screenshot file, logcat excerpt with the stack trace>
- guess at cause (optional): ...

## All checks
| check | result | note |
|---|---|---|
| 2 upgrade: home/work | pass | |
...
```
