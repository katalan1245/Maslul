#!/usr/bin/env bash
# Builds the standalone test APK (release: JS bundled, no Metro; debug-signed without keystore.properties),
# records its build details next to it, then publishes it with scripts/publish-test.sh.
# Needs JAVA_HOME (JDK 17) and ANDROID_HOME. Usage: npm run build:test-apk
set -euo pipefail
# apksigner runs `java` from PATH, not JAVA_HOME.
export PATH="$JAVA_HOME/bin:$PATH"
cd "$(dirname "$0")/.."
npm run prebuild -- --platform android
(cd android && ./gradlew assembleRelease)

apk=android/app/build/outputs/apk/release/app-release.apk
dirty=$(git status --porcelain -- . | grep -q . && echo " (with uncommitted changes)" || true)
signer=$("$(ls -d "$ANDROID_HOME"/build-tools/* | tail -1)/apksigner" verify --print-certs "$apk" | grep -m1 SHA-256 | sed 's/.*: //')
cat > "$(dirname "$apk")/build-info.txt" <<EOF
commit: $(git rev-parse HEAD)$dirty
application id: com.maslul.app
version: $(node -p "const v=require('./version.json'); v.version + ' (versionCode ' + v.versionCode + ')'")
build time: $(date -u +%Y-%m-%dT%H:%M:%SZ)
build configuration: release (assembleRelease), JS bundled with Hermes, runs without Metro
signing: $( [ -f ../keystore.properties ] && echo "release key (keystore.properties)" || echo "debug key ~/.android/debug.keystore, same as the Kotlin app's debug build" )
signer sha-256: $signer
EOF
scripts/publish-test.sh
