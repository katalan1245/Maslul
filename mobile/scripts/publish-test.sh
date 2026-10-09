#!/usr/bin/env bash
# Publishes the last test build to the host handoff folder for the emulator session: /share/maslul-test
# (on Windows C:\Users\Raz\Desktop\CS\Claude\shared\maslul\maslul-test). It sends the APK, TESTING.md, the
# Maestro flows and the old Kotlin APK. Each is copied under a .tmp name and renamed when complete, and
# build-info.txt (build details, file list, checksums) is written last. The tester's report.md and evidence/
# there are left alone. Usage: npm run publish:test (build:test-apk runs it after a successful build).
set -euo pipefail
cd "$(dirname "$0")/.."
out=${TEST_HANDOFF_DIR:-/share/maslul-test}
apkdir=android/app/build/outputs/apk/release
[ -f "$apkdir/build-info.txt" ] || { echo "no test build yet: run npm run build:test-apk" >&2; exit 1; }
mkdir -p "$out"

put() { cp "$1" "$out/$2.tmp" && mv -f "$out/$2.tmp" "$out/$2"; }
put "$apkdir/app-release.apk" maslul-latest.apk
put TESTING.md TESTING.md
kotlin=../app/build/outputs/apk/debug/app-debug.apk
if [ -f "$kotlin" ]; then put "$kotlin" maslul-kotlin-v4.apk; else echo "note: no Kotlin APK; run sh gradlew assembleDebug at the repo root" >&2; fi
rm -rf "$out/maestro.tmp" && cp -r .maestro "$out/maestro.tmp" && rm -rf "$out/maestro" && mv "$out/maestro.tmp" "$out/maestro"

{
  cat "$apkdir/build-info.txt"
  echo "published: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "files (sha256):"
  (cd "$out" && find maslul-latest.apk maslul-kotlin-v4.apk TESTING.md maestro -type f 2>/dev/null | sort | xargs sha256sum | sed 's/^/  /')
} > "$out/build-info.txt.tmp"
mv -f "$out/build-info.txt.tmp" "$out/build-info.txt"
cat "$out/build-info.txt"
