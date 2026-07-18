import { GM_getValue, GM_setValue } from '$';
import { HISTORY_KEY, HISTORY_MAX_ENTRIES } from '../constants.js';
import { entryDisplayTitle } from '../format/schema.js';
import { getCurrentUsername } from '../destinations/backloggd/user.js';

/**
 * @typedef {'import' | 'export'} HistoryKind
 * @typedef {'success' | 'partial' | 'failed'} HistoryStatus
 *
 * @typedef {{
 *   title: string,
 *   game_id?: number | null,
 *   slug?: string,
 *   ok: boolean,
 *   error?: string,
 * }} HistoryGame
 *
 * @typedef {{
 *   id: string,
 *   kind: HistoryKind,
 *   at: string,
 *   filename: string,
 *   source: string,
 *   formatVersion: number | null,
 *   okCount: number,
 *   failCount: number,
 *   total: number,
 *   status: HistoryStatus,
 *   games: HistoryGame[],
 *   username: string,
 * }} HistoryEntry
 */

/**
 * @returns {HistoryEntry[]}
 */
export function loadHistory() {
  try {
    const raw = GM_getValue(HISTORY_KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw
      .map(normalizeEntry)
      .filter(Boolean)
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  } catch (_) {
    return [];
  }
}

/**
 * @param {HistoryEntry[]} entries
 */
function saveHistory(entries) {
  GM_setValue(HISTORY_KEY, entries.slice(0, HISTORY_MAX_ENTRIES));
}

/**
 * @param {Partial<HistoryEntry> & { kind: HistoryKind }} input
 * @returns {HistoryEntry}
 */
export function addHistoryEntry(input) {
  const entry = normalizeEntry({
    ...input,
    id: input.id || createHistoryId(),
    at: input.at || new Date().toISOString(),
    username: input.username || getCurrentUsername() || '',
  });
  if (!entry) {
    throw new Error('Invalid history entry');
  }

  const next = [entry, ...loadHistory().filter((item) => item.id !== entry.id)];
  saveHistory(next);
  return entry;
}

/**
 * Record a completed import into local history.
 * @param {{
 *   filename?: string,
 *   doc?: import('../format/schema.js').TransferDocument | null,
 *   summary: { okCount?: number, failCount?: number, results?: object[] },
 *   entries: import('../format/schema.js').TransferEntry[],
 * }} payload
 * @returns {HistoryEntry}
 */
export function recordImportHistory(payload) {
  const results = Array.isArray(payload.summary?.results)
    ? payload.summary.results
    : [];
  const entries = payload.entries || [];
  const games = entries.map((entry, index) => {
    const result = results[index] || {};
    return {
      title: entryDisplayTitle(entry) || `#${index + 1}`,
      game_id: entry?.game_id ?? null,
      slug: entry?.slug || '',
      ok: Boolean(result.ok),
      error: result.ok ? undefined : String(result.error || ''),
    };
  });

  const okCount = Number(payload.summary?.okCount) || games.filter((g) => g.ok).length;
  const failCount =
    Number(payload.summary?.failCount) || games.filter((g) => !g.ok).length;
  const total = games.length || okCount + failCount;

  return addHistoryEntry({
    kind: 'import',
    filename: String(payload.filename || '').trim() || 'transfer.json',
    source: formatSourceLabel(payload.doc?.source),
    formatVersion:
      payload.doc?.version != null ? Number(payload.doc.version) : null,
    okCount,
    failCount,
    total,
    status: statusFromCounts(okCount, failCount),
    games,
  });
}

/**
 * @param {import('../format/schema.js').TransferSource | string | null | undefined} source
 * @returns {string}
 */
function formatSourceLabel(source) {
  if (!source) return '—';
  if (typeof source === 'string') return source.trim() || '—';
  const platform = String(source.platform || '').trim();
  const label = String(source.label || '').trim();
  if (platform && label && label !== platform) return `${platform} · ${label}`;
  return platform || label || '—';
}

/**
 * Record an export into local history (for future export feature).
 * @param {{
 *   filename?: string,
 *   source?: string,
 *   formatVersion?: number | null,
 *   games?: HistoryGame[],
 *   okCount?: number,
 *   failCount?: number,
 * }} payload
 * @returns {HistoryEntry}
 */
export function recordExportHistory(payload) {
  const games = Array.isArray(payload.games) ? payload.games : [];
  const okCount = Number(payload.okCount) || games.filter((g) => g.ok).length;
  const failCount =
    Number(payload.failCount) || games.filter((g) => !g.ok).length;

  return addHistoryEntry({
    kind: 'export',
    filename: String(payload.filename || '').trim() || 'export.json',
    source: String(payload.source || 'backloggd').trim() || 'backloggd',
    formatVersion:
      payload.formatVersion != null ? Number(payload.formatVersion) : null,
    okCount,
    failCount,
    total: games.length || okCount + failCount,
    status: statusFromCounts(okCount, failCount),
    games,
  });
}

export function clearHistory() {
  saveHistory([]);
}

/**
 * @param {string} id
 */
export function removeHistoryEntry(id) {
  saveHistory(loadHistory().filter((entry) => entry.id !== id));
}

/**
 * @param {number} okCount
 * @param {number} failCount
 * @returns {HistoryStatus}
 */
function statusFromCounts(okCount, failCount) {
  if (failCount <= 0) return 'success';
  if (okCount <= 0) return 'failed';
  return 'partial';
}

/**
 * @returns {string}
 */
function createHistoryId() {
  return `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {unknown} raw
 * @returns {HistoryEntry | null}
 */
function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const item = /** @type {Record<string, unknown>} */ (raw);
  const kind = item.kind === 'export' ? 'export' : item.kind === 'import' ? 'import' : null;
  if (!kind) return null;

  const games = Array.isArray(item.games)
    ? item.games
        .map((game) => {
          if (!game || typeof game !== 'object') return null;
          const g = /** @type {Record<string, unknown>} */ (game);
          const title = String(g.title || '').trim();
          if (!title) return null;
          return {
            title,
            game_id:
              g.game_id != null && Number.isFinite(Number(g.game_id))
                ? Number(g.game_id)
                : null,
            slug: String(g.slug || ''),
            ok: Boolean(g.ok),
            error: g.error ? String(g.error) : undefined,
          };
        })
        .filter(Boolean)
    : [];

  const okCount = Number(item.okCount) || 0;
  const failCount = Number(item.failCount) || 0;
  const status =
    item.status === 'success' || item.status === 'partial' || item.status === 'failed'
      ? item.status
      : statusFromCounts(okCount, failCount);

  return {
    id: String(item.id || createHistoryId()),
    kind,
    at: String(item.at || new Date().toISOString()),
    filename: String(item.filename || '').trim() || '—',
    source: String(item.source || '').trim() || '—',
    formatVersion:
      item.formatVersion != null && Number.isFinite(Number(item.formatVersion))
        ? Number(item.formatVersion)
        : null,
    okCount,
    failCount,
    total: Number(item.total) || games.length || okCount + failCount,
    status,
    games,
    username: String(item.username || ''),
  };
}
