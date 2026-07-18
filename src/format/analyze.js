import { STATUS_LABELS } from '../constants.js';

/**
 * @typedef {object} TransferAnalysis
 * @property {number} version
 * @property {string} platform
 * @property {string} label
 * @property {string} exportedAt
 * @property {number} total
 * @property {number} uniqueTitles
 * @property {number} duplicates
 * @property {number} withRating
 * @property {number} favorites
 * @property {number} withDates
 * @property {number} withReview
 * @property {Record<string, number>} byStatus
 * @property {number|null} newCount  null until Backloggd diff is implemented
 * @property {number|null} existingCount
 */

/**
 * Summarize a parsed transfer document (local stats only; site “new” check TBD).
 * @param {import('./schema.js').TransferDocument} doc
 * @returns {TransferAnalysis}
 */
export function analyzeTransferDocument(doc) {
  const entries = doc?.entries || [];
  const titles = new Set();
  let withRating = 0;
  let favorites = 0;
  let withDates = 0;
  let withReview = 0;
  /** @type {Record<string, number>} */
  const byStatus = {};

  for (const entry of entries) {
    const titleKey = String(entry.title || '')
      .trim()
      .toLowerCase();
    if (titleKey) titles.add(titleKey);

    if (entry.rating != null) withRating += 1;
    if (entry.favorite) favorites += 1;
    if (entry.dateStart || entry.dateEnd) withDates += 1;
    if (entry.review) withReview += 1;

    const status = entry.status || 'none';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  const total = entries.length;
  const uniqueTitles = titles.size;

  return {
    version: Number(doc.version) || 0,
    platform: String(doc.source?.platform || 'custom'),
    label: String(doc.source?.label || ''),
    exportedAt: String(doc.exportedAt || ''),
    total,
    uniqueTitles,
    duplicates: Math.max(0, total - uniqueTitles),
    withRating,
    favorites,
    withDates,
    withReview,
    byStatus,
    newCount: null,
    existingCount: null,
  };
}

/** Human label for a status key in analysis UI. */
export function statusDisplayLabel(key, fallbackNone = '—') {
  if (!key || key === 'none') return fallbackNone;
  return STATUS_LABELS[key] || key;
}
