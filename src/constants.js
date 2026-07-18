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
/** Keep the latest N transfer sessions in GM storage. */
export const HISTORY_MAX_ENTRIES = 50;
export const ROOT_ATTR = 'data-bdt-root';
export const SCAN_DEBOUNCE_MS = 400;
/** Base delay between Backloggd autocomplete lookups during Read/match. */
export const MATCH_DELAY_MS = 450;
/** Base delay between library page fetches. */
export const LIBRARY_PAGE_DELAY_MS = 280;

/** Canonical transfer file identity. */
export const TRANSFER_FORMAT_ID = 'backloggd-transfer';
/** v2 aligns entry fields with Backloggd log POST (`log`, `playthroughs`, `dates`). */
export const TRANSFER_FORMAT_VERSION = 2;

/** Filename prefix for downloaded transfer JSON. */
export const TRANSFER_FILENAME_PREFIX = 'backloggd-transfer';

/**
 * Values for `log.status` on Backloggd (see log create/update POST).
 * Legacy transfer v1 used `played` — normalize to `completed`.
 */
export const LOG_STATUS_KEYS = Object.freeze([
  'wishlist',
  'backlog',
  'playing',
  'completed',
  'shelved',
  'abandoned',
  'retired',
]);

export const LOG_STATUS_LABELS = Object.freeze({
  wishlist: 'Wishlist',
  backlog: 'Backlog',
  playing: 'Playing',
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
  played: 'completed',
  completed: 'completed',
  session: 'playing',
  infinity: 'playing',
  infinite: 'playing',
  endless: 'playing',
});

export const DEFAULT_SETTINGS = {
  uiLocale: 'auto',
  importDelayMs: 1000,
  importFormat: 'json',
  /** When false, games already in the user's library stay unchecked by default. */
  importExisting: false,
  debugMode: false,
};
