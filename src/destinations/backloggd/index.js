import { entryDisplayTitle } from '../../format/schema.js';
import { sleep } from '../../utils/download.js';
import { getCsrfToken, resolveBackloggdUserId } from './auth.js';
import { createBackloggdLog } from './create-log.js';
import { searchBackloggdGame } from './search.js';

/**
 * Import a transfer document into Backloggd (sequential, rate-limited).
 *
 * @param {import('../../format/schema.js').TransferDocument} doc
 * @param {{
 *   dryRun?: boolean,
 *   delayMs?: number,
 *   onProgress?: (info: { index: number, total: number, entry: import('../../format/schema.js').TransferEntry, result: object }) => void,
 *   shouldCancel?: () => boolean,
 * }} [options]
 */
export async function importTransferToBackloggd(doc, options = {}) {
  const entries = doc?.entries || [];
  const total = entries.length;
  const dryRun = options.dryRun === true;
  const delayMs = Number.isFinite(options.delayMs)
    ? Math.max(0, options.delayMs)
    : 800;
  const results = [];

  /** @type {number | undefined} */
  let userId;
  /** @type {string | undefined} */
  let csrfToken;

  if (!dryRun && total > 0) {
    try {
      userId = await resolveBackloggdUserId();
      csrfToken = getCsrfToken();
      if (!csrfToken) {
        return {
          results: [
            {
              ok: false,
              error: 'CSRF token not found on page — refresh and try again',
            },
          ],
          okCount: 0,
          failCount: 1,
          total,
          dryRun,
        };
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return {
        results: [{ ok: false, error }],
        okCount: 0,
        failCount: 1,
        total,
        dryRun,
      };
    }
  }

  for (let index = 0; index < total; index += 1) {
    if (options.shouldCancel?.()) {
      break;
    }
    const entry = entries[index];
    let resolved = null;
    try {
      if (entry.game_id != null) {
        resolved = {
          slug: entry.slug || '',
          title: entryDisplayTitle(entry),
          url: '',
          game_id: entry.game_id,
        };
      } else {
        resolved = await searchBackloggdGame(entryDisplayTitle(entry));
        if (resolved?.id != null) {
          entry.game_id = resolved.id;
          if (resolved.slug) entry.slug = resolved.slug;
          resolved = { ...resolved, game_id: resolved.id };
        }
      }
    } catch (err) {
      const result = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
      results.push(result);
      options.onProgress?.({ index, total, entry, result });
      if (delayMs) await sleep(delayMs);
      continue;
    }

    if (!resolved?.game_id && entry.game_id == null) {
      const result = {
        ok: false,
        error: 'game_id not resolved',
        skipped: true,
      };
      results.push(result);
      options.onProgress?.({ index, total, entry, result });
      if (delayMs) await sleep(delayMs);
      continue;
    }

    let result = await createBackloggdLog(entry, {
      dryRun,
      resolved,
      userId,
      csrfToken,
    });

    // Brief pause + one retry on rate limit.
    if (!result.ok && result.status === 429) {
      await sleep(Math.max(delayMs, 3000));
      result = await createBackloggdLog(entry, {
        dryRun,
        resolved,
        userId,
        csrfToken: getCsrfToken() || csrfToken,
      });
    }

    results.push(result);
    options.onProgress?.({ index, total, entry, result });
    if (delayMs && index < total - 1) await sleep(delayMs);
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  return { results, okCount, failCount, total, dryRun };
}
