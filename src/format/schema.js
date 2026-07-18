import {
  LOG_STATUS_KEYS,
  TRANSFER_FORMAT_ID,
  TRANSFER_FORMAT_VERSION,
} from '../constants.js';

/**
 * Transfer JSON mirrors Backloggd’s log POST body
 * (`/api/user/{userId}/log/{gameId}`), so import can map 1:1 into form fields.
 *
 * Document wrapper (`format`, `version`, `source`, …) is ours; entry payload
 * uses the same names as `log[...]`, `playthroughs[...]`, `dates[...]`.
 */

/**
 * @typedef {object} TransferSource
 * @property {string} platform
 * @property {string} [label]
 * @property {string} [url]
 */

/**
 * @typedef {object} TransferLog
 * @property {string|number|null} [id]  Existing Backloggd log id (empty = create)
 * @property {string} [last_edited_at]
 * @property {boolean} game_liked
 * @property {boolean} is_play
 * @property {boolean} is_playing
 * @property {boolean} is_backlog
 * @property {boolean} is_wishlist
 * @property {string|null} status  e.g. completed | playing | backlog | wishlist | …
 * @property {number|null} total_hours
 * @property {number|null} total_minutes
 * @property {number|null} time_source
 * @property {number|null} override_cover_id
 */

/**
 * @typedef {object} TransferPlaythrough
 * @property {string} title           Platform label, e.g. "Windows PC"
 * @property {number|null} rating     Backloggd 1–10 half-star scale
 * @property {string} review
 * @property {boolean} review_spoilers
 * @property {number|null} platform   Platform id (e.g. 6 = Windows PC)
 * @property {number|null} hours_played
 * @property {number|null} mins_played
 * @property {boolean} is_master
 * @property {boolean} is_replay
 * @property {string} start_date      YYYY-MM-DD or ""
 * @property {string} finish_date
 * @property {number|null} edition_id
 * @property {string|null} edition_type
 * @property {number|null} medium_id
 * @property {number|null} played_platform
 * @property {number|null} storefront_id
 * @property {number|null} hours_finished
 * @property {number|null} mins_finished
 * @property {number|null} hours_mastered
 * @property {number|null} mins_mastered
 * @property {boolean} sync_sessions
 */

/**
 * @typedef {object} TransferDateSession
 * @property {string} range_start_date
 * @property {string} range_end_date
 * @property {number|null} status
 * @property {string} note
 * @property {number|null} hours
 * @property {number|null} minutes
 * @property {string} start_date
 * @property {string} finish_date
 */

/**
 * @typedef {object} TransferEntry
 * @property {number|null} game_id
 * @property {string} title   Required for search when game_id is unknown
 * @property {string} [slug]
 * @property {TransferLog} log
 * @property {TransferPlaythrough[]} playthroughs
 * @property {TransferDateSession[]} dates
 */

/**
 * @typedef {object} TransferDocument
 * @property {'backloggd-transfer'} format
 * @property {number} version
 * @property {string} exportedAt
 * @property {TransferSource} source
 * @property {TransferEntry[]} entries
 */

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

/** Backloggd log.status string (completed, playing, …). */
export function normalizeLogStatus(raw) {
  if (raw == null || raw === '') return null;
  let key = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (key === 'played' || key === 'done') key = 'completed';
  if (LOG_STATUS_KEYS.includes(key)) return key;
  return null;
}

/** Accept 1–10 (API) or 0.5–5 stars → integer 1–10. */
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

function toBool(raw, fallback = false) {
  if (typeof raw === 'boolean') return raw;
  if (raw == null || raw === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

function toNullableNumber(raw) {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Derive is_* flags from log.status when flags were omitted.
 * @param {string|null} status
 */
export function flagsFromLogStatus(status) {
  const s = normalizeLogStatus(status);
  return {
    is_play: s === 'completed',
    is_playing: s === 'playing',
    is_backlog: s === 'backlog',
    is_wishlist: s === 'wishlist',
  };
}

/**
 * @param {Partial<TransferLog>} [partial]
 * @returns {TransferLog}
 */
export function createLog(partial = {}) {
  const status = normalizeLogStatus(partial.status);
  const fromStatus = flagsFromLogStatus(status);
  const hasExplicitFlags =
    partial.is_play != null ||
    partial.is_playing != null ||
    partial.is_backlog != null ||
    partial.is_wishlist != null;

  return {
    game_liked: toBool(partial.game_liked, false),
    is_play: hasExplicitFlags ? toBool(partial.is_play, false) : fromStatus.is_play,
    is_playing: hasExplicitFlags ? toBool(partial.is_playing, false) : fromStatus.is_playing,
    is_backlog: hasExplicitFlags ? toBool(partial.is_backlog, false) : fromStatus.is_backlog,
    is_wishlist: hasExplicitFlags ? toBool(partial.is_wishlist, false) : fromStatus.is_wishlist,
    status,
    total_hours: toNullableNumber(partial.total_hours),
    total_minutes: toNullableNumber(partial.total_minutes),
    time_source: toNullableNumber(partial.time_source) ?? 1,
    override_cover_id: toNullableNumber(partial.override_cover_id),
  };
}

/**
 * @param {Partial<TransferPlaythrough>} [partial]
 * @returns {TransferPlaythrough}
 */
export function createPlaythrough(partial = {}) {
  return {
    title: String(partial.title || '').trim(),
    rating: normalizeRating(partial.rating),
    review: String(partial.review || ''),
    review_spoilers: toBool(partial.review_spoilers, false),
    platform: toNullableNumber(partial.platform),
    hours_played: toNullableNumber(partial.hours_played),
    mins_played: toNullableNumber(partial.mins_played),
    is_master: toBool(partial.is_master, false),
    is_replay: toBool(partial.is_replay, false),
    start_date: normalizeDate(partial.start_date),
    finish_date: normalizeDate(partial.finish_date),
    edition_id: toNullableNumber(partial.edition_id),
    edition_type:
      partial.edition_type == null || partial.edition_type === ''
        ? null
        : String(partial.edition_type),
    medium_id: toNullableNumber(partial.medium_id),
    played_platform: toNullableNumber(partial.played_platform),
    storefront_id: toNullableNumber(partial.storefront_id),
    hours_finished: toNullableNumber(partial.hours_finished),
    mins_finished: toNullableNumber(partial.mins_finished),
    hours_mastered: toNullableNumber(partial.hours_mastered),
    mins_mastered: toNullableNumber(partial.mins_mastered),
    sync_sessions: toBool(partial.sync_sessions, false),
  };
}

/**
 * @param {Partial<TransferDateSession>} [partial]
 * @returns {TransferDateSession}
 */
export function createDateSession(partial = {}) {
  return {
    range_start_date: normalizeDate(partial.range_start_date),
    range_end_date: normalizeDate(partial.range_end_date),
    status: toNullableNumber(partial.status),
    note: String(partial.note || ''),
    hours: toNullableNumber(partial.hours),
    minutes: toNullableNumber(partial.minutes),
    start_date: normalizeDate(partial.start_date),
    finish_date: normalizeDate(partial.finish_date),
  };
}

/**
 * Migrate flat v1 entry shape → v2 API-aligned shape.
 * @param {Record<string, unknown>} raw
 */
export function migrateV1Entry(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.log || Array.isArray(raw.playthroughs)) return raw;

  const status = normalizeLogStatus(
    /** @type {string} */ (raw.status) === 'played' ? 'completed' : raw.status,
  );
  const start = normalizeDate(raw.dateStart || raw.start_date);
  const end = normalizeDate(raw.dateEnd || raw.finish_date);

  return {
    game_id: raw.game_id ?? raw.externalIds?.backloggd ?? null,
    title: raw.title,
    slug: raw.slug || '',
    log: {
      game_liked: raw.favorite ?? raw.game_liked,
      status,
      is_play: status === 'completed',
      is_playing: status === 'playing',
      is_backlog: status === 'backlog',
      is_wishlist: status === 'wishlist',
    },
    playthroughs: [
      {
        title: raw.platform || '',
        rating: raw.rating,
        review: raw.review || '',
        start_date: start,
        finish_date: end,
      },
    ],
    dates:
      start || end
        ? [
            {
              range_start_date: start,
              range_end_date: end || start,
              start_date: start,
              finish_date: end,
            },
          ]
        : [],
  };
}

/**
 * @param {Partial<TransferEntry> & Record<string, unknown>} partial
 * @returns {TransferEntry}
 */
export function createEntry(partial = {}) {
  const raw = migrateV1Entry(partial);
  const title = String(raw.title || '').trim();
  const playthroughs = Array.isArray(raw.playthroughs)
    ? raw.playthroughs.map((p) => createPlaythrough(p))
    : [createPlaythrough({})];
  const dates = Array.isArray(raw.dates)
    ? raw.dates.map((d) => createDateSession(d))
    : [];

  return {
    game_id: toNullableNumber(raw.game_id),
    title,
    slug: String(raw.slug || '').trim(),
    log: createLog(raw.log && typeof raw.log === 'object' ? raw.log : {}),
    playthroughs: playthroughs.length ? playthroughs : [createPlaythrough({})],
    dates,
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
    entries: (entries || [])
      .map((e) => createEntry(e))
      .filter((e) => e.title || e.game_id != null),
  };
}

/** @param {TransferEntry} entry */
export function entryDisplayTitle(entry) {
  return String(entry?.title || '').trim() || (entry?.game_id != null ? `#${entry.game_id}` : '');
}

/** @param {TransferEntry} entry */
export function primaryPlaythrough(entry) {
  return entry?.playthroughs?.[0] || createPlaythrough({});
}
