# Maslul: iOS test

A **short re-test** of the React Native rewrite on iOS, **round 3**, on branch `feature/upstream-1.2.1`: only what failed in round 2 (its report is `ios-report-round2.md`), the fixes made for it, and the fixes made for the Android round that iOS shares. Everything else passed and isn't repeated. The build itself is the first check. The goal is to **find and report problems, not fix them**; fixes are made in the main checkout and come back through git.

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
- Pick on map names the spot as the map data has it (often Hebrew), whatever the app's language.

## Checks

Screenshot each check (`xcrun simctl io booted screenshot <name>.png`) and name it after the check, e.g. `I3-route-detail.png`.

**I1. Build.** `prebuild`, `pod install` and the Xcode build all finish; the app opens without a red error screen. If anything fails, this is the most important finding: copy the **first** error lines in full (from Xcode's Report navigator, or the terminal), not just the last.

**J1. Live directions (I6.2).** Open a route whose bus leaves in 10 minutes or more → Start, on the simulator walking toward the stop (`xcrun simctl location booted start` with waypoints along the walk). Right after Start and all the way to the stop, the guide says "Walk to <stop>" with the bus's time, never the on-bus step ("Bus N → … · N stops"), and no "Get off" alert comes before the bus leaves. Also walk along the bus's own path past the stop before it leaves: still the walk step. Then ride (waypoints along the bus's path after it leaves): the on-bus step, "Get off at the next stop", "Get off now".

**J2. Names (I6, I11.2).** A route with a train: the guide, Home's trip banner and a reminder say "Train from …" / "Train N", never "Train Train". A reminder's text "Leave at HH:MM · Bus N from … at HH:MM" uses one consistent pair of times (both live, or both timetable).

**J3. Shuttles (I15.6).** New shuttle → One time → 21:00 → Add: added, with no Repeating run. Also 19:30. Save a shuttle with two departures, one about 40 minutes from now and one 3 hours later, from a place near you to another; plan between them, Leave now: the shuttle route leaves at the first departure, and the card names it by its own name, not "Bus <name>".

**J4. "Last today" (I11.4).** Late evening or at night (after 23:00), Leave now on a short trip where night buses run: no "Last today" while another bus follows within the hour, and never on tomorrow morning's routes. Depart at 23:30 on a Sunday–Thursday: the tag is on at most one card, tonight's.

**J5. Train stations in search (I15.4).** Where to? → `תל אביב מרכז` (and `Haifa Center`): the train station in the results has the train icon in blue. Stations near Tel Aviv Savidor Center (`xcrun simctl location booted set 32.0837,34.7983`): no stop listed more than once, also after Refresh. Then move 1.6 km (`set 32.0853,34.7818`) and wait 10 s without Refresh: the list follows.

**J6. Language change keeps the screen (smaller point a).** Settings → עברית: after the reload you're on Settings, not Home. Back to English: Settings again. In Simple Maslul's settings, a language button: back on Simple's settings. English → Русский and back: no reload, and the **map labels** follow (Home's map and line 480's) without a restart; Lines → Light rail: "3 variants" / "3 חלופות" / "3 варианта".

**J7. Location revoked (smaller point g).** On Stations with nearby stops, revoke location (`xcrun simctl privacy booted revoke location com.maslul.app`, or iOS Settings → Maslul → Location → Never), come back to the app: the list is replaced by "Allow location access…" without a relaunch. Allow again and come back: the stops return.

**J8. Small fixes shared with Android.**
1. Where to?, start at Current location: "Current location" isn't offered as the destination; picking a place closes the keyboard.
2. Simple Maslul, the full app's Work set: Simple's Work button shows that address with no Clear; change it, then Clear: back to the full app's Work; Save.
3. Home under a favourite stop: "then HH:MM  HH:MM" never repeats a time.
4. Plan, open the time sheet → Depart at an hour from now: the Walk card's arrival counts from that time; refresh keeps the chosen time.
5. Star three stops, scroll Home's sheet to them, unstar all: the places come back (no blank sheet).

**J9. Still open from round 2, for the record** (not fixed in this build; one screenshot each tells whether they're unchanged): route-detail times wrapping at XL text (I10); Hebrew phone with the app in English: mirrored switches and field padding (I14); no banner for a reminder while the app is open; the restored trip's first row says "Start"; the Russian Options sheet's button below the fold; Hebrew Settings "לפי המכ…" cut; Russian Lines placeholder cut.

## Report

Write `ios-report.md` (in the format below) with screenshots in an `evidence/` folder and logs in `logs/`. Work through every check even if some fail; a failure is a finding, not a reason to stop. Keep what you saw separate from guesses about the cause.

**Hand the results back as a Claude artifact.** When the report is finished:
1. Zip everything into one file: `zip -r maslul-ios-results.zip ios-report.md evidence logs`.
2. Publish it with your Artifact tool: a small HTML page titled "Maslul iOS results" that shows the report's Summary and Findings, with the zip attached as a supporting file at `maslul-ios-results.zip` (linked from the page). Give the user the artifact's link; that link is how the results come back.
3. If the publish refuses the zip, don't work around it: send the zip to the user with your SendUserFile tool, so it reaches them in the Claude app. Only if that tool isn't available, tell them the zip's full path on the Mac.

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
