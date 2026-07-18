/**
 * Create / update a game log on Backloggd for one transfer entry.
 * Implementation TBD: drive the same form/XHR flows the site uses when logging a game.
 *
 * @param {import('../../format/schema.js').TransferEntry} entry
 * @param {{ dryRun?: boolean, resolved?: { slug: string, title: string, url: string } | null }} [options]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string, dryRun?: boolean }>}
 */
export async function createBackloggdLog(entry, options = {}) {
  const dryRun = options.dryRun === true;
  const title = String(entry?.title || '').trim();
  if (!title) {
    return { ok: false, error: 'Missing title' };
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      skipped: !options.resolved,
    };
  }

  // Stub: real import will POST log fields (status, rating, dates, platform, review, …).
  console.warn('[bdt] createBackloggdLog is not implemented yet:', title);
  return { ok: false, error: 'Backloggd write API not implemented yet' };
}
