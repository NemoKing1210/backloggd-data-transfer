import { backloggdUrl } from '../destinations/backloggd/site.js';
import { scanMultiLogGames } from '../destinations/backloggd/multi-logs.js';
import { isLoggedIn } from '../destinations/backloggd/auth.js';
import { getCurrentUsername } from '../destinations/backloggd/user.js';
import { fmt } from '../i18n/index.js';
import { t } from '../state.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
import { showToast } from './toast.js';

/** @typedef {import('../destinations/backloggd/multi-logs.js').MultiLogGame} MultiLogGame */

/** @type {'idle' | 'scanning' | 'done' | 'error'} */
let cleanupPhase = 'idle';
/** @type {MultiLogGame[]} */
let cleanupGames = [];
/** @type {Set<string>} */
let hiddenSlugs = new Set();
/** @type {string} */
let lastUsername = '';
/** @type {{ scanned: number, skippedNoSlug: number, errors: number } | null} */
let lastStats = null;
/** @type {string | null} */
let lastError = null;
let scanCancelled = false;
/** @type {'count' | 'title'} */
let sortMode = 'count';
let searchQuery = '';

/**
 * Render the Cleanup tab (multi-log games).
 * @param {HTMLElement} root
 */
export function renderCleanupPanel(root) {
  const panel = root.querySelector('[data-bdt-panel="cleanup"]');
  if (!panel) return;

  const username = getCurrentUsername() || lastUsername;
  if (username && username !== lastUsername) {
    lastUsername = username;
    hiddenSlugs = new Set();
  }

  if (!isLoggedIn()) {
    panel.innerHTML = renderAuthGate();
    syncCleanupTabBadge(root, 0);
    return;
  }

  const visible = getVisibleGames();
  syncCleanupTabBadge(root, visible.length);

  panel.innerHTML = `
    <div class="bdt-cleanup">
      <div class="bdt-cleanup__head">
        <div>
          <h3 class="bdt-cleanup__title">${escapeHtml(t.cleanupTitle)}</h3>
          <p class="bdt-cleanup__lead">${escapeHtml(t.cleanupLead)}</p>
        </div>
        <div class="bdt-cleanup__actions">
          ${
            cleanupPhase === 'scanning'
              ? `<button type="button" class="bdt-btn bdt-btn--ghost bdt-btn--sm" data-bdt-cleanup-cancel>
                   ${escapeHtml(t.cleanupCancel)}
                 </button>`
              : `<button type="button" class="bdt-btn bdt-btn--primary bdt-btn--sm" data-bdt-cleanup-scan>
                   <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                   ${escapeHtml(
                     cleanupPhase === 'done' ? t.cleanupRescan : t.cleanupScan,
                   )}
                 </button>`
          }
        </div>
      </div>

      ${renderBody(visible)}
    </div>
  `;

  bindCleanupEvents(root, panel);
}

/**
 * @param {HTMLElement} root
 * @param {number} [count]
 */
export function syncCleanupTabBadge(root, count) {
  const badge = root.querySelector('[data-bdt-cleanup-badge]');
  if (!badge) return;

  const n =
    typeof count === 'number'
      ? count
      : getVisibleGames().length;

  if (cleanupPhase !== 'done' || n <= 0) {
    badge.hidden = true;
    badge.textContent = '0';
    return;
  }

  badge.hidden = false;
  badge.textContent = String(n);
  badge.title = fmt(t.cleanupBadgeTitle, { count: n });
}

/**
 * @returns {MultiLogGame[]}
 */
function getVisibleGames() {
  let list = cleanupGames.filter((g) => !hiddenSlugs.has(g.slug));
  const q = searchQuery.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (g) =>
        g.title.toLowerCase().includes(q) ||
        g.slug.includes(q) ||
        g.logs.some((log) => log.title.toLowerCase().includes(q)),
    );
  }
  if (sortMode === 'title') {
    list = [...list].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    );
  } else {
    list = [...list].sort((a, b) => {
      if (b.logCount !== a.logCount) return b.logCount - a.logCount;
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });
  }
  return list;
}

function renderAuthGate() {
  return `
    <div class="bdt-cleanup">
      <div class="bdt-auth-gate">
        <div class="bdt-auth-gate__icon" aria-hidden="true">
          <i class="fa-solid fa-right-to-bracket"></i>
        </div>
        <h3 class="bdt-auth-gate__title">${escapeHtml(t.cleanupNeedLoginTitle)}</h3>
        <p class="bdt-auth-gate__text">${escapeHtml(t.cleanupNeedLoginBody)}</p>
        <a class="bdt-btn bdt-btn--primary" href="${escapeAttr(backloggdUrl('/users/sign_in'))}">
          ${escapeHtml(t.cleanupNeedLoginCta)}
        </a>
      </div>
    </div>
  `;
}

/**
 * @param {MultiLogGame[]} visible
 */
function renderBody(visible) {
  if (cleanupPhase === 'scanning') {
    return `
      <div class="bdt-progress" data-bdt-cleanup-progress>
        <div class="bdt-progress__head">
          <span class="bdt-progress__spinner" aria-hidden="true"></span>
          <span class="bdt-progress__label" data-bdt-cleanup-progress-label>${escapeHtml(t.cleanupScanningLibrary)}</span>
          <span class="bdt-progress__pct" data-bdt-cleanup-progress-pct>0%</span>
        </div>
        <div class="bdt-progress__track">
          <div class="bdt-progress__fill" data-bdt-cleanup-progress-fill style="width:0%"></div>
        </div>
        <p class="bdt-cleanup__progress-meta" data-bdt-cleanup-progress-meta></p>
      </div>
    `;
  }

  if (cleanupPhase === 'error') {
    return `
      <div class="bdt-cleanup-empty bdt-cleanup-empty--error">
        <div class="bdt-cleanup-empty__icon" aria-hidden="true">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <p class="bdt-cleanup-empty__title">${escapeHtml(t.cleanupErrorTitle)}</p>
        <p class="bdt-cleanup-empty__text">${escapeHtml(lastError || t.cleanupErrorBody)}</p>
        <button type="button" class="bdt-btn bdt-btn--primary bdt-btn--sm" data-bdt-cleanup-scan>
          ${escapeHtml(t.cleanupRetry)}
        </button>
      </div>
    `;
  }

  if (cleanupPhase === 'idle') {
    return `
      <div class="bdt-cleanup-idle">
        <div class="bdt-cleanup-idle__visual" aria-hidden="true">
          <span class="bdt-cleanup-idle__orb"></span>
          <svg class="bdt-cleanup-idle__icon" viewBox="0 0 24 24" width="22" height="22" fill="none">
            <rect x="8" y="8" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="2" />
            <path
              d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </div>
        <div class="bdt-cleanup-idle__copy">
          <p class="bdt-cleanup-idle__title">${escapeHtml(t.cleanupIdleTitle)}</p>
          <p class="bdt-cleanup-idle__text">${escapeHtml(t.cleanupIdleBody)}</p>
        </div>
        <ul class="bdt-cleanup-idle__steps">
          <li>${escapeHtml(t.cleanupIdleStep1)}</li>
          <li>${escapeHtml(t.cleanupIdleStep2)}</li>
          <li>${escapeHtml(t.cleanupIdleStep3)}</li>
        </ul>
      </div>
    `;
  }

  // done
  const hiddenCount = cleanupGames.filter((g) => hiddenSlugs.has(g.slug)).length;
  const stats = lastStats;

  if (!cleanupGames.length) {
    return `
      <div class="bdt-cleanup-empty">
        <div class="bdt-cleanup-empty__icon is-ok" aria-hidden="true">
          <i class="fa-solid fa-check"></i>
        </div>
        <p class="bdt-cleanup-empty__title">${escapeHtml(t.cleanupEmptyTitle)}</p>
        <p class="bdt-cleanup-empty__text">${escapeHtml(
          fmt(t.cleanupEmptyBody, {
            scanned: stats?.scanned ?? 0,
          }),
        )}</p>
      </div>
    `;
  }

  return `
    <div class="bdt-cleanup-toolbar">
      <div class="bdt-cleanup-stats">
        <span class="bdt-cleanup-stat">
          <strong>${escapeHtml(String(cleanupGames.length))}</strong>
          ${escapeHtml(t.cleanupStatMulti)}
        </span>
        <span class="bdt-cleanup-stat bdt-cleanup-stat--muted">
          ${escapeHtml(
            fmt(t.cleanupStatScanned, { count: stats?.scanned ?? 0 }),
          )}
        </span>
        ${
          hiddenCount
            ? `<span class="bdt-cleanup-stat bdt-cleanup-stat--muted">
                 ${escapeHtml(fmt(t.cleanupStatHidden, { count: hiddenCount }))}
               </span>`
            : ''
        }
        ${
          stats?.errors
            ? `<span class="bdt-cleanup-stat bdt-cleanup-stat--warn">
                 ${escapeHtml(fmt(t.cleanupStatErrors, { count: stats.errors }))}
               </span>`
            : ''
        }
      </div>
      <div class="bdt-cleanup-controls">
        <label class="bdt-cleanup-search">
          <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
          <input
            type="search"
            data-bdt-cleanup-search
            placeholder="${escapeAttr(t.cleanupSearchPlaceholder)}"
            value="${escapeAttr(searchQuery)}"
          />
        </label>
        <div class="bdt-cleanup-sort" role="group" aria-label="${escapeAttr(t.cleanupSortLabel)}">
          <button
            type="button"
            class="bdt-cleanup-sort__btn${sortMode === 'count' ? ' is-active' : ''}"
            data-bdt-cleanup-sort="count"
          >${escapeHtml(t.cleanupSortCount)}</button>
          <button
            type="button"
            class="bdt-cleanup-sort__btn${sortMode === 'title' ? ' is-active' : ''}"
            data-bdt-cleanup-sort="title"
          >${escapeHtml(t.cleanupSortTitle)}</button>
        </div>
      </div>
    </div>

    ${
      visible.length
        ? `<div class="bdt-cleanup-list" data-bdt-cleanup-list>
             ${visible.map(renderGameCard).join('')}
           </div>`
        : `<div class="bdt-cleanup-empty bdt-cleanup-empty--compact">
             <p class="bdt-cleanup-empty__title">${escapeHtml(t.cleanupFilteredTitle)}</p>
             <p class="bdt-cleanup-empty__text">${escapeHtml(t.cleanupFilteredBody)}</p>
             ${
               hiddenCount
                 ? `<button type="button" class="bdt-btn bdt-btn--ghost bdt-btn--sm" data-bdt-cleanup-unhide>
                      ${escapeHtml(t.cleanupUnhideAll)}
                    </button>`
                 : ''
             }
           </div>`
    }
  `;
}

/**
 * @param {MultiLogGame} game
 */
function renderGameCard(game) {
  const cover = game.coverUrl
    ? `<img class="bdt-cleanup-card__cover" src="${escapeAttr(game.coverUrl)}" alt="" loading="lazy" decoding="async" />`
    : `<span class="bdt-cleanup-card__cover bdt-cleanup-card__cover--empty" aria-hidden="true"><i class="fa-solid fa-gamepad"></i></span>`;

  const logUrl =
    game.logUrl ||
    (lastUsername && game.slug
      ? backloggdUrl(
          `/u/${encodeURIComponent(lastUsername)}/logs/${encodeURIComponent(game.slug)}/`,
        )
      : game.slug
        ? backloggdUrl(`/games/${encodeURIComponent(game.slug)}/`)
        : '#');

  const logChips = game.logs
    .slice(0, 6)
    .map(
      (log) =>
        `<span class="bdt-cleanup-chip">${escapeHtml(log.title || 'Log')}</span>`,
    )
    .join('');
  const more =
    game.logs.length > 6
      ? `<span class="bdt-cleanup-chip bdt-cleanup-chip--more">${escapeHtml(
          fmt(t.cleanupMoreLogs, { count: game.logs.length - 6 }),
        )}</span>`
      : '';

  return `
    <article class="bdt-cleanup-card" data-bdt-cleanup-slug="${escapeAttr(game.slug)}">
      <a class="bdt-cleanup-card__media" href="${escapeAttr(logUrl)}" target="_blank" rel="noopener noreferrer">
        ${cover}
        <span class="bdt-cleanup-card__count" title="${escapeAttr(
          fmt(t.cleanupLogCountTitle, { count: game.logCount }),
        )}">${escapeHtml(String(game.logCount))}</span>
      </a>
      <div class="bdt-cleanup-card__body">
        <div class="bdt-cleanup-card__top">
          <h4 class="bdt-cleanup-card__title">
            <a href="${escapeAttr(logUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(game.title)}</a>
          </h4>
          <span class="bdt-cleanup-card__badge">${escapeHtml(
            fmt(t.cleanupLogCount, { count: game.logCount }),
          )}</span>
        </div>
        <div class="bdt-cleanup-card__logs">${logChips}${more}</div>
        <div class="bdt-cleanup-card__actions">
          <a
            class="bdt-btn bdt-btn--primary bdt-btn--sm"
            href="${escapeAttr(logUrl)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>
            ${escapeHtml(t.cleanupOpenLogs)}
          </a>
          <button
            type="button"
            class="bdt-btn bdt-btn--ghost bdt-btn--sm"
            data-bdt-cleanup-hide="${escapeAttr(game.slug)}"
          >${escapeHtml(t.cleanupHide)}</button>
        </div>
      </div>
    </article>
  `;
}

/**
 * @param {HTMLElement} root
 * @param {HTMLElement} panel
 */
function bindCleanupEvents(root, panel) {
  panel.querySelector('[data-bdt-cleanup-scan]')?.addEventListener('click', () => {
    void startCleanupScan(root);
  });

  panel.querySelector('[data-bdt-cleanup-cancel]')?.addEventListener('click', () => {
    scanCancelled = true;
  });

  panel.querySelector('[data-bdt-cleanup-unhide]')?.addEventListener('click', () => {
    hiddenSlugs = new Set();
    renderCleanupPanel(root);
  });

  panel.querySelectorAll('[data-bdt-cleanup-sort]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sortMode =
        btn.getAttribute('data-bdt-cleanup-sort') === 'title' ? 'title' : 'count';
      renderCleanupPanel(root);
    });
  });

  const search = panel.querySelector('[data-bdt-cleanup-search]');
  search?.addEventListener('input', () => {
    searchQuery = /** @type {HTMLInputElement} */ (search).value || '';
    const list = panel.querySelector('[data-bdt-cleanup-list]');
    if (!list) {
      renderCleanupPanel(root);
      return;
    }
    // Re-render list area only would be nicer; full re-render keeps focus quirks —
    // keep full render but restore focus/caret.
    const start = /** @type {HTMLInputElement} */ (search).selectionStart;
    renderCleanupPanel(root);
    const next = root.querySelector('[data-bdt-cleanup-search]');
    if (next instanceof HTMLInputElement) {
      next.focus();
      const pos = start == null ? next.value.length : start;
      next.setSelectionRange(pos, pos);
    }
  });

  panel.querySelectorAll('[data-bdt-cleanup-hide]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slug = btn.getAttribute('data-bdt-cleanup-hide');
      if (!slug) return;
      hiddenSlugs.add(slug);
      renderCleanupPanel(root);
      showToast(t.cleanupHiddenToast, {
        type: 'success',
        title: t.cleanupHide,
      });
    });
  });
}

/**
 * @param {HTMLElement} root
 */
async function startCleanupScan(root) {
  if (cleanupPhase === 'scanning') return;
  if (!isLoggedIn()) {
    renderCleanupPanel(root);
    return;
  }

  scanCancelled = false;
  cleanupPhase = 'scanning';
  cleanupGames = [];
  lastStats = null;
  lastError = null;
  lastUsername = getCurrentUsername() || lastUsername;
  searchQuery = '';
  renderCleanupPanel(root);

  try {
    const result = await scanMultiLogGames({
      shouldCancel: () => scanCancelled,
      onProgress: (info) => updateScanProgress(root, info),
    });

    if (scanCancelled) {
      cleanupPhase = cleanupGames.length || result.games.length ? 'done' : 'idle';
      if (result.games.length) {
        cleanupGames = result.games;
        lastStats = {
          scanned: result.scanned,
          skippedNoSlug: result.skippedNoSlug,
          errors: result.errors,
        };
        cleanupPhase = 'done';
      }
      showToast(t.cleanupCancelled, {
        type: 'warning',
        title: t.cleanupCancel,
      });
      renderCleanupPanel(root);
      return;
    }

    cleanupGames = result.games;
    lastStats = {
      scanned: result.scanned,
      skippedNoSlug: result.skippedNoSlug,
      errors: result.errors,
    };
    cleanupPhase = 'done';
    renderCleanupPanel(root);

    showToast(
      cleanupGames.length
        ? fmt(t.cleanupDoneFound, { count: cleanupGames.length })
        : fmt(t.cleanupDoneNone, { scanned: result.scanned }),
      {
        type: cleanupGames.length ? 'warning' : 'success',
        title: t.cleanupTitle,
      },
    );
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    cleanupPhase = 'error';
    renderCleanupPanel(root);
    showToast(lastError, {
      type: 'error',
      title: t.cleanupErrorTitle,
    });
  }
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   phase: 'library' | 'probe',
 *   listIndex?: number,
 *   listTotal?: number,
 *   page?: number,
 *   list?: string,
 *   index?: number,
 *   total?: number,
 *   title?: string,
 *   multiFound?: number,
 * }} info
 */
function updateScanProgress(root, info) {
  const label = root.querySelector('[data-bdt-cleanup-progress-label]');
  const pctEl = root.querySelector('[data-bdt-cleanup-progress-pct]');
  const fill = root.querySelector('[data-bdt-cleanup-progress-fill]');
  const meta = root.querySelector('[data-bdt-cleanup-progress-meta]');
  if (!label || !pctEl || !fill) return;

  let pct = 0;
  let labelText = t.cleanupScanningLibrary;
  let metaText = '';

  if (info.phase === 'library') {
    const listTotal = Math.max(1, info.listTotal || 1);
    const listIndex = info.listIndex || 0;
    pct = Math.min(28, Math.round(((listIndex + 0.35) / listTotal) * 28));
    labelText = fmt(t.cleanupScanningShelf, {
      list: info.list || '',
      page: info.page || 1,
    });
    metaText = fmt(t.cleanupScanningShelfMeta, {
      index: listIndex + 1,
      total: listTotal,
    });
  } else {
    const total = Math.max(1, info.total || 1);
    const index = info.index || 0;
    pct = 28 + Math.round(((index + 1) / total) * 72);
    labelText = fmt(t.cleanupScanningGame, {
      title: info.title || '',
      index: index + 1,
      total,
    });
    metaText = fmt(t.cleanupScanningGameMeta, {
      found: info.multiFound || 0,
    });
  }

  label.textContent = labelText;
  pctEl.textContent = `${pct}%`;
  /** @type {HTMLElement} */ (fill).style.width = `${pct}%`;
  if (meta) meta.textContent = metaText;
}
