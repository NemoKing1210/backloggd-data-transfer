import { LOG_STATUS_KEYS, LOG_STATUS_LABELS } from '../../constants.js';
import {
  findCanonicalPlatform,
  isCanonicalPlatformValue,
  mapPlatformToBackloggd,
  platformByIdOrName,
  platformSelectOptions,
} from '../platforms.js';
import { normalizeLogStatus, normalizeRating } from '../schema.js';
import {
  mapRatingToScore10,
  mapStatusToCanonical,
  RATING_SCORE_LABELS,
} from '../status.js';

/**
 * @typedef {{
 *   raw: string,
 *   count: number,
 *   needsMap: boolean,
 *   suggested: string | null,
 * }} StatusValueInfo
 *
 * @typedef {{
 *   raw: string,
 *   count: number,
 *   needsMap: boolean,
 *   suggested: number | null,
 * }} RatingValueInfo
 *
 * @typedef {{
 *   raw: string,
 *   count: number,
 *   needsMap: boolean,
 *   suggested: number | null,
 * }} PlatformValueInfo
 *
 * @typedef {{
 *   needed: boolean,
 *   values: StatusValueInfo[],
 *   mappedCount: number,
 *   unmappedCount: number,
 * }} StatusValueAnalysis
 *
 * @typedef {{
 *   needed: boolean,
 *   values: RatingValueInfo[],
 *   mappedCount: number,
 *   unmappedCount: number,
 * }} RatingValueAnalysis
 *
 * @typedef {{
 *   needed: boolean,
 *   values: PlatformValueInfo[],
 *   mappedCount: number,
 *   unmappedCount: number,
 * }} PlatformValueAnalysis
 *
 * @typedef {{ id: number, name: string } | null} ResolvedPlatform
 */

/**
 * Unique non-empty cell values with counts (preserve first-seen casing).
 * @param {Record<string, string>[]} rows
 * @param {string} header
 * @returns {{ raw: string, count: number }[]}
 */
export function collectColumnValueCounts(rows, header) {
  if (!header) return [];
  /** @type {Map<string, { raw: string, count: number }>} */
  const map = new Map();
  for (const row of rows || []) {
    const raw = String(row?.[header] ?? '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const prev = map.get(key);
    if (prev) prev.count += 1;
    else map.set(key, { raw, count: 1 });
  }
  return [...map.values()].sort(
    (a, b) => b.count - a.count || a.raw.localeCompare(b.raw),
  );
}

/**
 * True when value is already a Backloggd `log.status` key/label.
 * @param {string} raw
 */
export function isCanonicalStatusValue(raw) {
  return Boolean(normalizeLogStatus(raw));
}

/**
 * True when value is already a numeric Backloggd rating (1–10 or 0.5–5 stars).
 * @param {unknown} raw
 */
export function isCanonicalRatingValue(raw) {
  if (raw == null || raw === '') return false;
  if (typeof raw === 'number') return normalizeRating(raw) != null;
  const s = String(raw).trim();
  if (!s || /[a-zа-я]/i.test(s)) return false;
  const asNum = Number(s.replace(',', '.'));
  return Number.isFinite(asNum) && normalizeRating(asNum) != null;
}

/**
 * @param {Record<string, string>[]} rows
 * @param {string} header
 * @returns {StatusValueAnalysis}
 */
export function analyzeStatusValues(rows, header) {
  const counts = collectColumnValueCounts(rows, header);
  /** @type {StatusValueInfo[]} */
  const values = counts.map(({ raw, count }) => {
    const needsMap = !isCanonicalStatusValue(raw);
    const suggested = needsMap ? mapStatusToCanonical(raw) : normalizeLogStatus(raw);
    return { raw, count, needsMap, suggested };
  });
  const mappedCount = values.filter((v) => v.needsMap && v.suggested).length;
  const unmappedCount = values.filter((v) => v.needsMap && !v.suggested).length;
  return {
    needed: values.some((v) => v.needsMap),
    values,
    mappedCount,
    unmappedCount,
  };
}

/**
 * @param {Record<string, string>[]} rows
 * @param {string} header
 * @returns {RatingValueAnalysis}
 */
export function analyzeRatingValues(rows, header) {
  const counts = collectColumnValueCounts(rows, header);
  /** @type {RatingValueInfo[]} */
  const values = counts.map(({ raw, count }) => {
    const needsMap = !isCanonicalRatingValue(raw);
    const suggested = needsMap ? mapRatingToScore10(raw) : normalizeRating(Number(String(raw).replace(',', '.')));
    return { raw, count, needsMap, suggested };
  });
  const mappedCount = values.filter((v) => v.needsMap && v.suggested != null).length;
  const unmappedCount = values.filter((v) => v.needsMap && v.suggested == null).length;
  return {
    needed: values.some((v) => v.needsMap),
    values,
    mappedCount,
    unmappedCount,
  };
}

/**
 * Default status raw→canonical map for UI.
 * @param {StatusValueAnalysis} analysis
 * @returns {Record<string, string>}
 */
export function suggestStatusValueMap(analysis) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const item of analysis.values || []) {
    if (!item.needsMap) {
      out[item.raw] = normalizeLogStatus(item.raw) || '';
      continue;
    }
    out[item.raw] = item.suggested || '';
  }
  return out;
}

/**
 * Default rating raw→score map for UI (empty string = skip).
 * @param {RatingValueAnalysis} analysis
 * @returns {Record<string, string>}
 */
export function suggestRatingValueMap(analysis) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const item of analysis.values || []) {
    if (!item.needsMap) {
      const n = normalizeRating(Number(String(item.raw).replace(',', '.')));
      out[item.raw] = n != null ? String(n) : '';
      continue;
    }
    out[item.raw] = item.suggested != null ? String(item.suggested) : '';
  }
  return out;
}

/**
 * @param {Record<string, string>[]} rows
 * @param {string} header
 * @returns {PlatformValueAnalysis}
 */
export function analyzePlatformValues(rows, header) {
  const counts = collectColumnValueCounts(rows, header);
  /** @type {PlatformValueInfo[]} */
  const values = counts.map(({ raw, count }) => {
    const needsMap = !isCanonicalPlatformValue(raw);
    const suggested = needsMap
      ? mapPlatformToBackloggd(raw)?.id ?? null
      : findCanonicalPlatform(raw)?.id ?? null;
    return { raw, count, needsMap, suggested };
  });
  const mappedCount = values.filter((v) => v.needsMap && v.suggested != null).length;
  const unmappedCount = values.filter((v) => v.needsMap && v.suggested == null).length;
  return {
    needed: values.some((v) => v.needsMap),
    values,
    mappedCount,
    unmappedCount,
  };
}

/**
 * Default platform raw→id map for UI (empty string = skip).
 * @param {PlatformValueAnalysis} analysis
 * @returns {Record<string, string>}
 */
export function suggestPlatformValueMap(analysis) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const item of analysis.values || []) {
    if (!item.needsMap) {
      const hit = findCanonicalPlatform(item.raw);
      out[item.raw] = hit ? String(hit.id) : '';
      continue;
    }
    out[item.raw] = item.suggested != null ? String(item.suggested) : '';
  }
  return out;
}

/**
 * Resolve status using user map first, then built-in heuristics.
 * @param {string} raw
 * @param {Record<string, string>} [valueMap]
 * @returns {string | null}
 */
export function resolveStatusValue(raw, valueMap) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, s)) {
    const mapped = valueMap[s];
    if (!mapped) return null;
    return normalizeLogStatus(mapped) || mapStatusToCanonical(mapped);
  }
  // case-insensitive lookup in map
  if (valueMap) {
    const hit = Object.entries(valueMap).find(
      ([k]) => k.toLowerCase() === s.toLowerCase(),
    );
    if (hit) {
      if (!hit[1]) return null;
      return normalizeLogStatus(hit[1]) || mapStatusToCanonical(hit[1]);
    }
  }
  return mapStatusToCanonical(s);
}

/**
 * Resolve rating using user map first, then built-in heuristics.
 * @param {string} raw
 * @param {Record<string, string>} [valueMap] raw → "1"…"10" or ""
 * @returns {number | null}
 */
export function resolveRatingValue(raw, valueMap) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, s)) {
    const mapped = valueMap[s];
    if (!mapped) return null;
    return normalizeRating(Number(mapped));
  }
  if (valueMap) {
    const hit = Object.entries(valueMap).find(
      ([k]) => k.toLowerCase() === s.toLowerCase(),
    );
    if (hit) {
      if (!hit[1]) return null;
      return normalizeRating(Number(hit[1]));
    }
  }
  return mapRatingToScore10(s);
}

/**
 * Resolve platform using user map first, then built-in aliases.
 * @param {string} raw
 * @param {Record<string, string>} [valueMap] raw → platform id string or ""
 * @returns {ResolvedPlatform}
 */
export function resolvePlatformValue(raw, valueMap) {
  const s = String(raw || '').trim();
  if (!s) return null;

  const fromMap = (mapped) => {
    if (!mapped) return null;
    return platformByIdOrName(mapped);
  };

  if (valueMap && Object.prototype.hasOwnProperty.call(valueMap, s)) {
    return fromMap(valueMap[s]);
  }
  if (valueMap) {
    const hit = Object.entries(valueMap).find(
      ([k]) => k.toLowerCase() === s.toLowerCase(),
    );
    if (hit) return fromMap(hit[1]);
  }
  return mapPlatformToBackloggd(s);
}

/** Options for status select in value-map UI. */
export function statusSelectOptions() {
  return LOG_STATUS_KEYS.map((key) => ({
    value: key,
    label: LOG_STATUS_LABELS[key] || key,
  }));
}

/** Options for rating select (Backloggd 1–10 + Plus-style labels). */
export function ratingSelectOptions() {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => ({
    value: String(score),
    label: `${score} · ${RATING_SCORE_LABELS[score] || ''} · ${score / 2}★`,
  }));
}

/** Re-export for UI. */
export { platformSelectOptions };
