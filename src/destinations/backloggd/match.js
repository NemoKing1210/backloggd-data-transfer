import { MATCH_CONCURRENCY, MATCH_DELAY_MS } from '../../constants.js';
import {
  getCachedGameMatch,
  setCachedGameMatch,
} from '../../cache/games.js';
import { entryDisplayTitle } from '../../format/schema.js';
import { sleepJitter } from '../../utils/delay.js';
import { mapPool } from '../../utils/pool.js';
import { libraryHasGame, probeUserHasLog } from './library.js';
import { searchBackloggdGame } from './search.js';
import { backloggdUrl } from './site.js';
import { getCurrentUsername } from './user.js';

/**
 * @typedef {'found' | 'not_found' | 'preset' | 'error'} MatchStatus
 */

/**
 * @typedef {object} EntryMatchResult
 * @property {number} index
 * @property {import('../../format/schema.js').TransferEntry} entry
 * @property {MatchStatus} status
 * @property {import('./search.js').BackloggdGameMatch | null} match
 * @property {boolean} existingLog
 * @property {boolean} [fromCache]
 * @property {string} [error]
 */

/**
 * @typedef {object} MatchProgressInfo
 * @property {number} index
 * @property {number} total
 * @property {number} done
 * @property {import('../../format/schema.js').TransferEntry} entry
 * @property {EntryMatchResult} [result]
 * @property {string[]} activeTitles
 * @property {number} concurrency
 */

/**
 * Match each transfer entry against Backloggd autocomplete.
 * Uses the game cache when possible; mutates `entry.game_id` / `entry.slug` on hit.
 * Runs several lookups in parallel (see `MATCH_CONCURRENCY`).
 *
 * @param {import('../../format/schema.js').TransferDocument} doc
 * @param {{
 *   delayMs?: number,
 *   concurrency?: number,
 *   library?: import('./library.js').UserLibraryIndex | null,
 *   onProgress?: (info: MatchProgressInfo) => void,
 *   shouldCancel?: () => boolean,
 * }} [options]
 * @returns {Promise<{ results: EntryMatchResult[], foundCount: number, notFoundCount: number, presetCount: number, errorCount: number, existingCount: number, cacheHitCount: number }>}
 */
export async function matchTransferEntries(doc, options = {}) {
  const entries = doc?.entries || [];
  const total = entries.length;
  const delayMs = Number.isFinite(options.delayMs)
    ? Math.max(0, options.delayMs)
    : MATCH_DELAY_MS;
  const concurrency = Math.max(
    1,
    Math.floor(
      Number.isFinite(options.concurrency)
        ? Number(options.concurrency)
        : MATCH_CONCURRENCY,
    ),
  );
  const library = options.library || null;
  const username = getCurrentUsername();
  let cacheHitCount = 0;
  let done = 0;
  /** @type {Map<number, string>} */
  const activeByIndex = new Map();

  const settled = await mapPool(
    total,
    concurrency,
    async (index) => {
      const entry = entries[index];
      const title = entryDisplayTitle(entry);
      activeByIndex.set(index, title || `#${index + 1}`);
      options.onProgress?.({
        index,
        total,
        done,
        entry,
        activeTitles: [...activeByIndex.values()],
        concurrency,
      });

      /** @type {EntryMatchResult} */
      let result;
      let usedNetwork = false;

      try {
        if (entry.game_id != null) {
          result = buildPresetResult(index, entry, title);
          if (title) {
            setCachedGameMatch(title, {
              id: entry.game_id,
              slug: entry.slug || '',
              title,
              year: '',
              score: 100,
              url: result.match?.url || '',
            });
          }
        } else {
          const cached = getCachedGameMatch(title);
          if (cached) {
            cacheHitCount += 1;
            result = buildCachedResult(index, entry, title, cached);
          } else {
            usedNetwork = true;
            result = await lookupNetwork(index, entry, title);
          }
        }

        if (
          (result.status === 'found' || result.status === 'preset') &&
          (result.match?.id != null || entry.game_id != null)
        ) {
          const gameId = result.match?.id ?? entry.game_id;
          const slug = result.match?.slug || entry.slug || '';
          const existing = await resolveExistingLog({
            gameId,
            slug,
            library,
            username,
          });
          result.existingLog = existing;
          if (existing && library) {
            if (gameId != null) library.gameIds.add(Number(gameId));
            if (slug) library.slugs.add(String(slug).toLowerCase());
          }
        }
      } finally {
        activeByIndex.delete(index);
      }

      done += 1;
      options.onProgress?.({
        index,
        total,
        done,
        entry,
        result,
        activeTitles: [...activeByIndex.values()],
        concurrency,
      });

      // Throttle per worker after real network lookups (cache/preset skip delay).
      if (delayMs && usedNetwork && !options.shouldCancel?.()) {
        await sleepJitter(delayMs);
      }

      return result;
    },
    { shouldCancel: options.shouldCancel },
  );

  /** @type {EntryMatchResult[]} */
  const results = settled
    .filter((r) => r != null)
    .sort((a, b) => a.index - b.index);

  return {
    results,
    foundCount: results.filter((r) => r.status === 'found' || r.status === 'preset')
      .length,
    notFoundCount: results.filter((r) => r.status === 'not_found').length,
    presetCount: results.filter((r) => r.status === 'preset').length,
    errorCount: results.filter((r) => r.status === 'error').length,
    existingCount: results.filter((r) => r.existingLog).length,
    cacheHitCount,
  };
}

/**
 * @param {number} index
 * @param {import('../../format/schema.js').TransferEntry} entry
 * @param {string} title
 * @returns {EntryMatchResult}
 */
function buildPresetResult(index, entry, title) {
  return {
    index,
    entry,
    status: 'preset',
    match: {
      id: entry.game_id,
      slug: entry.slug || '',
      title: title || entryDisplayTitle(entry),
      year: '',
      score: 100,
      url: entry.slug
        ? backloggdUrl(`/games/${encodeURIComponent(entry.slug)}/`)
        : '',
    },
    existingLog: false,
    fromCache: false,
  };
}

/**
 * @param {number} index
 * @param {import('../../format/schema.js').TransferEntry} entry
 * @param {string} title
 * @param {import('../../cache/games.js').GameCacheEntry} cached
 * @returns {EntryMatchResult}
 */
function buildCachedResult(index, entry, title, cached) {
  if (cached.kind === 'hit' && cached.match?.id != null) {
    entry.game_id = cached.match.id;
    if (cached.match.slug) entry.slug = cached.match.slug;
    return {
      index,
      entry,
      status: 'found',
      match: {
        id: cached.match.id,
        slug: cached.match.slug || '',
        title: cached.match.title || title,
        year: cached.match.year || '',
        score: cached.match.score ?? 100,
        url:
          cached.match.url ||
          (cached.match.slug
            ? backloggdUrl(`/games/${encodeURIComponent(cached.match.slug)}/`)
            : ''),
      },
      existingLog: false,
      fromCache: true,
    };
  }
  return {
    index,
    entry,
    status: 'not_found',
    match: null,
    existingLog: false,
    fromCache: true,
  };
}

/**
 * @param {number} index
 * @param {import('../../format/schema.js').TransferEntry} entry
 * @param {string} title
 * @returns {Promise<EntryMatchResult>}
 */
async function lookupNetwork(index, entry, title) {
  try {
    const match = await searchBackloggdGame(title);
    setCachedGameMatch(title, match);
    if (match) {
      entry.game_id = match.id;
      if (match.slug) entry.slug = match.slug;
      return {
        index,
        entry,
        status: 'found',
        match,
        existingLog: false,
        fromCache: false,
      };
    }
    return {
      index,
      entry,
      status: 'not_found',
      match: null,
      existingLog: false,
      fromCache: false,
    };
  } catch (err) {
    return {
      index,
      entry,
      status: 'error',
      match: null,
      existingLog: false,
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {{
 *   gameId: number | null | undefined,
 *   slug?: string,
 *   library?: import('./library.js').UserLibraryIndex | null,
 *   username?: string,
 * }} input
 */
async function resolveExistingLog(input) {
  if (libraryHasGame(input.gameId, input.slug, input.library)) return true;
  if (input.gameId == null) return false;
  try {
    const probe = await probeUserHasLog({
      gameId: Number(input.gameId),
      slug: input.slug,
      username: input.username,
    });
    // Light throttle — probe hits /logs/{slug}/ per miss.
    await sleepJitter(140, {
      minFactor: 0.7,
      maxFactor: 1.5,
      pauseChance: 0.05,
      pauseMinMs: 80,
      pauseMaxMs: 320,
    });
    return probe.exists;
  } catch (_) {
    return false;
  }
}
