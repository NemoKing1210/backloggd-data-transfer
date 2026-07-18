import { TRANSLATIONS } from './translations.js';

export { TRANSLATIONS };

export const SUPPORTED_LOCALES = ['en', 'ru'];

export const LOCALE_NATIVE_NAMES = {
  en: 'English',
  ru: 'Русский',
};

export function detectLocale() {
  const raw = String(navigator.language || 'en').toLowerCase();
  const short = raw.slice(0, 2);
  return SUPPORTED_LOCALES.includes(short) ? short : 'en';
}

export function resolveLocale(pref) {
  const value = pref || 'auto';
  if (value !== 'auto' && SUPPORTED_LOCALES.includes(value)) return value;
  return detectLocale();
}

export function fmt(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] == null ? '' : String(vars[k]),
  );
}
