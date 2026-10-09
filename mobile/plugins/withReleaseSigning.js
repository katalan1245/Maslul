/**
 * Signs release builds with the private, git-ignored keystore.properties at the repository root
 * (storeFile, storePassword, keyAlias, keyPassword), as the Kotlin app's app/build.gradle.kts
 * did. storeFile is resolved from the old app/ module directory, so the same file works for both.
 * Without keystore.properties, release builds fall back to the debug key.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// maslul: release signing';

const SIGNING = `
        ${MARK}
        def maslulKeystore = new File(rootProject.projectDir, '../../keystore.properties')
        if (maslulKeystore.exists()) {
            def p = new Properties()
            maslulKeystore.withInputStream { p.load(it) }
            release {
                storeFile new File(new File(rootProject.projectDir, '../../app'), p.getProperty('storeFile')).canonicalFile
                storePassword p.getProperty('storePassword')
                keyAlias p.getProperty('keyAlias')
                keyPassword p.getProperty('keyPassword')
            }
        }`;

function addReleaseSigning(gradle) {
  if (gradle.includes(MARK)) return gradle;
  const signingConfigs = /signingConfigs\s*\{/;
  if (!signingConfigs.test(gradle)) throw new Error('withReleaseSigning: no signingConfigs block in app/build.gradle');
  let out = gradle.replace(signingConfigs, (m) => m + SIGNING);
  // The template signs release with the debug key; use ours when it's there.
  const release = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;
  if (!release.test(out)) throw new Error('withReleaseSigning: no release signingConfig line in app/build.gradle');
  out = out.replace(release, '$1signingConfig signingConfigs.findByName("release") ?: signingConfigs.debug');
  return out;
}

module.exports = (config) =>
  withAppBuildGradle(config, (c) => {
    if (c.modResults.language !== 'groovy') throw new Error('withReleaseSigning: expected a Groovy app/build.gradle');
    c.modResults.contents = addReleaseSigning(c.modResults.contents);
    return c;
  });
module.exports.addReleaseSigning = addReleaseSigning;
