import { MATCH_CONCURRENCY, MATCH_CONCURRENCY_MAX } from '../../constants.js';
import { entryDisplayTitle } from '../../format/schema.js';
import { sleepJitter } from '../../utils/delay.js';
import { mapPool } from '../../utils/pool.js';
import { getCsrfToken, resolveBackloggdUserId } from './auth.js';
import { createBackloggdLog } from './create-log.js';
import {
  libraryHasGame,
  probeUserHasLog,
  rememberLibraryGame,
} from './library.js';
import { getCurrentUsername } from './user.js';

/**
 * Import a transfer document into Backloggd (parallel, rate-limited per worker).
 *
 * @param {import('../../format/schema.js').TransferDocument} doc
 * @param {{
 *   dryRun?: boolean,
 *   delayMs?: number,
 *   concurrency?: number,
 *   importExisting?: boolean,
 *   library?: import('./library.js').UserLibraryIndex | null,
 *   onProgress?: (info: {
 *     index: number,
 *     total: number,
 *     done: number,
 *     entry: import('../../format/schema.js').TransferEntry,
 *     result: object,
 *     activeTitles: string[],
 *     concurrency: number,
 *   }) => void,
 *   onItemStart?: (info: {
 *     index: number,
 *     total: number,
 *     done: number,
 *     entry: import('../../format/schema.js').TransferEntry,
 *     activeTitles: string[],
 *     concurrency: number,
 *   }) => void,
 *   shouldCancel?: () => boolean,
 * }} [options]
 */
export async function importTransferToBackloggd(doc, options = {}) {
  const entries = doc?.entries || [];
  const total = entries.length;
  const dryRun = options.dryRun === true;
  const importExisting = options.importExisting === true;
  const library = options.library || null;
  const delayMs = Number.isFinite(options.delayMs)
    ? Math.max(0, options.delayMs)
    : 800;
  const concurrency = Math.max(
    1,
    Math.min(
      MATCH_CONCURRENCY_MAX,
      Math.floor(
        Number.isFinite(options.concurrency)
          ? Number(options.concurrency)
          : MATCH_CONCURRENCY,
      ),
    ),
  );

  /** @type {(object | undefined)[]} */
  const results = new Array(total);
  let done = 0;
  /** @type {Map<number, string>} */
  const activeByIndex = new Map();

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

  await mapPool(
    total,
    concurrency,
    async (index) => {
      if (options.shouldCancel?.()) return;

      const entry = entries[index];
      const title = entryDisplayTitle(entry) || `#${index + 1}`;
      activeByIndex.set(index, title);
      options.onItemStart?.({
        index,
        total,
        done,
        entry,
        activeTitles: [...activeByIndex.values()],
        concurrency,
      });

      /** @type {object} */
      let result;

      try {
        result = await importOneEntry(entry, {
          dryRun,
          importExisting,
          library,
          userId,
          csrfToken,
          delayMs,
        });
        if (result.ok) {
          rememberLibraryGame(library, {
            gameId: entry.game_id,
            slug: entry.slug,
          });
        }
      } catch (err) {
        result = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      } finally {
        activeByIndex.delete(index);
      }

      results[index] = result;
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

      if (delayMs && !options.shouldCancel?.()) {
        await sleepJitter(delayMs, {
          minFactor: 0.75,
          maxFactor: 1.5,
          pauseChance: 0.08,
          pauseMinMs: Math.min(200, delayMs),
          pauseMaxMs: Math.max(delayMs, 400),
        });
      }
    },
    { shouldCancel: options.shouldCancel },
  );

  const settled = results.filter((r) => r != null);
  const okCount = settled.filter((r) => r.ok).length;
  const skipCount = settled.filter((r) => !r.ok && r.skipped).length;
  const failCount = settled.filter((r) => !r.ok && !r.skipped).length;
  return {
    // Keep index alignment with `doc.entries` (cancelled slots → skipped).
    results: results.map(
      (r) => r ?? { ok: false, skipped: true, error: 'cancelled' },
    ),
    okCount,
    failCount,
    skipCount:
      skipCount + Math.max(0, total - settled.length),
    total,
    dryRun,
  };
}

/**
 * @param {import('../../format/schema.js').TransferEntry} entry
 * @param {{
 *   dryRun: boolean,
 *   importExisting: boolean,
 *   library: import('./library.js').UserLibraryIndex | null,
 *   userId?: number,
 *   csrfToken?: string,
 *   delayMs?: number,
 * }} ctx
 */
async function importOneEntry(entry, ctx) {
  if (entry.game_id == null) {
    return {
      ok: false,
      skipped: true,
      error: 'no match from read step',
    };
  }

  // Safety: skip games already in library when import-existing is off.
  if (!ctx.importExisting && !ctx.dryRun) {
    let already = libraryHasGame(entry.game_id, entry.slug, ctx.library);
    if (!already) {
      try {
        const probe = await probeUserHasLog({
          gameId: entry.game_id,
          slug: entry.slug,
          username: getCurrentUsername(),
        });
        already = probe.exists;
        if (already) {
          rememberLibraryGame(ctx.library, {
            gameId: entry.game_id,
            slug: entry.slug,
          });
        }
      } catch (_) {
        /* if probe fails, continue to create — better than hard-stop */
      }
    }
    if (already) {
      return {
        ok: false,
        skipped: true,
        error: 'already in library',
      };
    }
  }

  const resolved = {
    slug: entry.slug || '',
    title: entryDisplayTitle(entry),
    url: '',
    game_id: entry.game_id,
  };

  let result = await createBackloggdLog(entry, {
    dryRun: ctx.dryRun,
    resolved,
    userId: ctx.userId,
    csrfToken: ctx.csrfToken,
  });

  // Brief pause + one retry on rate limit.
  if (!result.ok && result.status === 429) {
    const delayMs = Number(ctx.delayMs) || 800;
    await sleepJitter(Math.max(delayMs * 3, 3500), {
      minFactor: 0.9,
      maxFactor: 1.4,
      pauseChance: 0.25,
      pauseMinMs: 800,
      pauseMaxMs: 2500,
    });
    result = await createBackloggdLog(entry, {
      dryRun: ctx.dryRun,
      resolved,
      userId: ctx.userId,
      csrfToken: getCsrfToken() || ctx.csrfToken,
    });
  }

  return result;
}
