import { TRANSLATIONS, resolveLocale } from './i18n/index.js';
import { loadSettings } from './settings.js';

export let settings = loadSettings();
export let locale = resolveLocale(settings.uiLocale);
export let t = TRANSLATIONS[locale] || TRANSLATIONS.en;

export function reloadRuntimeSettings() {
  settings = loadSettings();
  locale = resolveLocale(settings.uiLocale);
  t = TRANSLATIONS[locale] || TRANSLATIONS.en;
}
