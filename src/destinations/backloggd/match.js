import { MATCH_DELAY_MS } from '../../constants.js';
import { entryDisplayTitle } from '../../format/schema.js';
import { sleep } from '../../utils/download.js';
import { libraryHasGame } from './library.js';
import { searchBackloggdGame } from './search.js';

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
 * @property {string} [error]
 */

/**
 * Match each transfer entry against Backloggd autocomplete.
 * Mutates `entry.game_id` / `entry.slug` when a match is found.
 *
 * @param {import('../../format/schema.js').TransferDocument} doc
 * @param {{
 *   delayMs?: number,
 *   library?: import('./library.js').UserLibraryIndex | null,
 *   onProgress?: (info: { index: number, total: number, entry: import('../../format/schema.js').TransferEntry, result: EntryMatchResult }) => void,
 *   shouldCancel?: () => boolean,
 * }} [options]
 * @returns {Promise<{ results: EntryMatchResult[], foundCount: number, notFoundCount: number, presetCount: number, errorCount: number, existingCount: number }>}
 */
export async function matchTransferEntries(doc, options = {}) {
  const entries = doc?.entries || [];
  const total = entries.length;
  const delayMs = Number.isFinite(options.delayMs)
    ? Math.max(0, options.delayMs)
    : MATCH_DELAY_MS;
  const library = options.library || null;
  /** @type {EntryMatchResult[]} */
  const results = [];

  for (let index = 0; index < total; index += 1) {
    if (options.shouldCancel?.()) break;

    const entry = entries[index];
    /** @type {EntryMatchResult} */
    let result;

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
            ? `https://www.backloggd.com/games/${encodeURIComponent(entry.slug)}/`
            : '',
        },
        existingLog: libraryHasGame(entry.game_id, entry.slug, library),
      };
    } else {
      try {
        const match = await searchBackloggdGame(entryDisplayTitle(entry));
        if (match) {
          entry.game_id = match.id;
          if (match.slug) entry.slug = match.slug;
          result = {
            index,
            entry,
            status: 'found',
            match,
            existingLog: libraryHasGame(match.id, match.slug, library),
          };
        } else {
          result = {
            index,
            entry,
            status: 'not_found',
            match: null,
            existingLog: false,
          };
        }
      } catch (err) {
        result = {
          index,
          entry,
          status: 'error',
          match: null,
          existingLog: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    results.push(result);
    options.onProgress?.({ index, total, entry, result });

    if (delayMs && index < total - 1 && result.status !== 'preset') {
      await sleep(delayMs);
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
  };
}
