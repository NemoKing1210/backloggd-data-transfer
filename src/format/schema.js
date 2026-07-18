import {
  STATUS_KEYS,
  TRANSFER_FORMAT_ID,
  TRANSFER_FORMAT_VERSION,
} from '../constants.js';

/**
 * @typedef {object} TransferSource
 * @property {string} platform  e.g. "notion" | "steam" | "backloggd" | "custom"
 * @property {string} [label]
 * @property {string} [url]
 */

/**
 * @typedef {object} TransferEntry
 * @property {string} title
 * @property {string|null} [status]  Canonical Backloggd key or null
 * @property {number|null} [rating]  Backloggd half-star scale 1–10, or null
 * @property {boolean} [favorite]
 * @property {string} [platform]
 * @property {string} [dateStart]    ISO date YYYY-MM-DD
 * @property {string} [dateEnd]
 * @property {string} [review]
 * @property {boolean} [isDlc]
 * @property {string[]} [tags]
 * @property {Record<string, string|number>} [externalIds]
 * @property {Record<string, unknown>} [sourceFields]  Opaque extras from the exporter
 */

/**
 * @typedef {object} TransferDocument
 * @property {'backloggd-transfer'} format
 * @property {number} version
 * @property {string} exportedAt  ISO datetime
 * @property {TransferSource} source
 * @property {TransferEntry[]} entries
 */

/**
 * @param {Partial<TransferEntry>} partial
 * @returns {TransferEntry}
 */
export function createEntry(partial = {}) {
  const title = String(partial.title || '').trim();
  return {
    title,
    status: normalizeStatus(partial.status),
    rating: normalizeRating(partial.rating),
    favorite: Boolean(partial.favorite),
    platform: String(partial.platform || '').trim(),
    dateStart: normalizeDate(partial.dateStart),
    dateEnd: normalizeDate(partial.dateEnd),
    review: String(partial.review || '').trim(),
    isDlc: Boolean(partial.isDlc),
    tags: Array.isArray(partial.tags)
      ? partial.tags.map((t) => String(t).trim()).filter(Boolean)
      : [],
    externalIds:
      partial.externalIds && typeof partial.externalIds === 'object'
        ? { ...partial.externalIds }
        : {},
    sourceFields:
      partial.sourceFields && typeof partial.sourceFields === 'object'
        ? { ...partial.sourceFields }
        : {},
  };
}

/**
 * @param {object} options
 * @param {TransferSource} options.source
 * @param {TransferEntry[]} options.entries
 * @param {string} [options.exportedAt]
 * @returns {TransferDocument}
 */
export function createDocument({ source, entries, exportedAt }) {
  return {
    format: TRANSFER_FORMAT_ID,
    version: TRANSFER_FORMAT_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    source: {
      platform: String(source?.platform || 'custom').trim() || 'custom',
      ...(source?.label ? { label: String(source.label) } : {}),
      ...(source?.url ? { url: String(source.url) } : {}),
    },
    entries: (entries || []).map((e) => createEntry(e)).filter((e) => e.title),
  };
}

export function normalizeStatus(raw) {
  if (raw == null || raw === '') return null;
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (STATUS_KEYS.includes(key)) return key;
  return null;
}

/** Accept 1–10 (Backloggd) or 0.5–5 stars; store as integer 1–10. */
export function normalizeRating(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n >= 1 && n <= 10 && Number.isInteger(n)) return n;
  if (n > 0 && n <= 5) {
    const score10 = Math.round(n * 2);
    return score10 >= 1 && score10 <= 10 ? score10 : null;
  }
  return null;
}

export function normalizeDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) {
    const dd = dmy[1].padStart(2, '0');
    const mm = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mm}-${dd}`;
  }
  return '';
}
