import { LIBRARY_PAGE_DELAY_MS } from '../../constants.js';
import { gmRequest } from '../../gm.js';
import { sleepJitter } from '../../utils/delay.js';
import { backloggdUrl } from './site.js';
import { getCurrentUsername } from './user.js';

/**
 * Profile cover grids used by Backloggd’s own nav / scrapers.
 * `type:` filters are paginated reliably; bare `/playing` etc. are not.
 */
const LIBRARY_LISTS = Object.freeze([
  { key: 'played', path: 'games/added/type:played' },
  { key: 'playing', path: 'games/added/type:playing' },
  { key: 'backlog', path: 'games/added/type:backlog' },
  { key: 'wishlist', path: 'games/added/type:wishlist' },
  { key: 'shelved', path: 'games/added/type:shelved' },
  { key: 'abandoned', path: 'games/added/type:abandoned' },
  { key: 'retired', path: 'games/added/type:retired' },
  // Catch-all “Games” tab (may overlap with played).
  { key: 'games', path: 'games' },
]);

const MAX_PAGES_PER_SHELF = 200;

/**
 * @typedef {object} LibraryGame
 * @property {number | null} gameId
 * @property {string} slug
 * @property {string} title
 * @property {string | null} coverUrl
 */

/**
 * @typedef {object} UserLibraryIndex
 * @property {string} username
 * @property {Set<number>} gameIds
 * @property {Set<string>} slugs
 * @property {number} pageCount
 * @property {LibraryGame[]} games
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
  /** @type {Map<string, LibraryGame>} */
  const gamesByKey = new Map();
  let pageCount = 0;
  let loadedAnyPage = false;
  /** @type {string | null} */
  let lastError = null;

  for (let listIndex = 0; listIndex < LIBRARY_LISTS.length; listIndex += 1) {
    if (options.shouldCancel?.()) break;

    const { key, path } = LIBRARY_LISTS[listIndex];
    const basePath = `/u/${encodeURIComponent(username)}/${path}`;
    /** @type {string | null} */
    let previousFingerprint = null;

    for (let page = 1; page <= MAX_PAGES_PER_SHELF; page += 1) {
      if (options.shouldCancel?.()) break;

      options.onProgress?.({
        listIndex,
        listTotal: LIBRARY_LISTS.length,
        page,
        list: key,
      });

      const url = backloggdUrl(`${basePath}?page=${page}`);
      let html;
      try {
        html = await fetchLibraryHtml(url);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        // Keep whatever we already collected — do not abort the whole library.
        break;
      }

      loadedAnyPage = true;
      pageCount += 1;
      const parsed = parseLibraryPage(html, page);

      if (!parsed.gameIds.length && !parsed.slugs.length) break;

      const fingerprint = parsed.gameIds.join(',') || parsed.slugs.join(',');
      if (fingerprint && fingerprint === previousFingerprint) break;
      previousFingerprint = fingerprint;

      for (const id of parsed.gameIds) gameIds.add(id);
      for (const slug of parsed.slugs) slugs.add(slug);
      for (const game of parsed.games) {
        mergeLibraryGame(gamesByKey, game);
      }

      if (!parsed.hasNext) break;

      await sleepJitter(LIBRARY_PAGE_DELAY_MS, {
        minFactor: 0.75,
        maxFactor: 1.8,
        pauseChance: 0.1,
        pauseMinMs: 200,
        pauseMaxMs: 900,
      });
    }

    if (listIndex < LIBRARY_LISTS.length - 1 && !options.shouldCancel?.()) {
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

  return {
    username,
    gameIds,
    slugs,
    pageCount,
    games: [...gamesByKey.values()].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    ),
  };
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
 * Remember a game as present in the in-memory library index (after import).
 * @param {UserLibraryIndex | null | undefined} library
 * @param {{ gameId?: number | null, slug?: string | null }} game
 */
export function rememberLibraryGame(library, game) {
  if (!library) return;
  if (game.gameId != null && Number.isFinite(Number(game.gameId))) {
    library.gameIds.add(Number(game.gameId));
  }
  const slug = String(game.slug || '')
    .trim()
    .toLowerCase();
  if (slug) library.slugs.add(slug);
}

/**
 * Live check whether the logged-in user already has a log for this game.
 * Used during match (when scrape missed) and before POST.
 *
 * Note: GET `/api/user/{id}/log/{gameId}` is write-only (404) — do not use it.
 *
 * @param {{
 *   gameId: number,
 *   slug?: string,
 *   username?: string,
 * }} input
 * @returns {Promise<{ exists: boolean, logId?: number | null }>}
 */
export async function probeUserHasLog(input) {
  const gameId = Number(input.gameId);
  if (!Number.isFinite(gameId) || gameId <= 0) {
    return { exists: false };
  }

  const slug = String(input.slug || '').trim();
  const username = String(input.username || getCurrentUsername() || '').trim();

  // 1) Per-game user log page — strongest signal when slug is known.
  if (username && slug) {
    try {
      const detail = await probeUserLogDetails({ gameId, slug, username });
      if (detail.exists) {
        return { exists: true, logId: detail.logId ?? null };
      }
    } catch (_) {
      /* try game page */
    }
  }

  // 2) Game page HTML (sidebar / rating / log form) — needs logged-in cookies.
  if (slug) {
    try {
      const html = await fetchLibraryHtml(
        backloggdUrl(`/games/${encodeURIComponent(slug)}/`),
      );
      const fromPage = parseExistingLogFromGamePage(html, gameId);
      if (fromPage.exists) return fromPage;
    } catch (_) {
      /* give up */
    }
  }

  return { exists: false };
}

/**
 * Count the user's logs (playthroughs) for one game via `/u/{user}/logs/{slug}/`.
 * On modern Backloggd each playthrough is its own log.
 *
 * @param {{
 *   gameId?: number | null,
 *   slug: string,
 *   username?: string,
 * }} input
 * @returns {Promise<{
 *   exists: boolean,
 *   logId: number | null,
 *   logCount: number,
 *   gameStatus: string | null,
 *   logs: object[],
 *   logUrl: string | null,
 * }>}
 */
export async function probeUserLogDetails(input) {
  const slug = String(input.slug || '')
    .trim()
    .toLowerCase();
  const username = String(input.username || getCurrentUsername() || '').trim();
  const gameIdRaw = Number(input.gameId);
  const gameId =
    Number.isFinite(gameIdRaw) && gameIdRaw > 0 ? gameIdRaw : null;

  if (!username || !slug) {
    return {
      exists: false,
      logId: null,
      logCount: 0,
      gameStatus: null,
      logs: [],
      logUrl: null,
    };
  }

  const logUrl = backloggdUrl(
    `/u/${encodeURIComponent(username)}/logs/${encodeURIComponent(slug)}/`,
  );

  const res = await fetchHtmlResponse(logUrl);
  if (!res.ok || isSoftNotFoundPage(res.html)) {
    return {
      exists: false,
      logId: null,
      logCount: 0,
      gameStatus: null,
      logs: [],
      logUrl,
    };
  }

  const parsed = parseUserLogsDetail(res.html, gameId, { username });
  return {
    exists: parsed.exists,
    logId: parsed.logId,
    logCount: parsed.logCount,
    gameStatus: parsed.gameStatus,
    logs: parsed.logs,
    logUrl,
  };
}

/**
 * @param {string} html
 * @param {number | null} [gameId]
 * @param {{ username?: string }} [options]
 * @returns {{
 *   exists: boolean,
 *   logId: number | null,
 *   logCount: number,
 *   gameStatus: string | null,
 *   logs: {
 *     id: number | null,
 *     title: string,
 *     rating: number | null,
 *     platform: string | null,
 *     badges: string[],
 *     startDate: string | null,
 *     finishDate: string | null,
 *     datesLabel: string | null,
 *     gameId: number | null,
 *   }[],
 * }}
 */
function parseUserLogsDetail(html, gameId = null, options = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  /** @type {ReturnType<typeof parseUserLogsDetail>['logs']} */
  const logs = [];
  /** @type {Set<string>} */
  const seenKeys = new Set();

  /**
   * @param {Partial<ReturnType<typeof parseUserLogsDetail>['logs'][number]> & { id?: number | null, title?: string }} entry
   */
  const pushLog = (entry) => {
    const cleanTitle = String(entry.title || '')
      .replace(/\s+/g, ' ')
      .trim();
    const idNum =
      entry.id != null && Number.isFinite(Number(entry.id)) && Number(entry.id) > 0
        ? Number(entry.id)
        : null;
    const key = idNum != null ? `id:${idNum}` : `t:${cleanTitle.toLowerCase()}`;
    if (seenKeys.has(key)) return;
    if (!cleanTitle && idNum == null) return;
    seenKeys.add(key);
    logs.push({
      id: idNum,
      title: cleanTitle || (idNum != null ? `Log #${idNum}` : 'Log'),
      rating: entry.rating ?? null,
      platform: entry.platform ?? null,
      badges: Array.isArray(entry.badges) ? entry.badges : [],
      startDate: entry.startDate ?? null,
      finishDate: entry.finishDate ?? null,
      datesLabel: entry.datesLabel ?? null,
      gameId: entry.gameId ?? null,
    });
  };

  const gameStatus = parseGameStatusFromLogsPage(doc);

  // 1) Profile logs page: `.playthrough-view` (+ sibling `.playthrough-dates`).
  doc.querySelectorAll('.playthrough-view').forEach((view) => {
    pushLog(parsePlaythroughView(view, gameId));
  });

  // Unique ids from open/delete buttons if a view lacked structure.
  if (!logs.length) {
    doc
      .querySelectorAll(
        'button.open-log[playthrough_id], button.delete-log[playthrough_id]',
      )
      .forEach((btn) => {
        const gId = Number(btn.getAttribute('game_id'));
        pushLog({
          id: Number(btn.getAttribute('playthrough_id')),
          title: 'Log',
          gameId: Number.isFinite(gId) && gId > 0 ? gId : gameId,
        });
      });
  }

  // 2) Full editor modal: switcher tabs / time-tracker rows.
  if (!logs.length) {
    doc
      .querySelectorAll(
        '#playthrough-container [playthrough_id], #playthrough-container button[playthrough_id], button.btn-nav[playthrough_id]',
      )
      .forEach((el) => {
        const id = el.getAttribute('playthrough_id');
        const titleEl = el.querySelector('.playthrough-option-title');
        pushLog({
          id: Number(id),
          title: titleEl?.textContent || el.textContent || 'Log',
          gameId,
        });
      });
  }

  if (!logs.length) {
    doc
      .querySelectorAll(
        '#time-played-entries-container .time-entry-row[playthrough_id], #time-played-entries-container [playthrough_id]',
      )
      .forEach((el) => {
        const id = el.getAttribute('playthrough_id');
        const titleEl = el.querySelector(
          '.playthrough-title, .playthrough-option-title',
        );
        pushLog({
          id: Number(id),
          title: titleEl?.textContent || 'Log',
          gameId,
        });
      });
  }

  // 3) Form fields from older/partial markup.
  if (!logs.length) {
    /** @type {Map<string, { id: number | null, title: string }>} */
    const fromForm = new Map();
    doc.querySelectorAll('input[name^="playthroughs["]').forEach((input) => {
      const name = input.getAttribute('name') || '';
      const match = name.match(/^playthroughs\[(\d+|-\d+)\]\[(id|title)\]$/i);
      if (!match) return;
      const idx = match[1];
      const field = match[2].toLowerCase();
      const row = fromForm.get(idx) || { id: null, title: '' };
      const value = String(
        input.getAttribute('value') ??
          /** @type {HTMLInputElement} */ (input).value ??
          '',
      ).trim();
      if (field === 'id') {
        const n = Number(value);
        row.id = Number.isFinite(n) && n > 0 ? n : null;
      } else {
        row.title = value;
      }
      fromForm.set(idx, row);
    });
    for (const row of fromForm.values()) {
      if (row.id != null || row.title) {
        pushLog({ id: row.id, title: row.title || 'Log', gameId });
      }
    }
  }

  let logId = null;
  const logIdInput =
    doc.querySelector('input[name="log[id]"]') ||
    doc.querySelector('#log_id') ||
    doc.querySelector('[name="log[id]"]') ||
    doc.querySelector('input#log_id');
  const logIdRaw = logIdInput?.getAttribute?.('value') ?? logIdInput?.value;
  if (logIdRaw != null && String(logIdRaw).trim() !== '') {
    const n = Number(logIdRaw);
    if (Number.isFinite(n) && n > 0) logId = n;
  }

  const currentPt = doc.querySelector(
    '#current_playthrough, input[name="current_playthrough"]',
  );
  const currentPtRaw = currentPt?.getAttribute?.('value') ?? currentPt?.value;
  const currentPtId = Number(currentPtRaw);
  if (
    logs.length === 0 &&
    Number.isFinite(currentPtId) &&
    currentPtId > 0
  ) {
    pushLog({
      id: currentPtId,
      title: doc.querySelector('#log-title-field')?.value || 'Log',
      gameId,
    });
  }

  const hasLogsPage = Boolean(
    doc.querySelector(
      '.playthrough-view, .game-log-view, #logs-display-nav, button.log-editor-btn',
    ),
  );
  const hasEditor = Boolean(
    doc.querySelector(
      '#log-editor-full, #playthrough-container, #journal-game-modal, #current_playthrough',
    ),
  );

  let exists = logs.length > 0 || logId != null || hasEditor || hasLogsPage;
  if (!exists && gameId != null) {
    const cover = doc.querySelector(
      `.game-cover[game_id="${gameId}"], [game_id="${gameId}"]`,
    );
    if (cover) exists = true;
  }

  const logCount = Math.max(logs.length, exists ? 1 : 0);
  if (exists && logs.length === 0) {
    logs.push({
      id: logId,
      title: 'Log',
      rating: null,
      platform: null,
      badges: [],
      startDate: null,
      finishDate: null,
      datesLabel: null,
      gameId,
    });
  }

  return {
    exists,
    logId,
    logCount,
    gameStatus,
    logs,
  };
}

/**
 * @param {Element} view
 * @param {number | null} fallbackGameId
 */
function parsePlaythroughView(view, fallbackGameId) {
  const btn =
    view.querySelector(
      'button.open-log[playthrough_id], button.delete-log[playthrough_id], [playthrough_id]',
    ) || null;
  const idRaw = Number(btn?.getAttribute('playthrough_id'));
  const id =
    Number.isFinite(idRaw) && idRaw > 0 ? idRaw : null;
  const gRaw = Number(
    btn?.getAttribute('game_id') ||
      view.querySelector('[game_id]')?.getAttribute('game_id'),
  );
  const entryGameId =
    Number.isFinite(gRaw) && gRaw > 0 ? gRaw : fallbackGameId;

  const titleEl =
    view.querySelector('h3.mb-1') ||
    view.querySelector(':scope > .col-12 h3, :scope .col-12.my-auto > h3') ||
    view.querySelector('h3');
  const title = String(titleEl?.textContent || 'Log')
    .replace(/\s+/g, ' ')
    .trim();

  const rating = parseStarRating(view);
  const platform =
    String(
      view.querySelector('a.secondary-link, a[href*="played_platform"]')
        ?.textContent || '',
    )
      .replace(/\s+/g, ' ')
      .trim() || null;

  /** @type {string[]} */
  const badges = [];
  view.querySelectorAll('p.time-played').forEach((el) => {
    const text = String(el.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) return;
    if (!badges.includes(text)) badges.push(text);
  });

  const row =
    view.closest('.row.mb-4') ||
    view.parentElement?.closest?.('.row') ||
    null;
  const datesCol = row?.querySelector('.playthrough-dates') || null;
  const dates = parsePlaythroughDates(datesCol);

  return {
    id,
    title,
    rating,
    platform,
    badges,
    startDate: dates.startDate,
    finishDate: dates.finishDate,
    datesLabel: dates.datesLabel,
    gameId: entryGameId,
  };
}

/**
 * @param {Element} root
 * @returns {number | null}
 */
function parseStarRating(root) {
  const stars = root.querySelector('.stars-top');
  if (!stars) return null;
  const style = stars.getAttribute('style') || '';
  const match = style.match(/width\s*:\s*([\d.]+)\s*%/i);
  if (!match) return null;
  const pct = Number(match[1]);
  if (!Number.isFinite(pct) || pct <= 0) return null;
  // Backloggd half-star UI: 10% ≈ ½★ ≈ rating 1 on the 1–10 scale.
  return Math.max(1, Math.min(10, Math.round(pct / 10)));
}

/**
 * @param {Element | null | undefined} datesCol
 */
function parsePlaythroughDates(datesCol) {
  if (!datesCol) {
    return { startDate: null, finishDate: null, datesLabel: null };
  }

  const empty = String(datesCol.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (/no play sessions logged/i.test(empty) && !datesCol.querySelector('.playdate-view')) {
    return {
      startDate: null,
      finishDate: null,
      datesLabel: 'No play sessions logged',
    };
  }

  /** @type {string | null} */
  let startDate = null;
  /** @type {string | null} */
  let finishDate = null;
  const month = String(
    datesCol.querySelector('.playdate-month h3')?.textContent || '',
  )
    .replace(/\s+/g, ' ')
    .trim();

  datesCol.querySelectorAll('.playdate-view').forEach((block) => {
    const dayNums = [...block.querySelectorAll('.number-date h4')]
      .map((el) => String(el.textContent || '').trim())
      .filter((t) => /^\d{1,2}$/.test(t));
    const label = String(
      block.querySelector('.subtitle-text, p.subtitle-text')?.textContent || '',
    )
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!dayNums.length) return;
    const day = dayNums[dayNums.length - 1];
    const composed = month ? `${month} ${day}` : day;
    if (/start/.test(label)) startDate = composed;
    else if (/finish|finished|complete/.test(label)) finishDate = composed;
    else if (!startDate) startDate = composed;
    else if (!finishDate) finishDate = composed;
  });

  /** @type {string | null} */
  let datesLabel = null;
  if (startDate && finishDate) datesLabel = `${startDate} → ${finishDate}`;
  else if (startDate) datesLabel = startDate;
  else if (finishDate) datesLabel = finishDate;
  else if (month) datesLabel = month;

  return { startDate, finishDate, datesLabel };
}

/**
 * @param {Document} doc
 * @returns {string | null}
 */
function parseGameStatusFromLogsPage(doc) {
  const current = doc.querySelector('#log-status .current p, #log-status .col-3.current p');
  const text = String(current?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}

/**
 * @param {Map<string, LibraryGame>} map
 * @param {LibraryGame} game
 */
function mergeLibraryGame(map, game) {
  const slug = String(game.slug || '')
    .trim()
    .toLowerCase();
  const gameId =
    game.gameId != null && Number.isFinite(Number(game.gameId))
      ? Number(game.gameId)
      : null;
  if (!slug && gameId == null) return;

  /** @type {string | null} */
  let existingKey = null;
  /** @type {LibraryGame | undefined} */
  let prev;

  if (slug && map.has(`s:${slug}`)) {
    existingKey = `s:${slug}`;
    prev = map.get(existingKey);
  } else if (gameId != null) {
    for (const [key, value] of map) {
      if (value.gameId === gameId) {
        existingKey = key;
        prev = value;
        break;
      }
    }
  }

  if (!prev || !existingKey) {
    const key = slug ? `s:${slug}` : `i:${gameId}`;
    map.set(key, {
      gameId,
      slug,
      title: game.title || slug || (gameId != null ? `Game #${gameId}` : ''),
      coverUrl: game.coverUrl || null,
    });
    return;
  }

  // Prefer slug-keyed entries when we learn the slug later.
  if (slug && existingKey !== `s:${slug}`) {
    map.delete(existingKey);
    existingKey = `s:${slug}`;
    map.set(existingKey, prev);
  }

  if (gameId != null && prev.gameId == null) prev.gameId = gameId;
  if (slug && !prev.slug) prev.slug = slug;
  if (game.title && (!prev.title || prev.title === prev.slug)) {
    prev.title = game.title;
  }
  if (game.coverUrl && !prev.coverUrl) prev.coverUrl = game.coverUrl;
}

/**
 * @param {string} html
 * @param {number} [gameId]
 */
function parseExistingLogFromGamePage(html, gameId) {
  const doc = new DOMParser().parseFromString(html, 'text/html');

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

  // Sidebar play status buttons (Backloggd Plus uses the same markers).
  const sidebar = doc.querySelector('#logging-sidebar-section');
  if (sidebar) {
    const activePlay = sidebar.querySelector(
      '.played-btn-container.active, .playing-btn-container.active, .backlog-btn-container.active, .wishlist-btn-container.active, .btn-play.active, .btn-play.selected, [play_type]',
    );
    if (activePlay) return { exists: true, logId: null };

    const rated = sidebar.querySelector(
      '.star-rating-game input.star-radio:checked, input.star-radio:checked',
    );
    if (rated) return { exists: true, logId: null };

    const liked = sidebar.querySelector(
      '.like-game-btn.active, .like-game-btn.liked, .fa-heart.fa-solid',
    );
    if (liked) return { exists: true, logId: null };
  }

  // Cover widget with the user’s rating for this game.
  if (gameId != null) {
    const cover = doc.querySelector(
      `.game-cover[game_id="${gameId}"], [game_id="${gameId}"].game-cover`,
    );
    if (
      cover &&
      (cover.classList.contains('user-rating') ||
        cover.getAttribute('data-rating') ||
        cover.querySelector('.stars-top, .user-rating, .rating'))
    ) {
      return { exists: true, logId: null };
    }
  }

  // Any checked star rating on the page for the current user.
  if (
    doc.querySelector(
      '.star-rating-game input.star-radio:checked, #modal-rating input[name="rating_modal"]:checked',
    )
  ) {
    return { exists: true, logId: null };
  }

  const editHints = [
    ...doc.querySelectorAll(
      'a, button, [data-target="#log-modal"], [data-toggle="modal"]',
    ),
  ];
  for (const el of editHints) {
    const text = String(el.textContent || '').toLowerCase();
    const href = String(el.getAttribute?.('href') || '');
    if (
      /edit\s*(log|entry)|your\s*log|update\s*log|изменить|редактир|мой\s*лог/i.test(
        text,
      ) ||
      /\/logs\/|log.*edit|edit.*log/i.test(href)
    ) {
      return { exists: true, logId: null };
    }
  }

  return { exists: false };
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchLibraryHtml(url) {
  const res = await fetchHtmlResponse(url);
  if (!res.ok) {
    throw new Error(`Library HTTP ${res.status}`);
  }
  return res.html;
}

/**
 * @param {string} url
 * @returns {Promise<{ ok: boolean, status: number, html: string }>}
 */
async function fetchHtmlResponse(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
      redirect: 'follow',
    });
    const html = await res.text();
    return { ok: res.ok, status: res.status, html };
  } catch (err) {
    try {
      const html = await gmRequest({
        url,
        method: 'GET',
        responseType: 'text',
        headers: { Accept: 'text/html' },
        timeout: 25000,
      });
      if (typeof html === 'string' && html) {
        return { ok: true, status: 200, html };
      }
    } catch (_) {
      /* keep original error */
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}

/**
 * @param {string} html
 */
function isSoftNotFoundPage(html) {
  const text = String(html || '').toLowerCase();
  return (
    /page not found|couldn't find|could not find|404|doesn’t exist|doesn't exist|no logs yet/i.test(
      text,
    ) && !/playthrough|log-editor|journal_entry|game-cover|log-option/i.test(text)
  );
}

/**
 * @param {string} html
 * @param {number} [currentPage]
 * @returns {{
 *   gameIds: number[],
 *   slugs: string[],
 *   games: LibraryGame[],
 *   hasNext: boolean,
 * }}
 */
function parseLibraryPage(html, currentPage = 1) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  /** @type {number[]} */
  const gameIds = [];
  /** @type {string[]} */
  const slugs = [];
  /** @type {LibraryGame[]} */
  const games = [];
  const seenIds = new Set();
  const seenSlugs = new Set();
  /** @type {Set<string>} */
  const seenGameKeys = new Set();

  /**
   * @param {Element} cover
   */
  const ingestCover = (cover) => {
    const idRaw = Number(cover.getAttribute('game_id'));
    const gameId =
      Number.isFinite(idRaw) && idRaw > 0 ? idRaw : null;

    let anchor =
      cover.closest('a[href*="/games/"]') ||
      cover.querySelector('a[href*="/games/"]');
    if (!anchor) {
      const wrap = cover.closest(
        '.rating-hover, .game-cover-link, .cover-link, li, .col, .col-auto, article',
      );
      anchor = wrap?.querySelector('a[href*="/games/"]') || null;
    }

    const href = anchor?.getAttribute?.('href') || '';
    const slugMatch = href.match(/\/games\/([^/?#]+)/i);
    const slug = slugMatch?.[1]
      ? decodeURIComponent(slugMatch[1]).toLowerCase()
      : '';

    if (gameId != null && !seenIds.has(gameId)) {
      seenIds.add(gameId);
      gameIds.push(gameId);
    }
    if (slug && slug !== 'lib' && slug !== 'added' && !seenSlugs.has(slug)) {
      seenSlugs.add(slug);
      slugs.push(slug);
    }

    const key = slug ? `s:${slug}` : gameId != null ? `i:${gameId}` : '';
    if (!key || seenGameKeys.has(key)) return;
    seenGameKeys.add(key);

    const img =
      cover.querySelector('img') ||
      anchor?.querySelector?.('img') ||
      null;
    const title = String(
      cover.getAttribute('aria-label') ||
        cover.getAttribute('title') ||
        img?.getAttribute('alt') ||
        anchor?.getAttribute('title') ||
        anchor?.getAttribute('aria-label') ||
        (slug ? slug.replace(/-/g, ' ') : '') ||
        (gameId != null ? `Game #${gameId}` : ''),
    )
      .replace(/\s+/g, ' ')
      .trim();
    const coverUrl =
      img?.getAttribute('src') ||
      img?.getAttribute('data-src') ||
      img?.getAttribute('data-lazy-src') ||
      null;

    games.push({
      gameId,
      slug,
      title,
      coverUrl: coverUrl ? String(coverUrl) : null,
    });
  };

  doc
    .querySelectorAll(
      '.game-cover[game_id], [game_id].game-cover, .rating-hover .game-cover',
    )
    .forEach((el) => ingestCover(el));

  if (!gameIds.length) {
    doc.querySelectorAll('[game_id]').forEach((el) => ingestCover(el));
  }

  doc.querySelectorAll('a[href*="/games/"]').forEach((el) => {
    const href = el.getAttribute('href') || '';
    const match = href.match(/\/games\/([^/?#]+)/i);
    if (!match?.[1]) return;
    const slug = decodeURIComponent(match[1]).toLowerCase();
    if (!slug || slug === 'lib' || slug === 'added' || seenSlugs.has(slug)) {
      return;
    }
    seenSlugs.add(slug);
    slugs.push(slug);

    const key = `s:${slug}`;
    if (seenGameKeys.has(key)) return;
    seenGameKeys.add(key);

    const img = el.querySelector('img');
    const title = String(
      el.getAttribute('title') ||
        el.getAttribute('aria-label') ||
        img?.getAttribute('alt') ||
        slug.replace(/-/g, ' '),
    )
      .replace(/\s+/g, ' ')
      .trim();
    games.push({
      gameId: null,
      slug,
      title,
      coverUrl:
        img?.getAttribute('src') ||
        img?.getAttribute('data-src') ||
        null,
    });
  });

  const hasNext = detectHasNextPage(doc, currentPage);

  return { gameIds, slugs, games, hasNext };
}

/**
 * Backloggd often uses a plain “Next” link without rel="next" or .pagination.
 * @param {Document} doc
 * @param {number} currentPage
 */
function detectHasNextPage(doc, currentPage) {
  if (
    doc.querySelector(
      'a[rel="next"], .pagination a[rel="next"], .pagination .next:not(.disabled)',
    )
  ) {
    return true;
  }

  for (const a of doc.querySelectorAll('a[href*="page="]')) {
    const href = a.getAttribute('href') || '';
    const text = String(a.textContent || '')
      .trim()
      .toLowerCase();
    if (/^(next|›|»|→)$/i.test(text) || text.includes('next')) {
      return true;
    }
    const m = href.match(/[?&]page=(\d+)/i);
    if (m && Number(m[1]) > currentPage) return true;
  }

  return false;
}
