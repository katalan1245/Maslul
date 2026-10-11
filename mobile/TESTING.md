# Maslul: emulator test instructions

You are a Claude session with tools (an MCP) that control an Android emulator. You are testing a new build of **Maslul**, an Israeli public-transport app (route planning, lines, stops, live buses on a map). It is a React Native rewrite of an older Kotlin app and replaces it as an update: same app id `com.maslul.app`. Your job is to **find and report bugs, not fix them**. The code lives in another Claude session, which fixes what you report and sends new builds.

**Do everything yourself. Never ask the human to tap, type, install or check anything.** Decide for yourself when the UI is ambiguous, write down what you decided, and keep going. Run this file from top to bottom in one go and finish with the report.

## Files in this folder

The folder is `maslul-test` in the host's handoff folder (`C:\Users\Raz\Desktop\CS\Claude\shared\maslul\maslul-test`). Write your report and evidence here.

| File | What it is |
|---|---|
| `maslul-latest.apk` | The new app: versionCode 9, standalone release build (no Metro needed), from branch `feature/upstream-1.2.1` |
| `maslul-kotlin-v4.apk` | The **old** Kotlin app (versionCode 4), not used this round |
| `maslul-kotlin-1.2.1.apk` | The Kotlin app's last version, 1.2.1 (versionCode 7), not used this round |
| `build-info.txt` | Commit and build details. Quote the commit line at the top of your report |
| `maestro/` | Automated UI flows, **not used this round** |
| `TESTING.md` | This file: the only instructions |
| `START-HERE.md` | A pointer to this file |
| `report.md` | Empty: **write your report here** |
| `evidence/` | Empty: **put every screenshot and log here** |
| `archive/` | Earlier rounds. **Don't read or use it**: those builds and findings are out of date, and everything still open is in this file |

All three APKs are signed with the same key, so the new one installs over either old one as an update.

## Rules

- **Test only the checks below.** No install verification, no crash-log dumps, no Maestro, no exploring. Don't report anything outside the checks unless the app crashes.
- One screenshot per check (more only for a failure), named after the check, in `evidence/`.
- A failure is a finding: record it and go on. A check you can't do is **couldn't test**, with the reason.
- Keep what you **saw** separate from what you **guess** about the cause.

## Set up

1. `adb install -r maslul-latest.apk`. Time zone Israel, app and emulator in English, location `adb emu geo fix 34.7818 32.0853`.
2. Buses must be running (not Shabbat, not night); otherwise mark the bus checks **couldn't test (Shabbat)**.
3. Taps: if mobile-mcp's tap misses, use `adb shell input tap X Y`.

## Checks (round 10: only what changed since round 9, plus upstream 1.2.2 in N5–N7)

**N1. Route list order.** At Ibn Gabirol/Arlozorov (`adb emu geo fix 34.7818 32.0853`), Where to? → Azrieli Center; then Habima → Azrieli Center. Each time: the **first** card's bus isn't "Now", "is arriving" or "Hurry", and the card hasn't started in the past ("Go now" with a start time already gone). Watch the list for a minute: the first card never changes to such a card. Two searches.

**N2. The bus goes by without you.** As last round: `adb emu geo fix 34.7935 32.0975` → Dizengoff Center → the first card (walk to דרך נמיר/יהודה המכבי, a live bus) → Start, and don't move. Log the notification about once a minute (`adb shell dumpsys notification --noredact | grep -A3 com.maslul.app`) until **two** buses have gone by. Pass if:
- "is arriving" shows only when the bus is 1–2 stops away (never with 3+ stops away);
- within about a minute of each bus passing, the guide names the next bus of that step (also the second time);
- after a switch, the route screen's header has a real duration (not "16:24 – 16:24"), and the next step's bus leaves after you get off the first.

**N3. "variants" order.** English: Lines → Light rail → line 1: "<agency>  ·  3 variants" with the 3 next to "variants". Russian (Settings → Русский): Lines → 480: "אגד  ·  8 вариантов". Then back to English.

**N4. Map tap on Home.** On the Home map (zoomed in on Tel Aviv so stops show), tap about 5 mm beside a stop: its stop screen opens. (Stops on line and route maps don't open on tap, as in the original app; vehicles do.)

**N5. "On a bus or train now" knows which way you're going.** Drive north along Ibn Gabirol, one fix every 3 s, and open Where to? → "On a bus or train now" while it runs:
`for p in "34.7808 32.0790" "34.7810 32.0800" "34.7812 32.0810" "34.7813 32.0820" "34.7815 32.0830" "34.7816 32.0840" "34.7818 32.0850" "34.7818 32.0853"; do adb emu geo fix $p; sleep 3; done` (repeat the last fix every 10 s while you look).
Pass if every row marked **"Going the other way"** (red) is below all unmarked rows, and the timetable rows show "<stop> → <next stop>". Then drive south (the same fixes in reverse order), reopen the screen: the lines on Ibn Gabirol swap (a line marked before isn't now, and the other way round). Once in Hebrew (Settings → עברית): one timetable row reads "<stop> ← <next stop>" with the stop on the right; then back to English. Three screenshots.

**N6. One arrival time.** On the Home map tap a stop about 2–3 km away (e.g. in Ramat Aviv) → Directions. Open a route whose last step is a bus (no walk at the end). Its timeline ends with **"Get off · <that stop>"** and one time, with no separate destination row under it, and that time is the route's arrival time in the header.

**N7. Stop screen.** At Ibn Gabirol/Arlozorov, tap its stop on the Home map. Pass if: the map is big with the departures in a sheet you can drag down and up; the fullscreen button (top of the map) hides the sheet and a "Show departures" button brings it back; under a line's time, "then N min" shows its next departure (lines with only one have none). Two screenshots.

## Report

Write `report.md` with screenshots in `evidence/`. Leave `archive/` alone. End your session with the Summary as your final message.

```
# Maslul test report
build: <commit line from build-info.txt>   tested at: <date, Israel time>

## Summary
<n> pass, <n> fail, <n> couldn't test. Worst problem: <one line>

## Findings
### <short title>
- check: <e.g. N2>
- expected: ...
- actual: ...
- reproduce: <exact taps or commands>
- evidence: <file names>
- guess at cause (optional): ...

## All checks
| check | result | note |
|---|---|---|
| N1 route order | pass | |
...
```
