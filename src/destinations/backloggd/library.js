import { getCurrentUsername } from './user.js';

/** Library list paths under `/u/{user}/games/added/`. */
const LIBRARY_LISTS = Object.freeze([
  'type:played',
  'type:playing',
  'type:backlog',
  'type:wishlist',
  'game_status:shelved',
  'game_status:abandoned',
  'game_status:retired',
]);

const MAX_PAGES_PER_LIST = 80;

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

  for (let listIndex = 0; listIndex < LIBRARY_LISTS.length; listIndex += 1) {
    if (options.shouldCancel?.()) break;

    const list = LIBRARY_LISTS[listIndex];
    let url = `https://www.backloggd.com/u/${encodeURIComponent(username)}/games/added/${list}/`;
    let page = 0;

    while (url && page < MAX_PAGES_PER_LIST) {
      if (options.shouldCancel?.()) break;

      page += 1;
      pageCount += 1;
      options.onProgress?.({
        listIndex,
        listTotal: LIBRARY_LISTS.length,
        page,
        list,
      });

      const html = await fetchLibraryHtml(url);
      const parsed = parseLibraryPage(html);
      for (const id of parsed.gameIds) gameIds.add(id);
      for (const slug of parsed.slugs) slugs.add(slug);

      url = parsed.nextUrl;
    }
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
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchLibraryHtml(url) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'text/html' },
  });
  if (!res.ok) {
    throw new Error(`Library HTTP ${res.status}`);
  }
  return res.text();
}

/**
 * @param {string} html
 * @returns {{ gameIds: number[], slugs: string[], nextUrl: string | null }}
 */
function parseLibraryPage(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  /** @type {number[]} */
  const gameIds = [];
  /** @type {string[]} */
  const slugs = [];

  doc.querySelectorAll('[game_id]').forEach((el) => {
    const id = Number(el.getAttribute('game_id'));
    if (Number.isFinite(id) && id > 0) gameIds.push(id);
  });

  doc.querySelectorAll('a[href*="/games/"]').forEach((el) => {
    const href = el.getAttribute('href') || '';
    const match = href.match(/\/games\/([^/?#]+)/i);
    if (match?.[1]) slugs.push(decodeURIComponent(match[1]).toLowerCase());
  });

  const nextHref =
    doc.querySelector('a[rel="next"]')?.getAttribute('href') ||
    doc.querySelector('.pagination a[rel="next"]')?.getAttribute('href') ||
    '';
  const nextUrl = nextHref
    ? new URL(nextHref, 'https://www.backloggd.com').href
    : null;

  return { gameIds, slugs, nextUrl };
}
