# Hebrew round: checks to fold into TESTING.md

These are the emulator checks for the Hebrew feature (branch `feature/hebrew`). They become the next round's "What to test now" in `TESTING.md` once the branch is merged into `rewrite/react-native`. They're kept apart until then so the round in progress isn't disturbed. The rules, tools and report format in `TESTING.md` apply unchanged.

The build must be a fresh native build (`npm run build:test-apk`): the trip notification's "End trip" label is passed to native code, which changed.

Screenshot every check; a layout finding needs its screenshot. Report what looks wrong without guessing at the Hebrew: the wording is reviewed separately.

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
- the map: the compass and buttons stay clear of each other, the (i) attribution is reachable.

**H4. Map labels.** Navigate tab, zoom into Tel Aviv: street and place names in Hebrew. Dark theme too.

**H5. A trip in Hebrew.** Plan to "דיזנגוף סנטר" and start it.
- The notification's text is Hebrew, and its action is "סיום הנסיעה"; tapping it ends the trip.
- Move the location along the route (as in R1): the steps and alerts are in Hebrew, ending with "הגעתם".
- `adb shell dumpsys notification | grep -i -A2 com.maslul.app`: what the channel names say.

**H6. Reminder in Hebrew.** Set a reminder: the toast and the notification are in Hebrew.

**H7. Back to English.** Settings → שפה → English: one reload, the layout is left to right again, every screen English. Then Settings → Language → System: stays English (the emulator is English).

**H8. Phone in Hebrew.** Set the emulator's language to Hebrew (Settings → System → Languages), keep the app on System, reopen it: Hebrew and right to left after one reload.

**H9. Automated flows.** Run the Maestro suite with the app in English (H7 first): all 11 pass, as before. The flows match English text, so they aren't run in Hebrew.
