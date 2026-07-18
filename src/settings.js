import {
  DEFAULT_SETTINGS,
  MATCH_CONCURRENCY,
  MATCH_CONCURRENCY_MAX,
  MATCH_CONCURRENCY_MIN,
  SETTINGS_KEY,
} from './constants.js';
import { GM_getValue, GM_setValue } from '$';

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 */
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {Record<string, unknown>} [raw]
 */
export function normalizeSettings(raw = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...raw };
  const locale = String(merged.uiLocale || 'auto');
  merged.uiLocale = ['auto', 'en', 'ru'].includes(locale) ? locale : 'auto';
  merged.importFormat =
    merged.importFormat === 'csv' || merged.importFormat === 'json'
      ? merged.importFormat
      : 'json';
  merged.importExisting = Boolean(merged.importExisting);
  merged.debugMode = Boolean(merged.debugMode);
  merged.importDelayMs = clampInt(merged.importDelayMs, 0, 15_000, 1000);
  merged.matchConcurrency = clampInt(
    merged.matchConcurrency,
    MATCH_CONCURRENCY_MIN,
    MATCH_CONCURRENCY_MAX,
    MATCH_CONCURRENCY,
  );
  return merged;
}

export function loadSettings() {
  try {
    const raw = GM_getValue(SETTINGS_KEY, null);
    if (!raw || typeof raw !== 'object') {
      return normalizeSettings();
    }
    return normalizeSettings(/** @type {Record<string, unknown>} */ (raw));
  } catch (_) {
    return normalizeSettings();
  }
}

export function saveSettings(next) {
  const merged = normalizeSettings(next);
  GM_setValue(SETTINGS_KEY, merged);
  return merged;
}
