import AsyncStorage from '@react-native-async-storage/async-storage';
import { reloadAppAsync } from 'expo';
import { AppState, I18nManager } from 'react-native';
import MaslulNative from '../../modules/maslul-native/src/MaslulNativeModule';
import { type Lang, type LanguageSetting, setLanguage } from '.';

const RELOAD_KEY = 'direction_reload_v1';

/** The phone's language, if it's one the app speaks ("iw" is Android's old code for Hebrew). */
export function deviceLang(): Lang {
  // Android gives "he_IL" or "iw_IL"; "_" is a word character, so \b wouldn't end the code there.
  // Asked each time: React Native's locale is a constant from launch, stale once the phone's language changes.
  const id = MaslulNative?.currentLanguage?.() || MaslulNative?.preferredLanguage || (I18nManager.getConstants().localeIdentifier ?? '');
  if (/^(he|iw)([-_]|$)/i.test(id)) return 'he';
  return /^ru([-_]|$)/i.test(id) ? 'ru' : 'en';
}

export function resolveLang(setting: LanguageSetting): Lang {
  return setting === 'HE' ? 'he' : setting === 'EN' ? 'en' : setting === 'RU' ? 'ru' : deviceLang();
}

/**
 * Switches to the language [setting] gives, laid out right-to-left for Hebrew. A change of
 * direction only shows after a reload, so the app then reloads, and true is returned meanwhile.
 * [settle]: the app's screen is being rebuilt (App mounted again in the same JS runtime).
 */
export async function applyLanguage(setting: LanguageSetting, settle = false): Promise<boolean> {
  const l = resolveLang(setting);
  setLanguage(l);
  const rtl = l === 'he';
  if (I18nManager.isRTL === rtl) return false;
  // Reload once per change: if the platform didn't take the new direction, carry on rather than loop.
  const last = await AsyncStorage.getItem(RELOAD_KEY).catch(() => null);
  const target = rtl ? 'rtl' : 'ltr';
  if (last != null && last.startsWith(target) && Date.now() - Number(last.slice(4)) < 60_000) return false;
  await AsyncStorage.setItem(RELOAD_KEY, `${target}:${Date.now()}`).catch(() => {});
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  // Android rebuilds the screen when the phone's language changes; reloading while the new one
  // is still being attached left a blank white screen (H4). Let it settle first.
  if (settle) await settled();
  await reloadAppAsync('Language changed').catch(() => {});
  return true;
}

/** Once the app is in the foreground, and a moment after. */
async function settled() {
  if (AppState.currentState !== 'active') {
    await new Promise<void>((resolve) => {
      const sub = AppState.addEventListener('change', (st) => {
        if (st !== 'active') return;
        sub.remove();
        resolve();
      });
    });
  }
  await new Promise((r) => setTimeout(r, 1000));
}

/**
 * From Settings. A change of direction reloads the app; otherwise the screens are drawn again in
 * the new language where they are (App keys them by language). Call before saving the setting.
 */
export async function changeLanguage(setting: LanguageSetting): Promise<boolean> {
  // Right away: saving the setting next redraws the app in it.
  setLanguage(resolveLang(setting));
  // A reload starts the app afresh: it comes back to Settings (see backToSettings).
  await AsyncStorage.setItem(SETTINGS_KEY, String(Date.now())).catch(() => {});
  return applyLanguage(setting);
}

const SETTINGS_KEY = 'language_from_settings_v1';

/** Whether the app was just reloaded for a language chosen in Settings, so it should open there again. */
export async function backToSettings(): Promise<boolean> {
  const at = Number(await AsyncStorage.getItem(SETTINGS_KEY).catch(() => null));
  await AsyncStorage.removeItem(SETTINGS_KEY).catch(() => {});
  return Number.isFinite(at) && at > 0 && Date.now() - at < 60_000;
}
