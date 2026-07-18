import { backloggdUrl } from '../destinations/backloggd/site.js';
import { fmt } from '../i18n/index.js';
import { t } from '../state.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
import {
  clearHistory,
  loadHistory,
  removeHistoryEntry,
} from '../history/store.js';

/** @type {'all' | 'import' | 'export'} */
let historyFilter = 'all';

/**
 * Render the History tab contents and bind interactions.
 * @param {HTMLElement} root
 */
export function renderHistoryPanel(root) {
  const panel = root.querySelector('[data-bdt-panel="history"]');
  if (!panel) return;

  const entries = loadHistory();
  syncHistoryTabBadge(root, entries.length);
  const filtered =
    historyFilter === 'all'
      ? entries
      : entries.filter((entry) => entry.kind === historyFilter);

  const importCount = entries.filter((e) => e.kind === 'import').length;
  const exportCount = entries.filter((e) => e.kind === 'export').length;

  panel.innerHTML = `
    <div class="bdt-history">
      <div class="bdt-history__head">
        <div>
          <h3 class="bdt-history__title">${escapeHtml(t.historyTitle)}</h3>
          <p class="bdt-history__lead">${escapeHtml(t.historyLead)}</p>
        </div>
        <button
          type="button"
          class="bdt-btn bdt-btn--ghost bdt-btn--sm"
          data-bdt-history-clear
          ${entries.length ? '' : 'disabled'}
        >${escapeHtml(t.historyClear)}</button>
      </div>

      <div class="bdt-history__filters" role="tablist" aria-label="${escapeAttr(t.historyFilterLabel)}">
        ${filterChip('all', t.historyFilterAll, entries.length)}
        ${filterChip('import', t.historyFilterImport, importCount)}
        ${filterChip('export', t.historyFilterExport, exportCount)}
      </div>

      ${
        filtered.length
          ? `<div class="bdt-history__list" data-bdt-history-list>
              ${filtered.map((entry) => renderHistoryCard(entry)).join('')}
            </div>`
          : renderEmptyState(entries.length > 0)
      }
    </div>
  `;

  panel.querySelectorAll('[data-bdt-history-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      historyFilter =
        /** @type {'all' | 'import' | 'export'} */ (
          btn.getAttribute('data-bdt-history-filter')
        ) || 'all';
      renderHistoryPanel(root);
    });
  });

  panel.querySelector('[data-bdt-history-clear]')?.addEventListener('click', () => {
    if (!entries.length) return;
    if (!window.confirm(t.historyClearConfirm)) return;
    clearHistory();
    renderHistoryPanel(root);
  });

  panel.querySelectorAll('[data-bdt-history-remove]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = btn.getAttribute('data-bdt-history-remove');
      if (!id) return;
      removeHistoryEntry(id);
      renderHistoryPanel(root);
    });
  });
}

/**
 * @param {'all' | 'import' | 'export'} id
 * @param {string} label
 * @param {number} count
 */
function filterChip(id, label, count) {
  const active = historyFilter === id;
  return `
    <button
      type="button"
      class="bdt-history__chip${active ? ' is-active' : ''}"
      data-bdt-history-filter="${escapeAttr(id)}"
      role="tab"
      aria-selected="${active ? 'true' : 'false'}"
    >
      <span>${escapeHtml(label)}</span>
      <span class="bdt-history__chip-count">${escapeHtml(String(count))}</span>
    </button>
  `;
}

/**
 * @param {boolean} filteredOut
 */
function renderEmptyState(filteredOut) {
  return `
    <div class="bdt-history__empty">
      <div class="bdt-history__empty-icon" aria-hidden="true">
        <i class="fa-solid fa-clock-rotate-left"></i>
      </div>
      <p class="bdt-history__empty-title">${escapeHtml(
        filteredOut ? t.historyEmptyFilteredTitle : t.historyEmptyTitle,
      )}</p>
      <p class="bdt-history__empty-text">${escapeHtml(
        filteredOut ? t.historyEmptyFilteredBody : t.historyEmptyBody,
      )}</p>
    </div>
  `;
}

/**
 * @param {import('../history/store.js').HistoryEntry} entry
 */
function renderHistoryCard(entry) {
  const kindLabel = entry.kind === 'export' ? t.historyKindExport : t.historyKindImport;
  const statusLabel =
    entry.status === 'success'
      ? t.historyStatusSuccess
      : entry.status === 'partial'
        ? t.historyStatusPartial
        : t.historyStatusFailed;
  const when = formatHistoryWhen(entry.at);
  const preview = entry.games.slice(0, 4).map((g) => g.title);
  const more = Math.max(0, entry.games.length - preview.length);

  return `
    <details class="bdt-history-card" data-bdt-history-id="${escapeAttr(entry.id)}">
      <summary class="bdt-history-card__summary">
        <span class="bdt-history-card__kind bdt-history-card__kind--${escapeAttr(entry.kind)}" aria-hidden="true">
          ${historyKindSvg(entry.kind)}
        </span>
        <span class="bdt-history-card__main">
          <span class="bdt-history-card__top">
            <span class="bdt-history-card__file" title="${escapeAttr(entry.filename)}">${escapeHtml(entry.filename)}</span>
            <span class="bdt-history-card__status bdt-history-card__status--${escapeAttr(entry.status)}">${escapeHtml(statusLabel)}</span>
          </span>
          <span class="bdt-history-card__meta">
            <span>${escapeHtml(kindLabel)}</span>
            <span aria-hidden="true">·</span>
            <time datetime="${escapeAttr(entry.at)}" title="${escapeAttr(when.absolute)}">${escapeHtml(when.relative)}</time>
            <span aria-hidden="true">·</span>
            <span>${escapeHtml(fmt(t.historyCounts, { ok: entry.okCount, fail: entry.failCount, total: entry.total }))}</span>
          </span>
          ${
            preview.length
              ? `<span class="bdt-history-card__preview">${escapeHtml(
                  preview.join(', ') + (more ? fmt(t.historyMoreGames, { count: more }) : ''),
                )}</span>`
              : ''
          }
        </span>
        <span class="bdt-history-card__chevron" aria-hidden="true">
          <i class="fa-solid fa-chevron-down"></i>
        </span>
      </summary>
      <div class="bdt-history-card__body">
        <dl class="bdt-history-card__facts">
          <div><dt>${escapeHtml(t.historyFactWhen)}</dt><dd>${escapeHtml(when.absolute)}</dd></div>
          <div><dt>${escapeHtml(t.historyFactSource)}</dt><dd>${escapeHtml(entry.source)}</dd></div>
          <div><dt>${escapeHtml(t.historyFactVersion)}</dt><dd>${escapeHtml(
            entry.formatVersion != null ? `v${entry.formatVersion}` : '—',
          )}</dd></div>
          ${
            entry.username
              ? `<div><dt>${escapeHtml(t.historyFactUser)}</dt><dd>${escapeHtml(entry.username)}</dd></div>`
              : ''
          }
        </dl>
        ${
          entry.games.length
            ? `<div class="bdt-history-games">
                <div class="bdt-history-games__head">
                  <span>${escapeHtml(fmt(t.historyGamesTitle, { count: entry.games.length }))}</span>
                </div>
                <ul class="bdt-history-games__list">
                  ${entry.games.map((game) => renderHistoryGame(game)).join('')}
                </ul>
              </div>`
            : `<p class="bdt-muted">${escapeHtml(t.historyNoGames)}</p>`
        }
        <div class="bdt-history-card__actions">
          <button
            type="button"
            class="bdt-btn bdt-btn--ghost bdt-btn--sm"
            data-bdt-history-remove="${escapeAttr(entry.id)}"
          >${escapeHtml(t.historyRemove)}</button>
        </div>
      </div>
    </details>
  `;
}

/**
 * @param {import('../history/store.js').HistoryGame} game
 */
function renderHistoryGame(game) {
  const href = game.slug
    ? backloggdUrl(`/games/${encodeURIComponent(game.slug)}/`)
    : '';
  const titleHtml = href
    ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(game.title)}</a>`
    : escapeHtml(game.title);

  return `
    <li class="bdt-history-game ${game.ok ? 'is-ok' : 'is-fail'}">
      <span class="bdt-history-game__icon" aria-hidden="true">
        <i class="fa-solid ${game.ok ? 'fa-check' : 'fa-xmark'}"></i>
      </span>
      <span class="bdt-history-game__body">
        <span class="bdt-history-game__title">${titleHtml}</span>
        <span class="bdt-history-game__meta">
          ${
            game.game_id != null
              ? `<span>ID ${escapeHtml(String(game.game_id))}</span>`
              : ''
          }
          ${
            !game.ok && game.error
              ? `<span class="bdt-history-game__error">${escapeHtml(game.error)}</span>`
              : ''
          }
        </span>
      </span>
    </li>
  `;
}

/**
 * Inline SVG so icons don't depend on Backloggd's Font Awesome kit.
 * @param {'import' | 'export'} kind
 */
function historyKindSvg(kind) {
  if (kind === 'export') {
    return `
      <svg class="bdt-history-card__svg" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
        <path d="M12 3v11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M7.5 8.5 12 4l4.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>
    `;
  }

  return `
    <svg class="bdt-history-card__svg" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
      <path d="M12 4v11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M7.5 11.5 12 16l4.5-4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
  `;
}

/**
 * @param {string} iso
 * @returns {{ relative: string, absolute: string }}
 */
function formatHistoryWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { relative: iso || '—', absolute: iso || '—' };
  }

  const absolute = date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const diffMs = Date.now() - date.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let relative;
  if (diffMs < minute) relative = t.historyJustNow;
  else if (diffMs < hour) {
    relative = fmt(t.historyMinutesAgo, { count: Math.max(1, Math.floor(diffMs / minute)) });
  } else if (diffMs < day) {
    relative = fmt(t.historyHoursAgo, { count: Math.max(1, Math.floor(diffMs / hour)) });
  } else if (diffMs < 7 * day) {
    relative = fmt(t.historyDaysAgo, { count: Math.max(1, Math.floor(diffMs / day)) });
  } else {
    relative = absolute;
  }

  return { relative, absolute };
}

/**
 * Update the History tab badge count.
 * @param {HTMLElement} root
 * @param {number} [count]
 */
export function syncHistoryTabBadge(root, count) {
  const badge = root.querySelector('[data-bdt-history-badge]');
  if (!badge) return;

  const total = Number.isFinite(count) ? count : loadHistory().length;
  badge.textContent = String(total);
  badge.hidden = total <= 0;
}
