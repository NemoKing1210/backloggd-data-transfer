import { LIBRARY_PAGE_DELAY_MS } from '../../constants.js';
import { gmRequest } from '../../gm.js';
import { sleepJitter } from '../../utils/delay.js';
import { backloggdUrl } from './site.js';
import { getCurrentUsername } from './user.js';

/**
 * Primary shelves users see in the navbar.
 * Prefer these over /games/added/… filters — pagination there is unreliable.
 * Path without trailing slash: Backloggd can 403 `/games/` on some CDNs.
 */
const LIBRARY_SHELVES = Object.freeze([
  'games',
  'playing',
  'backlog',
  'wishlist',
]);

/** Extra status filters (may overlap with Played). */
const LIBRARY_STATUS_FILTERS = Object.freeze([
  'games/added/game_status:shelved',
  'games/added/game_status:abandoned',
  'games/added/game_status:retired',
]);

const MAX_PAGES_PER_SHELF = 120;

/**
 * @typedef {object} UserLibraryIndex
 * @property {string} username
 * @property {Set<number>} gameIds
 * @property {Set<string>} slugs
 * @property {number} pageCount
 */

/**
 * Load the current user's logged games into id/slug sets (same-origin fetch).
 *
 * @param {{
 *   onProgress?: (info: { listIndex: number, listTotal: number, page: number, list: string }) => void,
 *   shouldCancel?: () => boolean,
 * }} [options]
 * @returns {Promise<UserLibraryIndex>}
 */
export async function loadCurrentUserLibrary(options = {}) {
  const username = getCurrentUsername();
  if (!username) {
    throw new Error('Not logged in — cannot load library');
  }

  /** @type {Set<number>} */
  const gameIds = new Set();
  /** @type {Set<string>} */
  const slugs = new Set();
  let pageCount = 0;
  let loadedAnyPage = false;
  /** @type {string | null} */
  let lastError = null;

  const lists = [
    ...LIBRARY_SHELVES.map((s) => ({ key: s, path: `/u/${encodeURIComponent(username)}/${s}` })),
    ...LIBRARY_STATUS_FILTERS.map((s) => ({
      key: s,
      path: `/u/${encodeURIComponent(username)}/${s}`,
    })),
  ];

  for (let listIndex = 0; listIndex < lists.length; listIndex += 1) {
    if (options.shouldCancel?.()) break;

    const { key, path } = lists[listIndex];
    /** @type {string | null} */
    let previousFingerprint = null;

    for (let page = 1; page <= MAX_PAGES_PER_SHELF; page += 1) {
      if (options.shouldCancel?.()) break;

      options.onProgress?.({
        listIndex,
        listTotal: lists.length,
        page,
        list: key,
      });

      const url = backloggdUrl(`${path}?page=${page}`);
      let html;
      try {
        html = await fetchLibraryHtml(url);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        // First page missing / blocked — skip this shelf.
        if (page === 1) break;
        throw err instanceof Error ? err : new Error(String(err));
      }

      loadedAnyPage = true;
      pageCount += 1;
      const parsed = parseLibraryPage(html);

      // Empty page → end of shelf.
      if (!parsed.gameIds.length && !parsed.slugs.length) break;

      // Backloggd often re-serves the last page forever — stop on repeat.
      const fingerprint = parsed.gameIds.join(',') || parsed.slugs.join(',');
      if (fingerprint && fingerprint === previousFingerprint) break;
      previousFingerprint = fingerprint;

      for (const id of parsed.gameIds) gameIds.add(id);
      for (const slug of parsed.slugs) slugs.add(slug);

      // No next hint and short page — likely last.
      if (!parsed.hasNextHint && parsed.gameIds.length < 12) break;

      await sleepJitter(LIBRARY_PAGE_DELAY_MS, {
        minFactor: 0.75,
        maxFactor: 1.8,
        pauseChance: 0.1,
        pauseMinMs: 200,
        pauseMaxMs: 900,
      });
    }

    if (listIndex < lists.length - 1 && !options.shouldCancel?.()) {
      await sleepJitter(LIBRARY_PAGE_DELAY_MS * 1.4, {
        minFactor: 0.8,
        maxFactor: 1.7,
        pauseChance: 0.15,
        pauseMinMs: 250,
        pauseMaxMs: 1100,
      });
    }
  }

  if (!loadedAnyPage && lastError) {
    throw new Error(lastError);
  }

  return { username, gameIds, slugs, pageCount };
}

/**
 * @param {number | null | undefined} gameId
 * @param {string | null | undefined} slug
 * @param {UserLibraryIndex | null | undefined} library
 * @returns {boolean}
 */
export function libraryHasGame(gameId, slug, library) {
  if (!library) return false;
  if (gameId != null && library.gameIds.has(Number(gameId))) return true;
  const normalized = String(slug || '')
    .trim()
    .toLowerCase();
  if (normalized && library.slugs.has(normalized)) return true;
  return false;
}

/**
 * Live check whether the logged-in user already has a log for this game.
 * Used as a safety net before POST (library scrape can miss games).
 *
 * @param {{
 *   gameId: number,
 *   slug?: string,
 *   userId?: number,
 * }} input
 * @returns {Promise<{ exists: boolean, logId?: number | null }>}
 */
export async function probeUserHasLog(input) {
  const gameId = Number(input.gameId);
  if (!Number.isFinite(gameId) || gameId <= 0) {
    return { exists: false };
  }

  // 1) Game page HTML — most reliable when we have a slug (same session cookies).
  const slug = String(input.slug || '').trim();
  if (slug) {
    try {
      const html = await fetchLibraryHtml(
        backloggdUrl(`/games/${encodeURIComponent(slug)}/`),
      );
      const fromPage = parseExistingLogFromGamePage(html, gameId);
      if (fromPage.exists) return fromPage;
    } catch (_) {
      /* try API next */
    }
  }

  // 2) Log API GET (when available).
  const userId = Number(input.userId);
  if (Number.isFinite(userId) && userId > 0) {
    try {
      const res = await fetch(
        backloggdUrl(`/api/user/${userId}/log/${gameId}`),
        {
          method: 'GET',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
          },
        },
      );
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const logId = extractLogId(data);
        if (logId != null) return { exists: true, logId };
        // 200 with empty / placeholder — treat as unknown, don't assume missing.
        if (data && typeof data === 'object' && Object.keys(data).length) {
          return { exists: true, logId: null };
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  return { exists: false };
}

/**
 * @param {string} html
 * @param {number} [gameId]
 */
function parseExistingLogFromGamePage(html, gameId) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Explicit log id on the editor form.
  const logIdInput =
    doc.querySelector('input[name="log[id]"]') ||
    doc.querySelector('#log_id') ||
    doc.querySelector('[name="log[id]"]');
  const logIdRaw = logIdInput?.getAttribute?.('value') ?? logIdInput?.value;
  if (logIdRaw != null && String(logIdRaw).trim() !== '') {
    const logId = Number(logIdRaw);
    if (Number.isFinite(logId) && logId > 0) {
      return { exists: true, logId };
    }
  }

  // "Edit" / existing log CTAs on the game page.
  const editHints = [
    ...doc.querySelectorAll(
      'a, button, [data-target="#log-modal"], [data-toggle="modal"]',
    ),
  ];
  for (const el of editHints) {
    const text = String(el.textContent || '').toLowerCase();
    const href = String(el.getAttribute?.('href') || '');
    if (
      /edit\s*(log|entry)|your\s*log|update\s*log|изменить|редактир/i.test(
        text,
      ) ||
      /log.*edit|edit.*log/i.test(href)
    ) {
      return { exists: true, logId: null };
    }
  }

  // Cover / rating widget tied to this game for the current user.
  if (gameId != null) {
    const cover = doc.querySelector(
      `.game-cover[game_id="${gameId}"], [game_id="${gameId}"]`,
    );
    if (
      cover &&
      (cover.getAttribute('data-rating') ||
        cover.querySelector('.stars-top, .user-rating, .rating'))
    ) {
      return { exists: true, logId: null };
    }
  }

  // Journal / activity blurb: "You logged …"
  const bodyText = doc.body?.textContent || '';
  if (/you (logged|played|rated)|вы (залог|оценили|прошли)/i.test(bodyText)) {
    // Too broad alone — only if combined with log modal markup.
    if (doc.querySelector('#log-modal, #log_form, form[action*="/log/"]')) {
      const hasFilled =
        doc.querySelector('input[name="log[status]"][value]:not([value=""])') ||
        doc.querySelector('select[name="log[status]"] option[selected]');
      if (hasFilled) return { exists: true, logId: null };
    }
  }

  return { exists: false };
}

/**
 * @param {unknown} data
 * @returns {number | null}
 */
function extractLogId(data) {
  if (!data || typeof data !== 'object') return null;
  const raw =
    /** @type {Record<string, unknown>} */ (data).id ??
    /** @type {Record<string, unknown>} */ (data).log_id ??
    (/** @type {Record<string, unknown>} */ (data).log &&
      typeof /** @type {Record<string, unknown>} */ (data).log === 'object'
      ? /** @type {Record<string, unknown>} */ (
          /** @type {Record<string, unknown>} */ (data).log
        ).id
      : null);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchLibraryHtml(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) {
      throw new Error(`Library HTTP ${res.status}`);
    }
    return await res.text();
  } catch (err) {
    try {
      const html = await gmRequest({
        url,
        method: 'GET',
        responseType: 'text',
        headers: { Accept: 'text/html' },
        timeout: 25000,
      });
      if (typeof html === 'string' && html) return html;
    } catch (_) {
      /* keep original error */
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * @param {string} html
 * @returns {{ gameIds: number[], slugs: string[], hasNextHint: boolean }}
 */
function parseLibraryPage(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  /** @type {number[]} */
  const gameIds = [];
  /** @type {string[]} */
  const slugs = [];
  const seenIds = new Set();
  const seenSlugs = new Set();

  // Prefer cover cards — canonical place for game_id on profile grids.
  doc.querySelectorAll('.game-cover[game_id], [game_id].game-cover, .rating-hover .game-cover').forEach((el) => {
    const id = Number(el.getAttribute('game_id'));
    if (!Number.isFinite(id) || id <= 0 || seenIds.has(id)) return;
    seenIds.add(id);
    gameIds.push(id);
  });

  // Fallback: any game_id attribute on the page.
  if (!gameIds.length) {
    doc.querySelectorAll('[game_id]').forEach((el) => {
      const id = Number(el.getAttribute('game_id'));
      if (!Number.isFinite(id) || id <= 0 || seenIds.has(id)) return;
      seenIds.add(id);
      gameIds.push(id);
    });
  }

  doc.querySelectorAll('a[href*="/games/"]').forEach((el) => {
    const href = el.getAttribute('href') || '';
    const match = href.match(/\/games\/([^/?#]+)/i);
    if (!match?.[1]) return;
    const slug = decodeURIComponent(match[1]).toLowerCase();
    if (!slug || seenSlugs.has(slug)) return;
    seenSlugs.add(slug);
    slugs.push(slug);
  });

  const hasNextHint = Boolean(
    doc.querySelector('a[rel="next"]') ||
      doc.querySelector('.pagination a[rel="next"]') ||
      doc.querySelector('.pagination .next:not(.disabled)') ||
      /[?&]page=\d+/.test(
        doc.querySelector('.pagination a[href*="page="]')?.getAttribute('href') ||
          '',
      ),
  );

  return { gameIds, slugs, hasNextHint };
}
