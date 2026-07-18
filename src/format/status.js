import { ALT_STATUS_TO_CANONICAL, STATUS_LABELS } from '../constants.js';
import { normalizeRating, normalizeStatus } from './schema.js';

/** Text rating labels → Backloggd 1–10 (same ladder as Backloggd Plus). */
const RATING_LABEL_TO_SCORE = Object.freeze({
  terrible: 1,
  bad: 2,
  mediocre: 3,
  normal: 5,
  good: 6,
  great: 7,
  excellent: 8,
  amazing: 10,
});

/**
 * Map a free-form status string (site label, alternate label, or key) to canonical key.
 * @param {string} raw
 * @returns {string|null}
 */
export function mapStatusToCanonical(raw) {
  const direct = normalizeStatus(raw);
  if (direct) return direct;

  const v = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!v) return null;

  if (v in ALT_STATUS_TO_CANONICAL) {
    return ALT_STATUS_TO_CANONICAL[v];
  }

  for (const [key, label] of Object.entries(STATUS_LABELS)) {
    if (label.toLowerCase() === v) return key;
  }

  if (v === 'completed' || v === 'done') return 'played';
  if (v === 'in progress') return 'playing';
  return null;
}

/**
 * Parse Notion-style rating (text label, numeric stars, or 1–10).
 * @param {unknown} raw
 * @returns {number|null}
 */
export function mapRatingToScore10(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return normalizeRating(raw);

  const s = String(raw).trim();
  if (!s) return null;

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

export function parseIsDlc(raw) {
  return parseFavorite(raw);
}
