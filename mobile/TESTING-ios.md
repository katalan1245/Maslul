# Maslul: iOS test

A full test of the React Native rewrite on iOS: **round 2**, on branch `feature/upstream-1.2.1`. Do every check, I1–I14, from scratch: it adds the Kotlin app's 1.1.1–1.2.1 (I13, Simple Maslul and Russian) and the fixes from round 1 (I14). Round 1's report is `ios-report-round1.md`. The build itself is the first check. The goal is to **find and report problems, not fix them**; fixes are made in the main checkout and come back through git.

## Build on the Mac

Needs: Xcode 26.4 or newer from the App Store (Expo SDK 57 doesn't build with older ones; 27.0 is known to work) (open it once to install its components), Node 22 LTS, CocoaPods (`brew install cocoapods`).

```sh
git clone https://github.com/katalan1245/Maslul.git && cd Maslul
git checkout feature/upstream-1.2.1
cd mobile
npm ci
npx expo prebuild -p ios --clean      # generates ios/ (not in git) and runs pod install
npx expo run:ios --configuration Release
```

- `--configuration Release` builds a standalone app, as users get it; no Metro needed. For a quick debug loop, leave it out (Metro starts by itself).
- **Real iPhone** (for I6): connect it, then `npx expo run:ios --device --configuration Release`. A free Apple ID works: in Xcode, open `ios/Maslul.xcworkspace` → target Maslul → Signing & Capabilities → pick your Personal Team. The app then runs for 7 days. On the phone: Settings → General → VPN & Device Management → trust your developer certificate, and turn on Developer Mode if asked.
- To pick up fixes: `git pull`, then the prebuild and run lines again. An existing clone: `git fetch && git switch feature/upstream-1.2.1 && git pull`, then `npm ci` and the prebuild (with `--clean`: the native module changed).

## Set up

1. Time zone **Israel**: the simulator uses the Mac's time zone (System Settings → General → Date & Time).
2. Location in Tel Aviv: `xcrun simctl location booted set 32.0853,34.7818` (Xcode 27 has no Simulator app menu for this). The simulator sometimes stops sending positions after the app restarts; set it again if the blue dot or nearby stops go missing.
3. **Buses don't run on Shabbat** (Friday evening to Saturday evening) or at night. Mark checks that need running buses **couldn't test (Shabbat)**.
4. Start with the simulator and the app in English.

## Known and not being changed (don't report)

- iOS has no earlier Maslul app, so there's no data to bring over (the Android upgrade test doesn't apply).
- Live directions on iOS have no ongoing notification (that's Android's). The guide lives in the app; "board soon" and "get off" come as alerts.
- The cable-car chip's icon is a seated figure (the old app's).
- MapLibre's screen-reader labels follow the phone's language, not the app's.
- On the stop screen the Directions button covers a row until you scroll to the end.
- The routes screen's chip row scrolls sideways; a long time chip pushes Options under the fixed Refresh button.
- The walk-only card's arrive time counts from now, even with a chosen time (the Kotlin app does the same).
- Pick on map names the spot as the map data has it (often Hebrew), whatever the app's language.

## Checks

Screenshot each check (`xcrun simctl io booted screenshot <name>.png`) and name it after the check, e.g. `I3-route-detail.png`.

**I1. Build.** `prebuild`, `pod install` and the Xcode build all finish; the app opens without a red error screen. If anything fails, this is the most important finding: copy the **first** error lines in full (from Xcode's Report navigator, or the terminal), not just the last.

**I2. First run.** The location prompt appears with Maslul's text; allow it. Home: the map draws with streets and labels, the OpenFreeMap/OSM credit (the ⓘ button) shows at the top left under the search card, the blue dot is in Tel Aviv. Tabs switch; the bottom sheet drags up and down.

**I3. Planning.** Where to? → type `haifa center`: "Haifa Center HaShemona" is listed; pick it. Routes are listed with times and line chips; open one: the details, the route on the map, Share opens the iOS share sheet. Change the time (Leave now → a later time, then Arrive by) and the list updates. Pick on map: drag the map under the pin, the place name under it updates, and Choose sets it. Typing works with the keyboard up (fields aren't covered).

**I4. Lines and stops.** Search line `480`: the line screen shows its route, stops and timetable. Open a stop: its departures. Add a favourite stop and a favourite place; quit the app (swipe it away) and reopen: they're still there. Settings: dark theme, then back; My shuttles: add one, edit it, delete it.

**I5. Live buses** (weekday daytime only). On a stop screen some times turn green; on line 1 or 480 bus icons appear on the map within about 30 s and move. This is the iOS native code (it downloads and unpacks the live-bus feed), so if no bus ever appears while the buses run, say so even with no error on screen.

**I6. Live trip.** Best on a real iPhone; on the simulator move the position with `xcrun simctl location booted start` (a list of waypoints) or repeated `set`.
1. Open a route → Start. iOS asks for location (if not yet) and **notifications**: allow both.
2. The guide follows the trip step by step; the blue location indicator shows in the status bar.
3. Put the app in the background (home screen, or lock the phone) for a few minutes: "board soon" / "get off" alerts arrive as notifications, and on return the guide has moved on.
4. Quit the app during a trip and reopen it: the trip is restored. End trip: the guide closes, no alerts afterwards.

**I7. Reminder.** On a route → Reminder for a few minutes ahead. It fires on time as a notification, with the text in the app's language, also with the app in the background.

**I8. Hebrew.** Settings → Language → עברית: the app reloads once, in Hebrew and right to left. Repeat I2–I4 briefly in Hebrew: every screen right to left, map labels in Hebrew, the time sheet, dialogs and their buttons mirrored. Search `ויצמן 5 כ`: a "…כפר סבא" result near the top. Back to English: left to right after one reload.

**I9. Language = System.** App on Language → System. Set the simulator to Hebrew (Settings → General → Language & Region, add עברית as primary; the simulator restarts) and open Maslul: Hebrew, right to left. Also check: iOS Settings → Maslul → Language offers English, עברית and Русский. Delete and reinstall the app while the phone is in Hebrew: the location prompt is in Hebrew. Set the phone back to English: Maslul is English again.

**I10. Look and feel.** Notch and home indicator: nothing hidden under them on any screen. Dark mode (Settings → Developer → Dark Appearance, or Control Center) with the app on System theme: colours follow. Larger text (Settings → Accessibility → Display & Text Size → Larger Text): nothing cut off badly. Optional: VoiceOver on Home, buttons read sensible names.

**I11. New features.**
1. *Favourite stops on Home:* star a stop (Stations → a stop → the star). Home's sheet shows "Favorite stops" with it, its distance and up to 3 lines; tapping the name opens the stop. Unstar it: the section goes.
2. *Reminder from a stop:* long-press a departure at least 30 minutes away (on a stop screen, and under a starred stop on Home) → "Remind me to leave": a toast, and the notification arrives at the time it said.
3. *Last routes offline:* plan a trip, turn on Airplane Mode (on a real iPhone; the simulator uses the Mac's network), tap refresh: the same routes under "No new routes, showing the ones saved at HH:MM". Airplane Mode off → Try again: fresh routes, no banner.
4. *Last bus:* time sheet → Depart at 23:30 on the next Sunday–Thursday: if the list reaches into tomorrow morning, one card is tagged "Last today".
5. *Stops away* (weekday daytime): a stop screen with live times shows "N stops away"; during a trip the waiting step says "· N stops away".

**I12. Fixes from the last look.** In the search fields (From/To) the typed text and the placeholder sit vertically centred, level with the dot and the ✕, in English and in Hebrew. The same in the line search, the time sheet's hour and minute, the favourite name and the shuttle fields. With the Home map full screen, the sheet stays as a thin "PLACES" strip at the bottom with the two square buttons on its edge; tapping the strip brings the places back.

**I13. From the Kotlin app's 1.1.1–1.2.1.** In full detail as `TESTING.md` X1–X3 and X5–X7 (same app; skip X4, Android only). Briefly:
1. *Simple Maslul:* Settings → Simple Maslul → Switch. Big buttons, no tab bar; the location prompt if not yet allowed. Set a button's address, plan to it, open an option: plain numbered steps. Simple Settings → Русский and עברית (right to left after one reload), edit a button, then "Switch to full Maslul": the tabs are back. Nothing hidden under the notch or the home indicator on these screens; big text fits on a small iPhone.
2. *Russian:* Settings → Language → Русский: Russian everywhere (walk the screens of I2–I4 and record any English UI text), left to right; delete and reinstall with the phone in Russian: the location prompt is in Russian.

**I14. Fixes from the first iOS report** (build it fresh: the native module changed). Each at the place it failed:
- I9 again: phone in Hebrew (`defaults write -g AppleLanguages -array he-IL en-IL`, reboot) with the app on System: Hebrew and right to left. Also with the phone back in English and the app on עברית: titles (Lines, Stations, the time sheet's "מתי?") sit on the right with their padding.
- I9: phone in Hebrew, app on English: all text left-aligned, nothing right-aligned.
- I10: with the app open on the Lines tab, change the text size (`xcrun simctl ui booted content_size extra-large`, then `extra-extra-extra-large`): Lines, Home and the trip banner redraw at the new size, with no "2.." badges or clipped times, and the app stays on the screen it was on.
- I8: with the app in English *and* in עברית, `ויצמן 5 כ` lists a "…כפר סבא" result, in Hebrew, in the top three.
- I4: stop sending positions (or deny location), open Stations: "Allow location access" shows only when access is off; otherwise "Tap Refresh to try again".
- I8: the time sheet's Depart at / Arrive by control is whole, with its edges, in Hebrew.

## Report

Write `ios-report.md` (in the format below) with screenshots in an `evidence/` folder and logs in `logs/`, and bring them back however is easiest (last time: the `maslul-ios-test` handoff folder). Work through every check even if some fail; a failure is a finding, not a reason to stop. Keep what you saw separate from guesses about the cause.

```
# Maslul iOS test report
build: <git rev-parse --short HEAD>   Xcode: <version>   device: <simulator model + iOS version, or iPhone model>
tested at: <date, Israel time>

## Summary
<n> pass, <n> fail, <n> couldn't test. Worst problem: <one line>

## Findings (most serious first)
### <short title>
- check: <e.g. I6.3>
- expected: ...
- actual: ...
- reproduce: <exact steps>
- evidence: <screenshot, error text>

## All checks
| check | result | note |
|---|---|---|
| I1 build | pass | |
...
```
