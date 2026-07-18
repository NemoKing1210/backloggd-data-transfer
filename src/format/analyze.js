import { LOG_STATUS_LABELS } from '../constants.js';
import { entryDisplayTitle, primaryPlaythrough } from './schema.js';

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
 * @property {number} withGameId
 * @property {number} foundCount
 * @property {number} notFoundCount
 * @property {number} existingCount
 * @property {Record<string, number>} byStatus
 */

/**
 * @param {import('./schema.js').TransferDocument} doc
 * @param {{ foundCount?: number, notFoundCount?: number, existingCount?: number }} [matchStats]
 * @returns {TransferAnalysis}
 */
export function analyzeTransferDocument(doc, matchStats = {}) {
  const entries = doc?.entries || [];
  const titles = new Set();
  let withRating = 0;
  let favorites = 0;
  let withDates = 0;
  let withReview = 0;
  let withGameId = 0;
  /** @type {Record<string, number>} */
  const byStatus = {};

  for (const entry of entries) {
    const titleKey = entryDisplayTitle(entry).toLowerCase();
    if (titleKey) titles.add(titleKey);

    const pt = primaryPlaythrough(entry);
    if (pt.rating != null) withRating += 1;
    if (entry.log?.game_liked) favorites += 1;
    if (
      pt.start_date ||
      pt.finish_date ||
      (entry.dates || []).some((d) => d.range_start_date || d.range_end_date)
    ) {
      withDates += 1;
    }
    if (pt.review) withReview += 1;
    if (entry.game_id != null) withGameId += 1;

    const status = entry.log?.status || 'none';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  const total = entries.length;
  const uniqueTitles = titles.size;
  const foundCount =
    matchStats.foundCount != null ? matchStats.foundCount : withGameId;
  const notFoundCount =
    matchStats.notFoundCount != null
      ? matchStats.notFoundCount
      : Math.max(0, total - foundCount);
  const existingCount =
    matchStats.existingCount != null ? matchStats.existingCount : 0;

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
    withGameId,
    foundCount,
    notFoundCount,
    existingCount,
    byStatus,
  };
}

export function statusDisplayLabel(key, fallbackNone = '—') {
  if (!key || key === 'none') return fallbackNone;
  return LOG_STATUS_LABELS[key] || key;
}
