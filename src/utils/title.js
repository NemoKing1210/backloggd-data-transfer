/**
 * Normalize a game title for fuzzy comparison.
 * @param {string} raw
 */
export function normalizeTitle(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Score how well `candidate` matches `query` (0–100).
 * @param {string} query
 * @param {string} candidate
 */
export function scoreTitleMatch(query, candidate) {
  const q = normalizeTitle(query);
  const c = normalizeTitle(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;
  if (c.startsWith(q) || q.startsWith(c)) return 88;
  if (c.includes(q) || q.includes(c)) return 72;

  const qTokens = q.split(' ');
  const cTokens = new Set(c.split(' '));
  let hit = 0;
  for (const tok of qTokens) {
    if (cTokens.has(tok)) hit += 1;
  }
  if (!qTokens.length) return 0;
  const overlap = hit / qTokens.length;
  if (overlap >= 0.8) return 65;
  if (overlap >= 0.5) return 40;
  return 0;
}
