import { MATCH_DELAY_MS } from '../../constants.js';
import {
  getCachedGameMatch,
  setCachedGameMatch,
} from '../../cache/games.js';
import { entryDisplayTitle } from '../../format/schema.js';
import { sleepJitter } from '../../utils/delay.js';
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
 * Match each transfer entry against Backloggd autocomplete.
 * Uses the game cache when possible; mutates `entry.game_id` / `entry.slug` on hit.
 *
 * @param {import('../../format/schema.js').TransferDocument} doc
 * @param {{
 *   delayMs?: number,
 *   library?: import('./library.js').UserLibraryIndex | null,
 *   onProgress?: (info: { index: number, total: number, entry: import('../../format/schema.js').TransferEntry, result: EntryMatchResult }) => void,
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
  const library = options.library || null;
  const username = getCurrentUsername();
  /** @type {EntryMatchResult[]} */
  const results = [];
  let cacheHitCount = 0;

  for (let index = 0; index < total; index += 1) {
    if (options.shouldCancel?.()) break;

    const entry = entries[index];
    /** @type {EntryMatchResult} */
    let result;
    let usedNetwork = false;

    if (entry.game_id != null) {
      result = {
        index,
        entry,
        status: 'preset',
        match: {
          id: entry.game_id,
          slug: entry.slug || '',
          title: entryDisplayTitle(entry),
          year: '',
          score: 100,
          url: entry.slug
            ? backloggdUrl(`/games/${encodeURIComponent(entry.slug)}/`)
            : '',
        },
        existingLog: false,
        fromCache: false,
      };
      // Keep cache warm for title lookups too.
      const title = entryDisplayTitle(entry);
      if (title) {
        setCachedGameMatch(title, {
          id: entry.game_id,
          slug: entry.slug || '',
          title,
          year: '',
          score: 100,
          url: result.match.url || '',
        });
      }
    } else {
      const title = entryDisplayTitle(entry);
      const cached = getCachedGameMatch(title);

      if (cached) {
        cacheHitCount += 1;
        if (cached.kind === 'hit' && cached.match?.id != null) {
          entry.game_id = cached.match.id;
          if (cached.match.slug) entry.slug = cached.match.slug;
          result = {
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
        } else {
          result = {
            index,
            entry,
            status: 'not_found',
            match: null,
            existingLog: false,
            fromCache: true,
          };
        }
      } else {
        usedNetwork = true;
        try {
          const match = await searchBackloggdGame(title);
          setCachedGameMatch(title, match);
          if (match) {
            entry.game_id = match.id;
            if (match.slug) entry.slug = match.slug;
            result = {
              index,
              entry,
              status: 'found',
              match,
              existingLog: false,
              fromCache: false,
            };
          } else {
            result = {
              index,
              entry,
              status: 'not_found',
              match: null,
              existingLog: false,
              fromCache: false,
            };
          }
        } catch (err) {
          result = {
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

    results.push(result);
    options.onProgress?.({ index, total, entry, result });

    // Skip delay for cache/preset hits — only throttle real network lookups.
    if (delayMs && index < total - 1 && usedNetwork) {
      await sleepJitter(delayMs);
    }
  }

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
