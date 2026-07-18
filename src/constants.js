import pkg from '../package.json' with { type: 'json' };

export const REPO_URL = 'https://github.com/NemoKing1210/backloggd-data-transfer';
export const SCRIPT_VERSION = pkg.version;
export const SETTINGS_KEY = 'bdt_settings';
export const ROOT_ATTR = 'data-bdt-root';
export const SCAN_DEBOUNCE_MS = 400;

/** Canonical transfer file identity. */
export const TRANSFER_FORMAT_ID = 'backloggd-transfer';
export const TRANSFER_FORMAT_VERSION = 1;

/** Filename prefix for downloaded transfer JSON. */
export const TRANSFER_FILENAME_PREFIX = 'backloggd-transfer';

/**
 * Canonical play statuses (Backloggd keys).
 * Sources map their labels into these; the Backloggd importer maps them to site UI/API.
 */
export const STATUS_KEYS = Object.freeze([
  'wishlist',
  'backlog',
  'playing',
  'played',
  'shelved',
  'abandoned',
  'retired',
]);

export const STATUS_LABELS = Object.freeze({
  wishlist: 'Wishlist',
  backlog: 'Backlog',
  playing: 'Playing',
  played: 'Played',
  shelved: 'Shelved',
  abandoned: 'Abandoned',
  retired: 'Retired',
});

/**
 * Common alternate status labels (e.g. Notion DB options) → canonical.
 * Aligns with Backloggd Plus export mapping (STATUS_TO_NOTION, reversed).
 */
export const ALT_STATUS_TO_CANONICAL = Object.freeze({
  'not started': null,
  planned: 'wishlist',
  deferred: 'shelved',
  'in progress': 'playing',
  dropped: 'abandoned',
  tried: 'retired',
  done: 'played',
});

export const DEFAULT_SETTINGS = {
  uiLocale: 'auto',
  importDelayMs: 800,
  importFormat: 'json',
  debugMode: false,
};
