import AsyncStorage from '@react-native-async-storage/async-storage';
import { reloadAppAsync } from 'expo';
import { I18nManager } from 'react-native';
import { type Lang, type LanguageSetting, lang, setLanguage } from '.';

const RELOAD_KEY = 'direction_reload_v1';

/** The phone's language, if it's one the app speaks ("iw" is Android's old code for Hebrew). */
export function deviceLang(): Lang {
  // Android gives "he_IL" or "iw_IL"; "_" is a word character, so \b wouldn't end the code there.
  const id = I18nManager.getConstants().localeIdentifier ?? '';
  if (/^(he|iw)([-_]|$)/i.test(id)) return 'he';
  return /^ru([-_]|$)/i.test(id) ? 'ru' : 'en';
}

export function resolveLang(setting: LanguageSetting): Lang {
  return setting === 'HE' ? 'he' : setting === 'EN' ? 'en' : setting === 'RU' ? 'ru' : deviceLang();
}

/**
 * Switches to the language [setting] gives, laid out right-to-left for Hebrew. A change of
 * direction only shows after a reload, so the app then reloads, and true is returned meanwhile.
 */
export async function applyLanguage(setting: LanguageSetting): Promise<boolean> {
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
  await reloadAppAsync('Language changed').catch(() => {});
  return true;
}

/** From Settings: the open screens were drawn in the old language, so a change always reloads. */
export async function changeLanguage(setting: LanguageSetting) {
  const before = lang();
  if (!(await applyLanguage(setting)) && lang() !== before) await reloadAppAsync('Language changed').catch(() => {});
}
