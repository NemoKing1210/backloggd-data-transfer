import pkg from '../package.json' with { type: 'json' };

export const REPO_URL = 'https://github.com/NemoKing1210/backloggd-data-transfer';
export const SCRIPT_VERSION = pkg.version;

/** Author card for the About tab. */
export const AUTHOR = Object.freeze({
  name: 'NemoKing',
  handle: 'NemoKing1210',
  email: 'nemoking1210@gmail.com',
  avatarUrl: 'https://avatars.githubusercontent.com/u/58397369?v=4',
  githubUrl: 'https://github.com/NemoKing1210',
  profileUrl: 'https://nemoking1210.github.io/profile/',
  backloggdUrl: 'https://www.backloggd.com/u/NemoKing/',
});
export const SETTINGS_KEY = 'bdt_settings';
export const HISTORY_KEY = 'bdt_history';
/** Remembered CSV status/rating/platform value maps (raw label → target). */
export const CSV_VALUE_MAP_KEY = 'bdt_csv_value_maps';
/** Game match cache (title → Backloggd id/slug). */
export const GAME_CACHE_KEY = 'bdt_game_cache_v1';
/** Soft budget for game cache + related GM blobs shown in the Cache meter. */
export const CACHE_SOFT_LIMIT_BYTES = 5 * 1024 * 1024;
/** TTL for successful title→game matches. */
export const GAME_CACHE_HIT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** TTL for negative (not found) lookups — shorter so retries stay possible. */
export const GAME_CACHE_MISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;
/** Keep the latest N transfer sessions in GM storage. */
export const HISTORY_MAX_ENTRIES = 50;
export const ROOT_ATTR = 'data-bdt-root';
export const SCAN_DEBOUNCE_MS = 400;
/** Base delay after each network autocomplete lookup (per worker). */
export const MATCH_DELAY_MS = 280;
/** Default / clamp for parallel match lookups during Read. */
export const MATCH_CONCURRENCY = 4;
export const MATCH_CONCURRENCY_MIN = 1;
export const MATCH_CONCURRENCY_MAX = 8;
/** Default parallel fetches while indexing library shelves/pages. */
export const LIBRARY_CONCURRENCY = MATCH_CONCURRENCY;
/** Base delay between library page waves (when total pages are unknown). */
export const LIBRARY_PAGE_DELAY_MS = 180;

/** Canonical transfer file identity. */
export const TRANSFER_FORMAT_ID = 'backloggd-transfer';
/** v2 aligns entry fields with Backloggd log POST (`log`, `playthroughs`, `dates`). */
export const TRANSFER_FORMAT_VERSION = 2;

/** Filename prefix for downloaded transfer JSON. */
export const TRANSFER_FILENAME_PREFIX = 'backloggd-transfer';

/**
 * Values for `log.status` on Backloggd (shelves + played-status modal).
 * `played` ≠ `completed`: Played = “nothing specific”, Completed = main objective beaten.
 */
export const LOG_STATUS_KEYS = Object.freeze([
  'wishlist',
  'backlog',
  'playing',
  'played',
  'completed',
  'shelved',
  'abandoned',
  'retired',
]);

export const LOG_STATUS_LABELS = Object.freeze({
  wishlist: 'Wishlist',
  backlog: 'Backlog',
  playing: 'Playing',
  played: 'Played',
  completed: 'Completed',
  shelved: 'Shelved',
  abandoned: 'Abandoned',
  retired: 'Retired',
});

/** @deprecated use LOG_STATUS_KEYS */
export const STATUS_KEYS = LOG_STATUS_KEYS;
/** @deprecated use LOG_STATUS_LABELS */
export const STATUS_LABELS = LOG_STATUS_LABELS;

/**
 * Common alternate labels → `log.status`.
 */
export const ALT_STATUS_TO_CANONICAL = Object.freeze({
  'not started': null,
  planned: 'wishlist',
  deferred: 'shelved',
  'in progress': 'playing',
  dropped: 'abandoned',
  tried: 'retired',
  done: 'completed',
  played: 'played',
  completed: 'completed',
  // Open-ended / genre play styles → Played (“nothing specific”)
  session: 'played',
  infinity: 'played',
  infinite: 'played',
  endless: 'played',
  mmorpg: 'played',
  roguelike: 'played',
  sandbox: 'played',
  gacha: 'played',
  // Notion / Plus export labels (case-insensitive keys)
  wishlist: 'wishlist',
  backlog: 'backlog',
  playing: 'playing',
  shelved: 'shelved',
  abandoned: 'abandoned',
  retired: 'retired',
});

export const DEFAULT_SETTINGS = {
  uiLocale: 'auto',
  importDelayMs: 1000,
  importFormat: 'json',
  /** When false, games already in the user's library stay unchecked by default. */
  importExisting: false,
  /** Parallel Backloggd autocomplete lookups during match. */
  matchConcurrency: MATCH_CONCURRENCY,
  debugMode: false,
};
