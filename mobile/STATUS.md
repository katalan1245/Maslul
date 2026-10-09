# Maslul React Native rewrite: status and remaining work

Branch `rewrite/react-native`, local commits only (never pushed). Updated after each task.

## Where things stand

| Area | State |
|---|---|
| Data layer (all Kotlin `data/` files ported to TS) | Done; strict `tsc` clean |
| Kotlin unit tests ported to Jest | Done, 150 tests pass |
| Live-API smoke tests (real services, recorded fixtures) | Done, 18 pass |
| Every screen, navigation, live trip, notifications, map | Written; checked only by tests and bundling |
| Offline screen-flow tests (old AppFlowTest scenarios) | 8 of 9 pass; the home-sheet one needs a device |
| Migration of saved data from the Kotlin app | Written and unit-tested; never run on a real upgrade |
| Native module (Kotlin/Swift: old-store read, SIRI decode, trip notification) | Written; **never compiled** |
| `expo prebuild` (manifest, signing patch) / `expo export` (Hermes bundles) | Pass |

## Remaining tasks

### Phase A: finish everything possible in this container (no new hosts)

- [ ] **A1. Parity review against the Kotlin app.** Go screen by screen through `app/src/main` and list every feature, text and behaviour; tick off what the port has and fix the gaps.
- [ ] **A2. More offline tests** for the parts with the most logic:
  - start-up migration through `App` (old store present, absent, corrupt);
  - live-trip session save and restore after a restart;
  - Stop, Trip, Route detail and Pick-on-map screens rendering with fake data.
- [ ] **A3. Version alignment.** Run `npx expo install --check`, fix mismatches, then re-run tsc, both test suites, prebuild and export.
- [ ] **A4. Maestro flows** (YAML) for every AppFlowTest scenario, the home sheet included, ready to run on the emulator. They stay unverified until then.
- [ ] **A5. Docs.**
  - README: setup, scripts, structure, how to build and sign.
  - This file: final verified / needs-a-device / unverified table.
  - NOTES.md: architecture decisions.
  - Rewrite AGENTS.md, which is still the Expo template.
  - A device test checklist, including the upgrade-migration steps.
- [ ] **A6. Final review pass** over the whole diff, then commit.

### Phase B: compile the native side (needs hosts opened)

- [ ] **B1. Build a debug APK here.** This compiles the Kotlin native module and the Gradle setup, which are now the biggest unknowns. Hosts to open:
  - `dl.google.com`, `maven.google.com`
  - `repo.maven.apache.org`, `repo1.maven.org`
  - `plugins.gradle.org`, `services.gradle.org`
  - `api.adoptium.net`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`

  It can't be run here, since there's no `/dev/kvm`.
- [ ] **B2.** Fix whatever the build turns up, then hand over the APK.

### Phase C: live testing (your emulator and Mac)

- [ ] **C1. Android emulator.**
  - Install the app and run the Maestro flows.
  - Check by hand: map look, live vehicles, live trip with the app in the background (notification and "End trip"), reminders.
- [ ] **C2. Upgrade migration.** Install the old Kotlin app, save home/work, favourites and a shuttle, install the new build over it, and check that everything is kept. Both builds must be signed with the same key: two debug builds work for this.
- [ ] **C3. iOS on the Mac.** Run `pod install` and build, which compiles the Swift module. Then run the same flows and hand checks.
- [ ] **C4.** Fix what the devices find, then you sign a release build.

## When the migration counts as finished

When Phase A and B are done, the code is complete and compiles. What's left after that is only what a real device can show (Phase C).
