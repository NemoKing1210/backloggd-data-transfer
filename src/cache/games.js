import { GM_getValue, GM_setValue } from '$';
import {
  CACHE_SOFT_LIMIT_BYTES,
  CSV_VALUE_MAP_KEY,
  GAME_CACHE_HIT_TTL_MS,
  GAME_CACHE_KEY,
  GAME_CACHE_MISS_TTL_MS,
  HISTORY_KEY,
  SETTINGS_KEY,
} from '../constants.js';
import { clearCsvValueMapMemory } from '../format/csv/value-map-memory.js';
import { clearHistory } from '../history/store.js';
import { normalizeTitle } from '../utils/title.js';

/**
 * @typedef {'hit' | 'miss'} GameCacheKind
 *
 * @typedef {{
 *   id: number,
 *   slug: string,
 *   title: string,
 *   year?: string,
 *   score?: number,
 *   url?: string,
 * }} CachedGameMatch
 *
 * @typedef {{
 *   ts: number,
 *   at: number,
 *   kind: GameCacheKind,
 *   query: string,
 *   match: CachedGameMatch | null,
 *   ttlMs?: number,
 * }} GameCacheEntry
 *
 * @typedef {{
 *   key: string,
 *   id: string,
 *   label: string,
 *   bytes: number,
 *   count: number,
 * }} CacheBucket
 */

/** @type {Record<string, GameCacheEntry> | null} */
let gameStore = null;
/** @type {ReturnType<typeof setTimeout> | 0} */
let persistTimer = 0;

/**
 * @returns {Record<string, GameCacheEntry>}
 */
export function readGameCacheStore() {
  if (gameStore) return gameStore;
  try {
    const raw = GM_getValue(GAME_CACHE_KEY, null);
    gameStore = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (_) {
    gameStore = {};
  }
  return gameStore;
}

function persistGameCacheSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = 0;
    try {
      pruneExpiredGameCache();
      evictGameCacheToBudget();
      GM_setValue(GAME_CACHE_KEY, readGameCacheStore());
    } catch (_) {
      /* ignore quota / private mode */
    }
  }, 400);
}

function persistGameCacheNow() {
  clearTimeout(persistTimer);
  persistTimer = 0;
  try {
    GM_setValue(GAME_CACHE_KEY, readGameCacheStore());
  } catch (_) {
    /* ignore */
  }
}

/**
 * @param {string} title
 */
export function gameCacheKey(title) {
  return normalizeTitle(title);
}

/**
 * @param {GameCacheEntry | null | undefined} entry
 */
export function isGameCacheEntryExpired(entry) {
  if (!entry?.ts) return true;
  const ttl =
    Number(entry.ttlMs) > 0
      ? Number(entry.ttlMs)
      : entry.kind === 'miss'
        ? GAME_CACHE_MISS_TTL_MS
        : GAME_CACHE_HIT_TTL_MS;
  if (!ttl) return false;
  return Date.now() - entry.ts > ttl;
}

/**
 * @param {string} title
 * @returns {{ kind: GameCacheKind, match: CachedGameMatch | null, query: string } | null}
 */
export function getCachedGameMatch(title) {
  const key = gameCacheKey(title);
  if (!key) return null;
  const store = readGameCacheStore();
  const entry = store[key];
  if (!entry || isGameCacheEntryExpired(entry)) {
    if (entry) {
      delete store[key];
      persistGameCacheSoon();
    }
    return null;
  }
  entry.at = Date.now();
  return {
    kind: entry.kind === 'miss' ? 'miss' : 'hit',
    match: entry.match ? { ...entry.match } : null,
    query: entry.query || title,
  };
}

/**
 * Store a successful or negative match for a query title.
 * @param {string} title
 * @param {CachedGameMatch | null} match
 */
export function setCachedGameMatch(title, match) {
  const key = gameCacheKey(title);
  if (!key) return;

  const now = Date.now();
  const kind = match && match.id != null ? 'hit' : 'miss';
  /** @type {GameCacheEntry} */
  const entry = {
    ts: now,
    at: now,
    kind,
    query: String(title || '').trim() || key,
    match:
      kind === 'hit'
        ? {
            id: Number(match.id),
            slug: String(match.slug || ''),
            title: String(match.title || title).trim(),
            year: match.year != null ? String(match.year) : '',
            score: Number.isFinite(match.score) ? Number(match.score) : undefined,
            url: match.url ? String(match.url) : '',
          }
        : null,
    ttlMs: kind === 'miss' ? GAME_CACHE_MISS_TTL_MS : GAME_CACHE_HIT_TTL_MS,
  };

  readGameCacheStore()[key] = entry;
  persistGameCacheSoon();
}

export function pruneExpiredGameCache() {
  const store = readGameCacheStore();
  let removed = 0;
  for (const key of Object.keys(store)) {
    if (isGameCacheEntryExpired(store[key])) {
      delete store[key];
      removed += 1;
    }
  }
  return removed;
}

/**
 * Drop least-recently-used game entries until under soft budget.
 * Leaves room for history/settings by budgeting game cache at ~80% of soft limit.
 */
export function evictGameCacheToBudget() {
  const store = readGameCacheStore();
  const budget = Math.floor(CACHE_SOFT_LIMIT_BYTES * 0.8);
  /** @type {{ key: string, bytes: number, at: number }[]} */
  const candidates = [];
  let used = 0;
  for (const key of Object.keys(store)) {
    const entry = store[key];
    const bytes = estimateJsonBytes(key, entry);
    used += bytes;
    candidates.push({ key, bytes, at: Number(entry?.at || entry?.ts) || 0 });
  }
  if (used <= budget) return 0;

  candidates.sort((a, b) => a.at - b.at);
  let removed = 0;
  for (const item of candidates) {
    if (used <= budget) break;
    delete store[item.key];
    used -= item.bytes;
    removed += 1;
  }
  return removed;
}

/**
 * @returns {number} removed entry count
 */
export function clearGameCache() {
  const store = readGameCacheStore();
  const count = Object.keys(store).length;
  gameStore = {};
  clearTimeout(persistTimer);
  persistTimer = 0;
  try {
    GM_setValue(GAME_CACHE_KEY, {});
  } catch (_) {
    /* ignore */
  }
  return count;
}

/**
 * Clear only negative (not found) lookups.
 * @returns {number}
 */
export function clearGameCacheMisses() {
  const store = readGameCacheStore();
  let removed = 0;
  for (const key of Object.keys(store)) {
    if (store[key]?.kind === 'miss') {
      delete store[key];
      removed += 1;
    }
  }
  if (removed) persistGameCacheNow();
  return removed;
}

/**
 * Clear game matches, transfer history, and CSV value maps.
 * Leaves settings intact.
 * @returns {{ games: number, history: number }}
 */
export function clearAllCachedStorage() {
  const games = clearGameCache();
  let history = 0;
  try {
    const raw = GM_getValue(HISTORY_KEY, []);
    history = Array.isArray(raw) ? raw.length : 0;
  } catch (_) {
    history = 0;
  }
  clearHistory();
  clearCsvValueMapMemory();
  return { games, history };
}

/**
 * @param {unknown} key
 * @param {unknown} value
 */
export function estimateJsonBytes(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') {
      const enc = new TextEncoder();
      return enc.encode(String(key ?? '')).length + enc.encode(raw ?? '').length;
    }
    return String(key ?? '').length + String(raw ?? '').length;
  } catch (_) {
    return 0;
  }
}

/**
 * @param {number} n
 */
export function formatCacheBytes(n) {
  const bytes = Math.max(0, Number(n) || 0);
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * @param {number} part
 * @param {number} denom
 */
export function cacheMeterPct(part, denom) {
  if (!denom) return 0;
  return Math.max(0, Math.min(100, (part / denom) * 100));
}

/**
 * Measure a GM blob size without mutating it.
 * @param {string} key
 * @param {unknown} fallback
 */
function measureGmBlob(key, fallback = null) {
  try {
    const raw = GM_getValue(key, fallback);
    if (raw == null) return { bytes: 0, count: 0, raw: null };
    const bytes = estimateJsonBytes(key, raw);
    const count = Array.isArray(raw)
      ? raw.length
      : raw && typeof raw === 'object'
        ? Object.keys(raw).length
        : 1;
    return { bytes, count, raw };
  } catch (_) {
    return { bytes: 0, count: 0, raw: null };
  }
}

/**
 * Full storage breakdown for the Cache tab meter.
 */
export function getCacheUsageStats() {
  pruneExpiredGameCache();
  const store = readGameCacheStore();

  let foundBytes = 0;
  let missBytes = 0;
  let foundCount = 0;
  let missCount = 0;
  let newestAt = 0;

  for (const [key, entry] of Object.entries(store)) {
    const bytes = estimateJsonBytes(key, entry);
    const at = Number(entry?.at || entry?.ts) || 0;
    if (at > newestAt) newestAt = at;
    if (entry?.kind === 'miss') {
      missBytes += bytes;
      missCount += 1;
    } else {
      foundBytes += bytes;
      foundCount += 1;
    }
  }

  const history = measureGmBlob(HISTORY_KEY, []);
  const valueMaps = measureGmBlob(CSV_VALUE_MAP_KEY, {});
  const settings = measureGmBlob(SETTINGS_KEY, {});

  const otherBytes = history.bytes + valueMaps.bytes + settings.bytes;
  const gamesBytes = foundBytes + missBytes;
  const usedBytes = gamesBytes + otherBytes;
  const limitBytes = CACHE_SOFT_LIMIT_BYTES;
  const freeBytes = Math.max(0, limitBytes - usedBytes);

  /** @type {CacheBucket[]} */
  const buckets = [
    {
      key: 'found',
      id: 'found',
      label: 'found',
      bytes: foundBytes,
      count: foundCount,
    },
    {
      key: 'miss',
      id: 'miss',
      label: 'miss',
      bytes: missBytes,
      count: missCount,
    },
    {
      key: 'history',
      id: 'history',
      label: 'history',
      bytes: history.bytes,
      count: history.count,
    },
    {
      key: 'maps',
      id: 'maps',
      label: 'maps',
      bytes: valueMaps.bytes,
      count: valueMaps.count,
    },
    {
      key: 'settings',
      id: 'settings',
      label: 'settings',
      bytes: settings.bytes,
      count: settings.count,
    },
  ];

  return {
    foundBytes,
    missBytes,
    foundCount,
    missCount,
    gamesCount: foundCount + missCount,
    gamesBytes,
    historyBytes: history.bytes,
    historyCount: history.count,
    mapsBytes: valueMaps.bytes,
    settingsBytes: settings.bytes,
    otherBytes,
    usedBytes,
    freeBytes,
    limitBytes,
    newestAt,
    buckets,
  };
}

/**
 * Recent game cache rows for the detail list.
 * @param {number} [limit]
 */
export function listGameCacheEntries(limit = 80) {
  pruneExpiredGameCache();
  const store = readGameCacheStore();
  return Object.entries(store)
    .map(([key, entry]) => ({
      key,
      kind: entry?.kind === 'miss' ? 'miss' : 'hit',
      query: entry?.query || key,
      match: entry?.match || null,
      ts: Number(entry?.ts) || 0,
      at: Number(entry?.at || entry?.ts) || 0,
      bytes: estimateJsonBytes(key, entry),
    }))
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(1, limit));
}

/**
 * Run prune + eviction once at startup.
 */
export function initGameCache() {
  const pruned = pruneExpiredGameCache();
  const evicted = evictGameCacheToBudget();
  if (pruned > 0 || evicted > 0) persistGameCacheNow();
}
