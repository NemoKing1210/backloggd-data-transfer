import { ALT_STATUS_TO_CANONICAL, LOG_STATUS_LABELS } from '../constants.js';
import { normalizeLogStatus, normalizeRating } from './schema.js';

/**
 * Notion / Plus-style text labels → Backloggd API score 1–10.
 * Aligns with backloggd-plus `ratingScoreToLabel` (import direction).
 */
export const RATING_LABEL_TO_SCORE = Object.freeze({
  terrible: 1,
  bad: 2,
  mediocre: 3,
  normal: 5,
  good: 6,
  great: 7,
  excellent: 8,
  amazing: 10,
});

/** Backloggd score 1–10 → display label (Plus export ladder). */
export const RATING_SCORE_LABELS = Object.freeze({
  1: 'Terrible',
  2: 'Bad',
  3: 'Mediocre',
  4: 'Mediocre',
  5: 'Normal',
  6: 'Good',
  7: 'Great',
  8: 'Excellent',
  9: 'Excellent',
  10: 'Amazing',
});

/**
 * Map a free-form status string to `log.status`.
 * @param {string} raw
 * @returns {string|null}
 */
export function mapStatusToCanonical(raw) {
  const direct = normalizeLogStatus(raw);
  if (direct) return direct;

  const v = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!v) return null;

  if (Object.prototype.hasOwnProperty.call(ALT_STATUS_TO_CANONICAL, v)) {
    return ALT_STATUS_TO_CANONICAL[v];
  }

  for (const [key, label] of Object.entries(LOG_STATUS_LABELS)) {
    if (label.toLowerCase() === v) return key;
  }

  return null;
}

/**
 * Placeholder / empty rating cells from Notion and similar exports.
 * @param {unknown} raw
 * @returns {boolean}
 */
export function isRatingSkipValue(raw) {
  if (raw == null) return true;
  const s = String(raw).trim();
  if (!s) return true;
  const key = s.toLowerCase();
  return (
    key === '...' ||
    key === '…' ||
    key === '‥' ||
    key === '-' ||
    key === '–' ||
    key === '—' ||
    key === '−' ||
    key === 'n/a' ||
    key === 'na' ||
    key === 'none' ||
    key === 'null' ||
    key === 'nil' ||
    key === 'no rating' ||
    key === 'unrated' ||
    key === '?' ||
    key === '??' ||
    key === 'x' ||
    key === '.' ||
    key === '..'
  );
}

/**
 * @param {unknown} raw
 * @returns {number|null}
 */
export function mapRatingToScore10(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return normalizeRating(raw);

  const s = String(raw).trim();
  if (!s || isRatingSkipValue(s)) return null;

  const label = RATING_LABEL_TO_SCORE[s.toLowerCase()];
  if (label != null) return label;

  const asNum = Number(s.replace(',', '.'));
  if (Number.isFinite(asNum)) return normalizeRating(asNum);

  return null;
}

export function parseFavorite(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!v) return false;
  return v === 'yes' || v === 'true' || v === '1' || v === '✓' || v === 'checked';
}
