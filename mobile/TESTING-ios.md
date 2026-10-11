# Maslul: iOS test

A **short re-test** of the React Native rewrite on iOS, **round 4**, on branch `feature/upstream-1.2.1`: the fixes for round 3's findings and for the Android round that iOS shares. Everything else passed and isn't repeated. The build itself is the first check. The goal is to **find and report problems, not fix them**; fixes are made in the main checkout and come back through git.

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

This is **round 4**: only the fixes since round 3 (build 3791f6f), on the build named in the message that sent you here. Do the checks in order.

**L1. Route list order.** Leave now from Ibn Gabirol/Arlozorov (`set 32.0853,34.7818`), during the day, to Dizengoff Center, then Habima → Azrieli Center: the **first** card's first bus comes after you'd walk to its stop (its walk is no longer than the bus's "in N min"). A card whose bus says "Now", comes a minute before you'd get there, or started in the past is never first.

**L2. A bus that goes without you.** From a place about 300 m from a stop, plan a trip whose first bus is live and a few minutes away, open the route, Start, and don't move. After the bus passes the stop: within a minute the guide switches to that step's next bus ("Walk to <stop> · Bus N in M min"), and the route screen's chosen bus is the new one. Never "Bus N is arriving" for the bus that has gone. Then, as in your round 3 finding, leave a started trip alone for an hour past its bus: the guide says the bus has passed or names a later one, never "is arriving".

**L3. Remind me twice.** On one route, tap Remind me three times: only **one** reminder comes (the last one set).

**L4. Train choices.** A route with a train → route details: the train step's heading says "N trains go this way · tap to choose", not "Next N trains of Train".

**L5. Stations follows you.** Stations near Savidor (`set 32.0837,34.7983`), then `set 32.0853,34.7818` and wait 20 s without Refresh: the list changes. (Passed in round 3; the way it follows has changed.)

**L6. "variants" order.** Russian, Lines → search 480: "אגד  ·  8 вариантов" (the number next to its word). English Light rail line 1: "…  ·  3 variants".

**L7. Map taps.** On a route's or a line's map, zoomed out so stops are small dots: a tap a fingertip beside a stop opens it; with two stops close together, the nearer one opens.

**Known since round 3 (don't report again):** the guide moves onto the bus up to 2 minutes before its time (slack for buses leaving early); the route header and the chosen bus row change while riding; with a later departure, the step's bus list starts from now; a train's live time can stay still for minutes (the feed); everything listed in round 3's J9.

## Report

Write `ios-report.md` (in the format below) with screenshots in an `evidence/` folder and logs in `logs/`. Work through every check even if some fail; a failure is a finding, not a reason to stop. Keep what you saw separate from guesses about the cause.

**Hand the results back as a Claude artifact.** When the report is finished:
1. Shrink the screenshots first, so the zip stays under 15 MB (the artifact limit is 16 MB; last round's was 53 MB): `cd evidence && for f in *.png; do sips -s format jpeg -s formatOptions 70 -Z 1200 "$f" --out "${f%.png}.jpg" >/dev/null && rm "$f"; done && cd ..` (the report's evidence names then end in `.jpg`). Then zip everything into one file: `zip -r maslul-ios-results.zip ios-report.md evidence logs`, and check its size with `ls -lh`.
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
