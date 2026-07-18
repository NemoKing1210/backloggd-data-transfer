import { LIBRARY_PAGE_DELAY_MS, MATCH_DELAY_MS } from '../../constants.js';
import { sleepJitter } from '../../utils/delay.js';
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
 *   onProgress?: (info: {
 *     phase: 'library' | 'probe',
 *     listIndex?: number,
 *     listTotal?: number,
 *     page?: number,
 *     list?: string,
 *     index?: number,
 *     total?: number,
 *     title?: string,
 *     multiFound?: number,
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

  const library = await loadCurrentUserLibrary({
    onProgress: (info) => {
      options.onProgress?.({
        phase: 'library',
        listIndex: info.listIndex,
        listTotal: info.listTotal,
        page: info.page,
        list: info.list,
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

  for (let index = 0; index < candidates.length; index += 1) {
    if (options.shouldCancel?.()) break;

    const game = candidates[index];
    options.onProgress?.({
      phase: 'probe',
      index,
      total: candidates.length,
      title: game.title || game.slug,
      multiFound: multi.length,
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
    }

    if (index < candidates.length - 1 && !options.shouldCancel?.()) {
      await sleepJitter(Math.max(LIBRARY_PAGE_DELAY_MS, MATCH_DELAY_MS * 0.7), {
        minFactor: 0.75,
        maxFactor: 1.6,
        pauseChance: 0.08,
        pauseMinMs: 180,
        pauseMaxMs: 700,
      });
    }
  }

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
