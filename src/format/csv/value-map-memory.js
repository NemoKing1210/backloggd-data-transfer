import { GM_getValue, GM_setValue } from '$';
import { CSV_VALUE_MAP_KEY } from '../../constants.js';

/**
 * @typedef {{
 *   status: Record<string, string>,
 *   rating: Record<string, string>,
 *   platform: Record<string, string>,
 * }} CsvValueMapMemory
 */

/**
 * @returns {CsvValueMapMemory}
 */
export function loadCsvValueMapMemory() {
  try {
    const raw = GM_getValue(CSV_VALUE_MAP_KEY, null);
    if (!raw || typeof raw !== 'object') {
      return emptyMemory();
    }
    return {
      status: normalizeMap(raw.status),
      rating: normalizeMap(raw.rating),
      platform: normalizeMap(raw.platform),
    };
  } catch (_) {
    return emptyMemory();
  }
}

/**
 * Persist status/rating/platform value maps (keys stored lowercased).
 * @param {{
 *   status?: Record<string, string>,
 *   rating?: Record<string, string>,
 *   platform?: Record<string, string>,
 * }} valueMaps
 */
export function rememberCsvValueMaps(valueMaps) {
  const current = loadCsvValueMapMemory();
  const next = {
    status: { ...current.status, ...toMemoryEntries(valueMaps?.status) },
    rating: { ...current.rating, ...toMemoryEntries(valueMaps?.rating) },
    platform: { ...current.platform, ...toMemoryEntries(valueMaps?.platform) },
  };
  try {
    GM_setValue(CSV_VALUE_MAP_KEY, next);
  } catch (_) {
    /* ignore quota / private mode */
  }
  return next;
}

/**
 * Overlay remembered choices onto a suggested map for the current file's raw values.
 * @param {Record<string, string>} suggested
 * @param {Record<string, string>} remembered lowercased keys
 * @param {{ raw: string }[]} values
 * @returns {Record<string, string>}
 */
export function applyRememberedValueMap(suggested, remembered, values) {
  const out = { ...suggested };
  for (const item of values || []) {
    const raw = item?.raw;
    if (!raw) continue;
    const key = String(raw).trim().toLowerCase();
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(remembered, key)) {
      out[raw] = remembered[key] ?? '';
    }
  }
  return out;
}

/** @returns {CsvValueMapMemory} */
function emptyMemory() {
  return { status: {}, rating: {}, platform: {} };
}

/**
 * @param {unknown} raw
 * @returns {Record<string, string>}
 */
function normalizeMap(raw) {
  if (!raw || typeof raw !== 'object') return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    const k = String(key || '').trim().toLowerCase();
    if (!k) continue;
    out[k] = value == null ? '' : String(value);
  }
  return out;
}

/**
 * @param {Record<string, string> | undefined} map
 * @returns {Record<string, string>}
 */
function toMemoryEntries(map) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!map || typeof map !== 'object') return out;
  for (const [raw, value] of Object.entries(map)) {
    const key = String(raw || '').trim().toLowerCase();
    if (!key) continue;
    out[key] = value == null ? '' : String(value);
  }
  return out;
}
