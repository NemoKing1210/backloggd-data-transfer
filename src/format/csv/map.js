import { createDocument } from '../schema.js';
import { parseFavorite } from '../status.js';
import {
  resolvePlatformValue,
  resolveRatingValue,
  resolveStatusValue,
} from './value-map.js';

/**
 * @typedef {{
 *   key: string,
 *   required?: boolean,
 *   aliases: string[],
 * }} CsvTargetField
 */

/** Mappable import fields (CSV columns → transfer entry). */
export const CSV_TARGET_FIELDS = Object.freeze([
  {
    key: 'title',
    required: true,
    aliases: ['name', 'title', 'game', 'game name', 'game_title', 'game title'],
  },
  {
    key: 'status',
    aliases: ['status', 'state', 'list', 'shelf', 'progress'],
  },
  {
    key: 'rating',
    aliases: ['rating', 'score', 'stars', 'my rating', 'user rating'],
  },
  {
    key: 'start_date',
    aliases: [
      'date start',
      'start date',
      'start_date',
      'started',
      'date started',
      'started at',
      'begin',
    ],
  },
  {
    key: 'finish_date',
    aliases: [
      'date end',
      'end date',
      'finish date',
      'finish_date',
      'completed date',
      'date finished',
      'finished',
      'finished at',
    ],
  },
  {
    key: 'review',
    aliases: ['review', 'summary', 'notes', 'comment', 'description', 'text'],
  },
  {
    key: 'platform',
    aliases: ['platform', 'platforms', 'system', 'console', 'device'],
  },
  {
    key: 'favorite',
    aliases: ['favorite', 'favourite', 'liked', 'heart', 'game_liked', 'fav'],
  },
  {
    key: 'hours',
    aliases: [
      'time to complete',
      'hours',
      'hours played',
      'playtime',
      'play time',
      'hltb',
      'total hours',
    ],
  },
  {
    key: 'game_id',
    aliases: [
      'game_id',
      'game id',
      'backloggd_id',
      'backloggd id',
      'bg_id',
      'bg id',
    ],
  },
  {
    key: 'slug',
    aliases: ['slug', 'backloggd_slug', 'backloggd slug'],
  },
]);

/**
 * @param {string} value
 */
function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_/]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * @param {string} header
 * @param {CsvTargetField} field
 * @returns {number}
 */
function scoreHeaderForField(header, field) {
  const h = normalizeHeader(header);
  if (!h) return 0;

  let best = 0;
  for (const alias of field.aliases) {
    const a = normalizeHeader(alias);
    if (!a) continue;
    if (h === a) best = Math.max(best, 100);
    else if (h.startsWith(a) || a.startsWith(h)) best = Math.max(best, 78);
    else if (h.includes(a) || a.includes(h)) best = Math.max(best, 55);
  }

  if (field.key === 'game_id' && (h === 'id' || h === 'row id')) return 0;
  if (field.key === 'rating' && h.includes('expected')) best = Math.min(best, 20);

  return best;
}

/**
 * Auto-detect column → field mapping.
 * @param {string[]} headers
 * @returns {Record<string, string>}
 */
export function suggestCsvMapping(headers) {
  /** @type {Record<string, string>} */
  const mapping = {};
  for (const field of CSV_TARGET_FIELDS) mapping[field.key] = '';

  /** @type {{ field: CsvTargetField, header: string, score: number }[]} */
  const candidates = [];
  for (const field of CSV_TARGET_FIELDS) {
    for (const header of headers) {
      const score = scoreHeaderForField(header, field);
      if (score >= 55) candidates.push({ field, header, score });
    }
  }

  candidates.sort(
    (a, b) => b.score - a.score || a.field.key.localeCompare(b.field.key),
  );

  const usedHeaders = new Set();
  const usedFields = new Set();
  for (const item of candidates) {
    if (usedFields.has(item.field.key) || usedHeaders.has(item.header)) continue;
    mapping[item.field.key] = item.header;
    usedFields.add(item.field.key);
    usedHeaders.add(item.header);
  }

  return mapping;
}

/**
 * @param {Record<string, string>} mapping
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function validateCsvMapping(mapping) {
  if (!String(mapping?.title || '').trim()) {
    return { ok: false, error: 'Title column is required' };
  }
  return { ok: true };
}

/**
 * @param {{
 *   rows: Record<string, string>[],
 *   mapping: Record<string, string>,
 *   filename?: string,
 *   valueMaps?: {
 *     status?: Record<string, string>,
 *     rating?: Record<string, string>,
 *     platform?: Record<string, string>,
 *   },
 * }} input
 */
export function buildTransferFromCsv(input) {
  const mapping = input.mapping || {};
  const check = validateCsvMapping(mapping);
  if (!check.ok) return { ok: false, error: check.error };
  const statusMap = input.valueMaps?.status || {};
  const ratingMap = input.valueMaps?.rating || {};
  const platformMap = input.valueMaps?.platform || {};

  /** @type {object[]} */
  const entries = [];

  for (const row of input.rows || []) {
    const title = cell(row, mapping.title).trim();
    if (!title) continue;

    const status = resolveStatusValue(cell(row, mapping.status), statusMap);
    const rating = resolveRatingValue(cell(row, mapping.rating), ratingMap);
    const favorite = parseFavorite(cell(row, mapping.favorite));
    const resolvedPlatform = resolvePlatformValue(
      cell(row, mapping.platform),
      platformMap,
    );
    const platformLabel = resolvedPlatform?.name || '';
    const platformId = resolvedPlatform?.id ?? null;
    const start = cell(row, mapping.start_date);
    const finish = cell(row, mapping.finish_date);
    const review = cell(row, mapping.review);
    const slug = cell(row, mapping.slug).trim();
    const gameIdRaw = cell(row, mapping.game_id).trim();
    const gameId = /^\d+$/.test(gameIdRaw) ? Number(gameIdRaw) : null;
    const hours = parseHours(cell(row, mapping.hours));

    const whole = hours != null ? Math.floor(hours) : null;
    const mins =
      hours != null ? Math.round((hours - Math.floor(hours)) * 60) || null : null;

    /** @type {Record<string, unknown>} */
    const entry = {
      title,
      game_id: gameId,
      slug,
      log: {
        status,
        game_liked: favorite,
        total_hours: whole,
        total_minutes: mins,
      },
      playthroughs: [
        {
          title: platformLabel,
          platform: platformId,
          rating,
          review,
          start_date: start,
          finish_date: finish,
          hours_played: whole,
          mins_played: mins,
        },
      ],
    };

    entries.push(entry);
  }

  if (!entries.length) {
    return { ok: false, error: 'No rows with a title were found' };
  }

  return {
    ok: true,
    value: createDocument({
      source: {
        platform: 'csv',
        label: input.filename || 'CSV import',
      },
      entries,
    }),
  };
}

/**
 * @param {Record<string, string>[]} rows
 * @param {string} header
 * @param {number} [limit]
 */
export function sampleColumnValues(rows, header, limit = 3) {
  if (!header) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const value = String(row?.[header] ?? '').trim().replace(/\s+/g, ' ');
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value.length > 72 ? `${value.slice(0, 69)}…` : value);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * @param {Record<string, string>} row
 * @param {string} [header]
 */
function cell(row, header) {
  if (!header) return '';
  return row?.[header] == null ? '' : String(row[header]);
}

/**
 * @param {string} raw
 * @returns {number | null}
 */
function parseHours(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const n = Number(s.replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
