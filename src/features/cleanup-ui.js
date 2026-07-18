import { backloggdUrl } from '../destinations/backloggd/site.js';
import { scanMultiLogGames } from '../destinations/backloggd/multi-logs.js';
import { isLoggedIn } from '../destinations/backloggd/auth.js';
import { getCurrentUsername } from '../destinations/backloggd/user.js';
import { fmt } from '../i18n/index.js';
import { settings, t } from '../state.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
import { showToast } from './toast.js';

/** @typedef {import('../destinations/backloggd/multi-logs.js').MultiLogGame} MultiLogGame */
/** @typedef {import('../destinations/backloggd/multi-logs.js').MultiLogEntry} MultiLogEntry */

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
/** @type {string | null} */
let expandedSlug = null;

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
        <div class="bdt-progress__active" data-bdt-cleanup-progress-active hidden></div>
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
  const open = expandedSlug === game.slug;
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
    <article
      class="bdt-cleanup-card${open ? ' is-open' : ''}"
      data-bdt-cleanup-slug="${escapeAttr(game.slug)}"
      data-bdt-cleanup-card
    >
      <div class="bdt-cleanup-card__main" data-bdt-cleanup-toggle>
        <div class="bdt-cleanup-card__media" aria-hidden="true">
          ${cover}
          <span class="bdt-cleanup-card__count" title="${escapeAttr(
            fmt(t.cleanupLogCountTitle, { count: game.logCount }),
          )}">${escapeHtml(String(game.logCount))}</span>
        </div>
        <div class="bdt-cleanup-card__body">
          <div class="bdt-cleanup-card__top">
            <h4 class="bdt-cleanup-card__title">${escapeHtml(game.title)}</h4>
            <span class="bdt-cleanup-card__badge">${escapeHtml(
              fmt(t.cleanupLogCount, { count: game.logCount }),
            )}</span>
          </div>
          ${
            game.gameStatus
              ? `<p class="bdt-cleanup-card__status">${escapeHtml(
                  fmt(t.cleanupGameStatus, { status: game.gameStatus }),
                )}</p>`
              : ''
          }
          <div class="bdt-cleanup-card__logs">${logChips}${more}</div>
          <div class="bdt-cleanup-card__actions">
            <button
              type="button"
              class="bdt-btn bdt-btn--primary bdt-btn--sm"
              data-bdt-cleanup-toggle-btn
              aria-expanded="${open ? 'true' : 'false'}"
            >
              ${escapeHtml(open ? t.cleanupCollapse : t.cleanupExpand)}
            </button>
            <a
              class="bdt-btn bdt-btn--ghost bdt-btn--sm"
              href="${escapeAttr(logUrl)}"
              target="_blank"
              rel="noopener noreferrer"
              data-bdt-cleanup-stop
            >
              <svg class="bdt-btn__icon" viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
                <path
                  d="M14 4h6v6M10 14L20 4M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              ${escapeHtml(t.cleanupOpenLogs)}
            </a>
            <button
              type="button"
              class="bdt-btn bdt-btn--ghost bdt-btn--sm"
              data-bdt-cleanup-hide="${escapeAttr(game.slug)}"
              data-bdt-cleanup-stop
            >${escapeHtml(t.cleanupHide)}</button>
          </div>
        </div>
        <span class="bdt-cleanup-card__chevron" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </div>
      <div class="bdt-cleanup-card__drawer" ${open ? '' : 'hidden'}>
        <div class="bdt-cleanup-drawer__head">
          <p class="bdt-cleanup-drawer__title">${escapeHtml(
            fmt(t.cleanupDrawerTitle, { count: game.logs.length }),
          )}</p>
          <p class="bdt-cleanup-drawer__hint">${escapeHtml(t.cleanupDrawerHint)}</p>
        </div>
        <div class="bdt-cleanup-loglist">
          ${game.logs.map((log, index) => renderLogRow(log, index)).join('')}
        </div>
      </div>
    </article>
  `;
}

/**
 * @param {MultiLogEntry} log
 * @param {number} index
 */
function renderLogRow(log, index) {
  const meta = [];
  if (log.rating != null) {
    meta.push(fmt(t.cleanupLogRating, { rating: formatRating(log.rating) }));
  }
  if (log.platform) meta.push(log.platform);
  if (log.datesLabel) meta.push(log.datesLabel);
  else if (log.startDate || log.finishDate) {
    meta.push([log.startDate, log.finishDate].filter(Boolean).join(' → '));
  }

  return `
    <div class="bdt-cleanup-log">
      <div class="bdt-cleanup-log__main">
        <div class="bdt-cleanup-log__index">${escapeHtml(String(index + 1))}</div>
        <div class="bdt-cleanup-log__body">
          <p class="bdt-cleanup-log__title">${escapeHtml(log.title || 'Log')}</p>
          ${
            meta.length
              ? `<p class="bdt-cleanup-log__meta">${escapeHtml(meta.join(' · '))}</p>`
              : `<p class="bdt-cleanup-log__meta">${escapeHtml(t.cleanupLogNoMeta)}</p>`
          }
          ${
            (log.badges || []).length
              ? `<div class="bdt-cleanup-log__badges">${log.badges
                  .map(
                    (b) =>
                      `<span class="bdt-cleanup-chip">${escapeHtml(b)}</span>`,
                  )
                  .join('')}</div>`
              : ''
          }
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {number} rating
 */
function formatRating(rating) {
  const n = Number(rating);
  if (!Number.isFinite(n)) return String(rating);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
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
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const slug = btn.getAttribute('data-bdt-cleanup-hide');
      if (!slug) return;
      hiddenSlugs.add(slug);
      if (expandedSlug === slug) expandedSlug = null;
      renderCleanupPanel(root);
      showToast(t.cleanupHiddenToast, {
        type: 'success',
        title: t.cleanupHide,
      });
    });
  });

  panel.querySelectorAll('[data-bdt-cleanup-card]').forEach((card) => {
    const slug = card.getAttribute('data-bdt-cleanup-slug');
    if (!slug) return;

    card
      .querySelector('[data-bdt-cleanup-toggle]')
      ?.addEventListener('click', (event) => {
        const target = /** @type {HTMLElement} */ (event.target);
        if (target.closest('[data-bdt-cleanup-stop]')) return;
        event.preventDefault();
        expandedSlug = expandedSlug === slug ? null : slug;
        renderCleanupPanel(root);
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
  expandedSlug = null;
  renderCleanupPanel(root);

  try {
    const result = await scanMultiLogGames({
      concurrency: settings.matchConcurrency,
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
 *   pagesDone?: number,
 *   index?: number,
 *   total?: number,
 *   done?: number,
 *   title?: string,
 *   multiFound?: number,
 *   concurrency?: number,
 *   activeTitles?: string[],
 *   activeLists?: string[],
 * }} info
 */
function updateScanProgress(root, info) {
  const label = root.querySelector('[data-bdt-cleanup-progress-label]');
  const pctEl = root.querySelector('[data-bdt-cleanup-progress-pct]');
  const fill = root.querySelector('[data-bdt-cleanup-progress-fill]');
  const meta = root.querySelector('[data-bdt-cleanup-progress-meta]');
  const activeEl = root.querySelector('[data-bdt-cleanup-progress-active]');
  if (!label || !pctEl || !fill) return;

  let pct = 0;
  let labelText = t.cleanupScanningLibrary;
  let metaText = '';
  const concurrency = Math.max(0, Number(info.concurrency) || 0);
  /** @type {string[]} */
  const chips = [];

  if (info.phase === 'library') {
    const listTotal = Math.max(1, info.listTotal || 1);
    const pagesDone = Number(info.pagesDone) || 0;
    const active = Array.isArray(info.activeLists) ? info.activeLists.length : 0;
    const listIndex = info.listIndex || 0;
    if (pagesDone > 0 || active > 0) {
      pct = Math.min(
        28,
        Math.round(
          ((pagesDone + 0.35) / Math.max(pagesDone + active + 1, listTotal)) * 28,
        ),
      );
    } else {
      pct = Math.min(28, Math.round(((listIndex + 0.35) / listTotal) * 28));
    }
    labelText =
      concurrency > 1
        ? fmt(t.cleanupScanningLibraryParallel, {
            done: pagesDone,
            active: Math.min(concurrency, active || concurrency),
          })
        : fmt(t.cleanupScanningShelf, {
            list: info.list || '',
            page: info.page || 1,
          });
    metaText = fmt(t.cleanupScanningShelfMeta, {
      index: listIndex + 1,
      total: listTotal,
    });
    if (Array.isArray(info.activeLists)) chips.push(...info.activeLists);
  } else {
    const total = Math.max(1, info.total || 1);
    const done = Number.isFinite(info.done) ? Number(info.done) : (info.index || 0) + 1;
    pct = 28 + Math.round((done / total) * 72);
    labelText =
      concurrency > 1
        ? fmt(t.cleanupScanningGameParallel, {
            current: done,
            total,
            active: Math.min(
              concurrency,
              Array.isArray(info.activeTitles) ? info.activeTitles.length : concurrency,
            ),
          })
        : fmt(t.cleanupScanningGame, {
            title: info.title || '',
            index: done,
            total,
          });
    metaText = fmt(t.cleanupScanningGameMeta, {
      found: info.multiFound || 0,
    });
    if (Array.isArray(info.activeTitles)) chips.push(...info.activeTitles);
  }

  label.textContent = labelText;
  pctEl.textContent = `${pct}%`;
  /** @type {HTMLElement} */ (fill).style.width = `${pct}%`;
  if (meta) meta.textContent = metaText;

  if (activeEl) {
    if (chips.length) {
      activeEl.hidden = false;
      activeEl.innerHTML = chips
        .slice(0, 6)
        .map(
          (title) =>
            `<span class="bdt-progress__chip" title="${escapeAttr(title)}">${escapeHtml(title)}</span>`,
        )
        .join('');
    } else {
      activeEl.hidden = true;
      activeEl.innerHTML = '';
    }
  }
}
