Maslul's React Native + Expo app (Android and iOS), a port of the Kotlin app in `../app`, which it replaces. Read these first:
- [README.md](README.md): setup, scripts, release builds.
- [STATUS.md](STATUS.md): what's verified, what's left, the device checklist.
- [NOTES.md](NOTES.md): design decisions.

## Expo has changed: don't trust your training data

Expo ships breaking changes with every SDK. Before writing code that touches an Expo or React Native API, read the `expo` major version in `package.json` and check the matching docs at `https://docs.expo.dev/versions/v<major>.0.0/`. Start from https://docs.expo.dev/llms.txt for anything else.

## Commands

```bash
npx expo install <package>   # always, instead of npm install: picks SDK-compatible versions
npm run typecheck            # strict tsc
npm test                     # offline Jest: unit + screen flows
npm run test:live            # real services; skips what isn't running now
npx expo install --check     # versions match the SDK
npm run prebuild             # regenerate android/ and ios/ (both git-ignored)
cd android && ./gradlew assembleDebug   # native Android build (JDK 17 + Android SDK; see STATUS.md Phase B)
```

Run the typecheck and `npm test` before calling a task done.

## Rules

- **Never push, publish or deploy:** no `git push`, `eas build`/`submit`/`update`, or store uploads. Local commits on `rewrite/react-native` are fine.
- **Release signing** reads `../keystore.properties`. It stays out of the repo, and the owner signs releases.
- **Generated native projects.** `android/` and `ios/` are generated from `app.config.ts` and config plugins (`plugins/`), so never edit them by hand. Native code of our own lives in `modules/maslul-native`.
- **Development builds only.** The app has a native module, so Expo Go won't run it; use `npm run android` or `npm run ios`.
- **Keep the port's shape.** `src/data/` mirrors `../app/src/main/java/com/maslul/app/data` file for file. Behaviour follows the Kotlin app unless a change is deliberate and written up in NOTES.md.
- **Keep the licence and credits:** AGPL-3.0, the data-source credits in Settings → About (`settings.credits` in `src/i18n/en.ts` and `he.ts`), and the OpenStreetMap/OpenFreeMap attribution on the map.
- **Time.** Instants are epoch seconds and times are Israel time via `src/data/time.ts`; never use the device's time zone.
- **Text.** Every user-visible string lives in `src/i18n/en.ts` with its Hebrew in `he.ts`; read it as `S.…` at render time. See NOTES.md, Languages.
- **Navigation** uses React Navigation (native stack over bottom tabs, in `src/App.tsx` and `src/ui/nav.ts`), not Expo Router.
