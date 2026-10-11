# Maslul: iOS test

A **short re-test** of the React Native rewrite on iOS, **round 5**, on branch `feature/upstream-1.2.1`: only the fixes for round 4's findings. Everything else passed and isn't repeated. The build itself is the first check. The goal is to **find and report problems, not fix them**; fixes are made in the main checkout and come back through git.

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
- **Real iPhone** (not needed this round): connect it, then `npx expo run:ios --device --configuration Release`. A free Apple ID works: in Xcode, open `ios/Maslul.xcworkspace` → target Maslul → Signing & Capabilities → pick your Personal Team. The app then runs for 7 days. On the phone: Settings → General → VPN & Device Management → trust your developer certificate, and turn on Developer Mode if asked.
- To pick up fixes: `git pull`, then the prebuild and run lines again. An existing clone: `git fetch && git switch feature/upstream-1.2.1 && git pull`, then `npm ci` and the prebuild (with `--clean`: the native module changed).

## Set up

1. Time zone **Israel**: the simulator uses the Mac's time zone (System Settings → General → Date & Time).
2. Location in Tel Aviv: `xcrun simctl location booted set 32.0853,34.7818` (Xcode 27 has no Simulator app menu for this). The simulator sometimes stops sending positions after the app restarts; set it again if the blue dot or nearby stops go missing.
3. **Buses don't run on Shabbat** (Friday evening to Saturday evening) or at night. Mark checks that need running buses **couldn't test (Shabbat)**.
4. Start with the simulator and the app in English.

## Rules

**Test only the checks below.** No exploring; don't report anything outside the checks unless the app crashes. One screenshot per check (more only for a failure): `xcrun simctl io booted screenshot <name>.png`.

## Checks (round 5: only what changed since round 4)

**I1. Build.** The app builds and opens with no red error screen. If it fails, copy the **first** error lines.

**P1. Route list order.** Leave now from Ibn Gabirol/Arlozorov (`set 32.0853,34.7818`) → Azrieli Center; then Habima → Azrieli Center; then tap Refresh. Each time the **first** card's bus isn't "Now · Hurry" or "is arriving". Watch the list for a minute: the first card never changes to such a card.

**P2. "Arriving" means close.** Start a trip whose first bus is live and a few minutes away and don't move. The guide says "is arriving" (and the bus row "Arrives now") only when the bus is 1–2 stops away, never with 3+ stops away. When the bus goes by, within a minute the guide names the next bus.

**P3. "variants" order.** Russian, Lines → search 480: "אגד  ·  8 вариантов" (the 8 next to its word). English, Light rail line 1: "…  ·  3 variants".

## Report

Write `ios-report.md` (in the format below) with screenshots in an `evidence/` folder and logs in `logs/`. A failure is a finding, not a reason to stop. Keep what you saw separate from guesses about the cause.

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
