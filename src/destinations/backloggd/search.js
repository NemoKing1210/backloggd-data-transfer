/**
 * Backloggd game search / resolve.
 * Implementation TBD: scrape search HTML or call site endpoints while logged in.
 *
 * @param {string} title
 * @returns {Promise<{ slug: string, title: string, url: string } | null>}
 */
export async function searchBackloggdGame(title) {
  const q = String(title || '').trim();
  if (!q) return null;
  // Stub: real search will use GM_xmlhttpRequest against backloggd.com/search/...
  console.warn('[bdt] searchBackloggdGame is not implemented yet:', q);
  return null;
}
