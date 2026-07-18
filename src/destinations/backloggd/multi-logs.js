import {
  LIBRARY_CONCURRENCY,
  MATCH_CONCURRENCY,
  MATCH_CONCURRENCY_MAX,
  MATCH_DELAY_MS,
} from '../../constants.js';
import { sleepJitter } from '../../utils/delay.js';
import { mapPool } from '../../utils/pool.js';
import { loadCurrentUserLibrary, probeUserLogDetails } from './library.js';
import { getCurrentUsername } from './user.js';

/**
 * @typedef {object} MultiLogEntry
 * @property {number | null} id
 * @property {string} title
 * @property {number | null} rating
 * @property {string | null} platform
 * @property {string[]} badges
 * @property {string | null} startDate
 * @property {string | null} finishDate
 * @property {string | null} datesLabel
 * @property {number | null} gameId
 */

/**
 * @typedef {object} MultiLogGame
 * @property {number | null} gameId
 * @property {string} slug
 * @property {string} title
 * @property {string | null} coverUrl
 * @property {number} logCount
 * @property {string | null} gameStatus
 * @property {MultiLogEntry[]} logs
 * @property {string | null} logUrl
 */

/**
 * Scan the current user's library for games with more than one log.
 *
 * @param {{
 *   concurrency?: number,
 *   onProgress?: (info: {
 *     phase: 'library' | 'probe',
 *     listIndex?: number,
 *     listTotal?: number,
 *     page?: number,
 *     list?: string,
 *     pagesDone?: number,
 *     index?: number,
 *     total?: number,
 *     done?: number,
 *     title?: string,
 *     multiFound?: number,
 *     concurrency?: number,
 *     activeTitles?: string[],
 *     activeLists?: string[],
 *   }) => void,
 *   shouldCancel?: () => boolean,
 *   minLogs?: number,
 * }} [options]
 * @returns {Promise<{
 *   username: string,
 *   scanned: number,
 *   skippedNoSlug: number,
 *   errors: number,
 *   games: MultiLogGame[],
 * }>}
 */
export async function scanMultiLogGames(options = {}) {
  const username = getCurrentUsername();
  if (!username) {
    throw new Error('Not logged in — cannot scan multi-log games');
  }

  const minLogs = Math.max(2, Number(options.minLogs) || 2);
  const concurrency = Math.max(
    1,
    Math.min(
      MATCH_CONCURRENCY_MAX,
      Math.floor(
        Number.isFinite(options.concurrency)
          ? Number(options.concurrency)
          : MATCH_CONCURRENCY || LIBRARY_CONCURRENCY,
      ),
    ),
  );

  const library = await loadCurrentUserLibrary({
    concurrency,
    onProgress: (info) => {
      options.onProgress?.({
        phase: 'library',
        listIndex: info.listIndex,
        listTotal: info.listTotal,
        page: info.page,
        list: info.list,
        pagesDone: info.pagesDone,
        concurrency: info.concurrency ?? concurrency,
        activeLists: info.activeLists,
        multiFound: 0,
      });
    },
    shouldCancel: options.shouldCancel,
  });

  if (options.shouldCancel?.()) {
    return {
      username,
      scanned: 0,
      skippedNoSlug: 0,
      errors: 0,
      games: [],
    };
  }

  const candidates = (library.games || []).filter((game) => game.slug);
  const skippedNoSlug = Math.max(
    0,
    (library.games || []).length - candidates.length,
  );

  /** @type {MultiLogGame[]} */
  const multi = [];
  let errors = 0;
  let done = 0;
  /** @type {Map<number, string>} */
  const activeByIndex = new Map();

  await mapPool(
    candidates.length,
    concurrency,
    async (index) => {
      if (options.shouldCancel?.()) return;

      const game = candidates[index];
      const title = game.title || game.slug;
      activeByIndex.set(index, title || `#${index + 1}`);
      options.onProgress?.({
        phase: 'probe',
        index,
        total: candidates.length,
        done,
        title,
        multiFound: multi.length,
        concurrency,
        activeTitles: [...activeByIndex.values()],
      });

      try {
        const detail = await probeUserLogDetails({
          gameId: game.gameId,
          slug: game.slug,
          username,
        });

        if (detail.exists && detail.logCount >= minLogs) {
          multi.push({
            gameId: game.gameId,
            slug: game.slug,
            title: game.title || game.slug,
            coverUrl: game.coverUrl,
            logCount: detail.logCount,
            gameStatus: detail.gameStatus || null,
            logs: detail.logs,
            logUrl: detail.logUrl,
          });
        }
      } catch (_) {
        errors += 1;
      } finally {
        activeByIndex.delete(index);
      }

      done += 1;
      options.onProgress?.({
        phase: 'probe',
        index,
        total: candidates.length,
        done,
        title,
        multiFound: multi.length,
        concurrency,
        activeTitles: [...activeByIndex.values()],
      });

      if (!options.shouldCancel?.()) {
        await sleepJitter(MATCH_DELAY_MS * 0.7, {
          minFactor: 0.75,
          maxFactor: 1.5,
          pauseChance: 0.06,
          pauseMinMs: 120,
          pauseMaxMs: 450,
        });
      }
    },
    { shouldCancel: options.shouldCancel },
  );

  multi.sort((a, b) => {
    if (b.logCount !== a.logCount) return b.logCount - a.logCount;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
  });

  return {
    username,
    scanned: candidates.length,
    skippedNoSlug,
    errors,
    games: multi,
  };
}
