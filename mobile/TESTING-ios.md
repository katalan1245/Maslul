# Maslul: iOS test

The first iOS build of the React Native rewrite, with Hebrew. Nothing iOS-specific has been compiled or run before this, so the build itself is the first check. The goal is to **find and report problems, not fix them**; fixes are made in the main checkout and come back through git.

## Build on the Mac

Needs: the current Xcode from the App Store (open it once to install its components), Node 22 LTS, CocoaPods (`brew install cocoapods`).

```sh
git clone https://github.com/katalan1245/Maslul.git && cd Maslul
git checkout rewrite/react-native
cd mobile
npm ci
npx expo prebuild -p ios --clean      # generates ios/ (not in git) and runs pod install
npx expo run:ios --configuration Release
```

- `--configuration Release` builds a standalone app, as users get it; no Metro needed. For a quick debug loop, leave it out (Metro starts by itself).
- **Real iPhone** (for I6): connect it, then `npx expo run:ios --device --configuration Release`. A free Apple ID works: in Xcode, open `ios/Maslul.xcworkspace` → target Maslul → Signing & Capabilities → pick your Personal Team. The app then runs for 7 days. On the phone: Settings → General → VPN & Device Management → trust your developer certificate, and turn on Developer Mode if asked.
- To pick up fixes: `git pull`, then the prebuild and run lines again.

## Set up

1. Time zone **Israel**: the simulator uses the Mac's time zone (System Settings → General → Date & Time).
2. Location in Tel Aviv: Simulator → Features → Location → Custom Location → `32.0853`, `34.7818`.
3. **Buses don't run on Shabbat** (Friday evening to Saturday evening) or at night. Mark checks that need running buses **couldn't test (Shabbat)**.
4. Start with the simulator and the app in English.

## Known and not being changed (don't report)

- iOS has no earlier Maslul app, so there's no data to bring over (the Android upgrade test doesn't apply).
- Live directions on iOS have no ongoing notification (that's Android's). The guide lives in the app; "board soon" and "get off" come as alerts.
- The cable-car chip's icon is a seated figure (the old app's).
- MapLibre's screen-reader labels follow the phone's language, not the app's.
- On the stop screen the Directions button covers a row until you scroll to the end.

## Checks

Screenshot each check (`⌘S` in the Simulator) and name it after the check, e.g. `I3-route-detail.png`.

**I1. Build.** `prebuild`, `pod install` and the Xcode build all finish; the app opens without a red error screen. If anything fails, this is the most important finding: copy the **first** error lines in full (from Xcode's Report navigator, or the terminal), not just the last.

**I2. First run.** The location prompt appears with Maslul's text; allow it. Home: the map draws with streets and labels, the OpenFreeMap/OSM credit shows, the blue dot is in Tel Aviv. Tabs switch; the bottom sheet drags up and down.

**I3. Planning.** Where to? → type `haifa center`: "Haifa Center HaShemona" is listed; pick it. Routes are listed with times and line chips; open one: the details, the route on the map, Share opens the iOS share sheet. Change the time (Leave now → a later time, then Arrive by) and the list updates. Pick on map: drag the map under the pin, the place name under it updates, and Choose sets it. Typing works with the keyboard up (fields aren't covered).

**I4. Lines and stops.** Search line `480`: the line screen shows its route, stops and timetable. Open a stop: its departures. Add a favourite stop and a favourite place; quit the app (swipe it away) and reopen: they're still there. Settings: dark theme, then back; My shuttles: add one, edit it, delete it.

**I5. Live buses** (weekday daytime only). On a stop screen some times turn green; on line 1 or 480 bus icons appear on the map within about 30 s and move. This is the iOS native code (it downloads and unpacks the live-bus feed), so if no bus ever appears while the buses run, say so even with no error on screen.

**I6. Live trip.** Best on a real iPhone; on the simulator use Features → Location → Freeway Drive or City Run.
1. Open a route → Start. iOS asks for location (if not yet) and **notifications**: allow both.
2. The guide follows the trip step by step; the blue location indicator shows in the status bar.
3. Put the app in the background (home screen, or lock the phone) for a few minutes: "board soon" / "get off" alerts arrive as notifications, and on return the guide has moved on.
4. Quit the app during a trip and reopen it: the trip is restored. End trip: the guide closes, no alerts afterwards.

**I7. Reminder.** On a route → Reminder for a few minutes ahead. It fires on time as a notification, with the text in the app's language, also with the app in the background.

**I8. Hebrew.** Settings → Language → עברית: the app reloads once, in Hebrew and right to left. Repeat I2–I4 briefly in Hebrew: every screen right to left, map labels in Hebrew, the time sheet, dialogs and their buttons mirrored. Search `ויצמן 5 כ`: a "…כפר סבא" result near the top. Back to English: left to right after one reload.

**I9. Language = System.** App on Language → System. Set the simulator to Hebrew (Settings → General → Language & Region, add עברית as primary; the simulator restarts) and open Maslul: Hebrew, right to left. Also check: iOS Settings → Maslul → Language offers English and עברית. Delete and reinstall the app while the phone is in Hebrew: the location prompt is in Hebrew. Set the phone back to English: Maslul is English again.

**I10. Look and feel.** Notch and home indicator: nothing hidden under them on any screen. Dark mode (Settings → Developer → Dark Appearance, or Control Center) with the app on System theme: colours follow. Larger text (Settings → Accessibility → Display & Text Size → Larger Text): nothing cut off badly. Optional: VoiceOver on Home, buttons read sensible names.

## Report

Write `ios-report.md` (in the format below) with screenshots in an `evidence/` folder, and bring them back however is easiest.

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
