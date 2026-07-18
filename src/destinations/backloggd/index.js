import { entryDisplayTitle } from '../../format/schema.js';
import { sleep } from '../../utils/download.js';
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
  const delayMs = Number.isFinite(options.delayMs) ? Math.max(0, options.delayMs) : 800;
  const results = [];

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

    const result = await createBackloggdLog(entry, { dryRun, resolved });
    results.push(result);
    options.onProgress?.({ index, total, entry, result });
    if (delayMs && index < total - 1) await sleep(delayMs);
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  return { results, okCount, failCount, total, dryRun };
}
