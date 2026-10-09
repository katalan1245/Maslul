import { en } from './en';
import { he } from './he';

export type Lang = 'en' | 'he';
export type Strings = typeof en;

export const LANGUAGES = ['SYSTEM', 'HE', 'EN'] as const;
export type LanguageSetting = (typeof LANGUAGES)[number];

let current: Lang = 'en';
let set = false;
/**
 * The app's text in the current language. Read it when the text is shown, not at module load:
 * the language is set once the saved settings are read, and changing it reloads the app.
 */
export let S: Strings = en;

export function setLanguage(l: Lang) {
  current = l;
  set = true;
  S = l === 'he' ? he : en;
}

export const lang = (): Lang => current;
/** False until the settings (or a restored trip) gave a language; English is shown meanwhile. */
export const languageSet = () => set;
