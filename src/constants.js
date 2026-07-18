import pkg from '../package.json' with { type: 'json' };

export const REPO_URL = 'https://github.com/NemoKing1210/backloggd-data-transfer';
export const SCRIPT_VERSION = pkg.version;
export const SETTINGS_KEY = 'bdt_settings';
export const ROOT_ATTR = 'data-bdt-root';
export const SCAN_DEBOUNCE_MS = 400;
/** Delay between Backloggd autocomplete lookups during Read/match. */
export const MATCH_DELAY_MS = 350;

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
});

export const DEFAULT_SETTINGS = {
  uiLocale: 'auto',
  importDelayMs: 800,
  importFormat: 'json',
  /** When false, games already in the user's library stay unchecked by default. */
  importExisting: false,
  debugMode: false,
};
