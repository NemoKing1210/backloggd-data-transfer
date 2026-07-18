import { entryDisplayTitle } from '../../format/schema.js';
import { sleepJitter } from '../../utils/delay.js';
import { getCsrfToken, resolveBackloggdUserId } from './auth.js';
import { createBackloggdLog } from './create-log.js';

/**
 * Import a transfer document into Backloggd (sequential, rate-limited).
 *
 * @param {import('../../format/schema.js').TransferDocument} doc
 * @param {{
 *   dryRun?: boolean,
 *   delayMs?: number,
 *   onProgress?: (info: { index: number, total: number, entry: import('../../format/schema.js').TransferEntry, result: object }) => void,
 *   onItemStart?: (info: { index: number, total: number, entry: import('../../format/schema.js').TransferEntry }) => void,
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
          skipCount: 0,
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
        skipCount: 0,
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
    options.onItemStart?.({ index, total, entry });

    if (entry.game_id == null) {
      const result = {
        ok: false,
        skipped: true,
        error: 'no match from read step',
      };
      results.push(result);
      options.onProgress?.({ index, total, entry, result });
      if (delayMs) await sleepJitter(delayMs);
      continue;
    }

    const resolved = {
      slug: entry.slug || '',
      title: entryDisplayTitle(entry),
      url: '',
      game_id: entry.game_id,
    };

    let result = await createBackloggdLog(entry, {
      dryRun,
      resolved,
      userId,
      csrfToken,
    });

    // Brief pause + one retry on rate limit.
    if (!result.ok && result.status === 429) {
      await sleepJitter(Math.max(delayMs * 3, 3500), {
        minFactor: 0.9,
        maxFactor: 1.4,
        pauseChance: 0.25,
        pauseMinMs: 800,
        pauseMaxMs: 2500,
      });
      result = await createBackloggdLog(entry, {
        dryRun,
        resolved,
        userId,
        csrfToken: getCsrfToken() || csrfToken,
      });
    }

    results.push(result);
    options.onProgress?.({ index, total, entry, result });
    if (delayMs && index < total - 1) await sleepJitter(delayMs);
  }

  const okCount = results.filter((r) => r.ok).length;
  const skipCount = results.filter((r) => !r.ok && r.skipped).length;
  const failCount = results.filter((r) => !r.ok && !r.skipped).length;
  return { results, okCount, failCount, skipCount, total, dryRun };
}
