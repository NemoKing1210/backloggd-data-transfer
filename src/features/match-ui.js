import { statusDisplayLabel } from '../format/analyze.js';
import { platformByIdOrName } from '../format/platforms.js';
import { entryDisplayTitle, primaryPlaythrough } from '../format/schema.js';
import { backloggdUrl } from '../destinations/backloggd/site.js';
import { fmt } from '../i18n/index.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
import { settings, t } from '../state.js';

/**
 * @param {HTMLElement} root
 * @param {import('../destinations/backloggd/match.js').EntryMatchResult[]} results
 * @param {{
 *   importExisting?: boolean,
 *   onSelectionChange?: (selected: number) => void,
 *   onImportExistingChange?: (enabled: boolean) => void,
 *   onManualGameId?: (index: number, raw: string) => void | Promise<void>,
 * }} [options]
 */
export function renderMatchTable(root, results, options = {}) {
  const wrap = root.querySelector('[data-bdt-match-table]');
  if (!wrap) return;

  if (!results.length) {
    wrap.hidden = true;
    wrap.innerHTML = '';
    return;
  }

  const importExisting = options.importExisting === true;
  const prevSearch =
    /** @type {HTMLInputElement | null} */ (
      wrap.querySelector('[data-bdt-match-search]')
    )?.value || '';

  const rows = results
    .map((row) => {
      const entry = row.entry;
      const pt = primaryPlaythrough(entry);
      const title = entryDisplayTitle(entry);
      const matchedTitle = row.match?.title || '—';
      const gameId = row.match?.id ?? entry.game_id ?? '';
      const year = row.match?.year || '—';
      const link = row.match?.url
        ? `<a href="${escapeAttr(row.match.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(matchedTitle)}</a>`
        : escapeHtml(matchedTitle);
      const importable = row.status === 'found' || row.status === 'preset';
      const needsManualId =
        row.status === 'not_found' || row.status === 'error';
      const checked = importable && (row.existingLog ? importExisting : true);
      const existingLabel = row.existingLog
        ? t.importMatchExistingYes
        : t.importMatchExistingNo;
      const platformLabel =
        platformByIdOrName(pt.platform)?.name || '—';
      const idCell = needsManualId
        ? `<div class="bdt-match-id-edit">
            <input
              type="text"
              inputmode="numeric"
              class="bdt-match-id-input"
              data-bdt-match-manual-id
              data-index="${row.index}"
              placeholder="${escapeAttr(t.importMatchManualIdPlaceholder)}"
              aria-label="${escapeAttr(fmt(t.importMatchManualIdAria, { title }))}"
              title="${escapeAttr(t.importMatchManualIdHint)}"
            />
            <span class="bdt-match-id-status" data-bdt-match-id-status hidden></span>
          </div>`
        : escapeHtml(gameId === '' ? '—' : String(gameId));

      return `
        <tr
          class="bdt-match-row bdt-match-row--${escapeAttr(row.status)}${row.existingLog ? ' bdt-match-row--existing' : ''}${importable ? '' : ' bdt-match-row--blocked'}"
          data-bdt-match-index="${row.index}"
          data-existing="${row.existingLog ? '1' : '0'}"
          data-importable="${importable ? '1' : '0'}"
          data-status="${escapeAttr(row.status)}"
          data-source="${row.fromCache ? 'cache' : 'live'}"
          data-title="${escapeAttr(title.toLowerCase())}"
          data-site-title="${escapeAttr(String(matchedTitle).toLowerCase())}"
        >
          <td class="bdt-match-col-check">
            <input
              type="checkbox"
              class="bdt-match-check"
              data-bdt-match-select
              value="${row.index}"
              ${checked ? 'checked' : ''}
              ${importable ? '' : 'disabled'}
              title="${escapeAttr(importable ? '' : t.importMatchBlockedHint)}"
              aria-label="${escapeAttr(fmt(t.importMatchSelectRow, { title }))}"
            />
          </td>
          <td class="bdt-match-col-num">${row.index + 1}</td>
          <td class="bdt-match-col-title">${escapeHtml(title)}</td>
          <td>${escapeHtml(statusDisplayLabel(entry.log?.status, t.importStatNoStatus))}</td>
          <td>${escapeHtml(pt.start_date || '—')}</td>
          <td>${escapeHtml(pt.finish_date || '—')}</td>
          <td>${pt.rating == null ? '—' : escapeHtml(String(pt.rating))}</td>
          <td>${escapeHtml(platformLabel)}</td>
          <td><span class="bdt-match-pill bdt-match-pill--${escapeAttr(row.status)}">${escapeHtml(matchStatusLabel(row.status))}</span></td>
          <td>
            <span class="bdt-match-pill bdt-match-pill--${row.fromCache ? 'cached' : 'live'}">${escapeHtml(
              row.fromCache ? t.importMatchCached : t.importMatchLive,
            )}</span>
          </td>
          <td>
            <span class="bdt-match-pill bdt-match-pill--${row.existingLog ? 'existing' : 'new'}">${escapeHtml(existingLabel)}</span>
          </td>
          <td class="bdt-match-col-site">${link}</td>
          <td class="bdt-match-col-id">${idCell}</td>
          <td>${escapeHtml(year)}</td>
        </tr>
      `;
    })
    .join('');

  wrap.innerHTML = `
    <div class="bdt-match-head">
      <div class="bdt-match-head__titles">
        <h3 class="bdt-summary__title">${escapeHtml(t.importMatchTableTitle)}</h3>
        <p class="bdt-match-selected" data-bdt-match-selected></p>
      </div>
      <label class="bdt-toggle">
        <input type="checkbox" data-bdt-import-existing ${importExisting ? 'checked' : ''} />
        <span class="bdt-toggle__track" aria-hidden="true"></span>
        <span class="bdt-toggle__label">${escapeHtml(t.importExistingToggle)}</span>
      </label>
    </div>
    <div class="bdt-match-filters" role="group" aria-label="${escapeAttr(t.importMatchFiltersLabel)}">
      <label class="bdt-match-search">
        <i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input
          type="search"
          data-bdt-match-search
          placeholder="${escapeAttr(t.importMatchSearchPlaceholder)}"
          aria-label="${escapeAttr(t.importMatchSearchPlaceholder)}"
          value="${escapeAttr(prevSearch)}"
        />
      </label>
      ${filterSelect(
        'existing',
        t.importMatchFilterExisting,
        [
          ['all', t.importMatchFilterAll],
          ['yes', t.importMatchExistingYes],
          ['no', t.importMatchExistingNo],
        ],
      )}
      ${filterSelect(
        'status',
        t.importMatchFilterStatus,
        [
          ['all', t.importMatchFilterAll],
          ['found', t.importMatchFound],
          ['preset', t.importMatchPreset],
          ['not_found', t.importMatchNotFound],
          ['error', t.importMatchError],
        ],
      )}
      ${filterSelect(
        'source',
        t.importMatchFilterSource,
        [
          ['all', t.importMatchFilterAll],
          ['cache', t.importMatchCached],
          ['live', t.importMatchLive],
        ],
      )}
      ${filterSelect(
        'selected',
        t.importMatchFilterSelected,
        [
          ['all', t.importMatchFilterAll],
          ['on', t.importMatchFilterSelectedOn],
          ['off', t.importMatchFilterSelectedOff],
        ],
      )}
    </div>
    <div class="bdt-match-scroll">
      <table class="bdt-match-table">
        <thead>
          <tr>
            <th class="bdt-match-col-check">
              <input
                type="checkbox"
                class="bdt-match-check"
                data-bdt-match-select-all
                aria-label="${escapeAttr(t.importMatchSelectAll)}"
                title="${escapeAttr(t.importMatchSelectAll)}"
              />
            </th>
            <th>#</th>
            <th>${escapeHtml(t.importMatchColFileTitle)}</th>
            <th>${escapeHtml(t.importMatchColStatus)}</th>
            <th>${escapeHtml(t.importMatchColStart)}</th>
            <th>${escapeHtml(t.importMatchColEnd)}</th>
            <th>${escapeHtml(t.importMatchColRating)}</th>
            <th>${escapeHtml(t.importMatchColPlatform)}</th>
            <th>${escapeHtml(t.importMatchColResult)}</th>
            <th>${escapeHtml(t.importMatchColSource)}</th>
            <th>${escapeHtml(t.importMatchColExisting)}</th>
            <th>${escapeHtml(t.importMatchColSiteTitle)}</th>
            <th>${escapeHtml(t.importMatchColGameId)}</th>
            <th>${escapeHtml(t.importMatchColYear)}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
  wrap.hidden = false;
  bindMatchSelection(wrap, options);
  bindManualGameId(wrap, options);
  applyMatchFilters(wrap);
  syncMatchSelectionUi(wrap, options.onSelectionChange);
}

/**
 * @param {'existing' | 'status' | 'source' | 'selected'} key
 * @param {string} label
 * @param {[string, string][]} options
 */
function filterSelect(key, label, options) {
  const opts = options
    .map(
      ([value, text]) =>
        `<option value="${escapeAttr(value)}">${escapeHtml(text)}</option>`,
    )
    .join('');
  return `
    <label class="bdt-match-filter">
      <span class="bdt-match-filter__label">${escapeHtml(label)}</span>
      <select class="bdt-match-filter__select" data-bdt-match-filter="${escapeAttr(key)}">
        ${opts}
      </select>
    </label>
  `;
}

/**
 * @param {HTMLElement} root
 * @returns {number[]}
 */
export function getSelectedMatchIndices(root) {
  return [...root.querySelectorAll('[data-bdt-match-select]:checked')]
    .filter((el) => {
      const row = el.closest('tr');
      return row?.getAttribute('data-importable') !== '0';
    })
    .map((el) => Number(/** @type {HTMLInputElement} */ (el).value));
}

/**
 * @param {HTMLElement} wrap
 * @param {{
 *   onManualGameId?: (index: number, raw: string) => void | Promise<void>,
 * }} options
 */
function bindManualGameId(wrap, options) {
  if (!options.onManualGameId) return;

  /** @type {Map<HTMLInputElement, ReturnType<typeof setTimeout>>} */
  const timers = new Map();

  const commit = async (input) => {
    const raw = String(input.value || '').trim();
    if (!raw) return;
    if (input.dataset.bdtCommitted === raw || input.disabled) return;
    const index = Number(input.getAttribute('data-index'));
    if (!Number.isFinite(index)) return;

    input.dataset.bdtCommitted = raw;
    const statusEl = input
      .closest('.bdt-match-id-edit')
      ?.querySelector('[data-bdt-match-id-status]');
    input.disabled = true;
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = t.importMatchManualIdLoading;
      statusEl.classList.remove('bdt-match-id-status--error');
    }

    try {
      await options.onManualGameId?.(index, raw);
    } catch (err) {
      delete input.dataset.bdtCommitted;
      input.disabled = false;
      if (statusEl) {
        statusEl.hidden = false;
        statusEl.textContent =
          err instanceof Error ? err.message : String(err);
        statusEl.classList.add('bdt-match-id-status--error');
      }
    }
  };

  wrap.addEventListener('keydown', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('[data-bdt-match-manual-id]')) return;
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const timer = timers.get(target);
    if (timer) clearTimeout(timer);
    void commit(target);
  });

  wrap.addEventListener('focusout', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('[data-bdt-match-manual-id]')) return;
    const timer = timers.get(target);
    if (timer) clearTimeout(timer);
    void commit(target);
  });

  wrap.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('[data-bdt-match-manual-id]')) return;
    const prev = timers.get(target);
    if (prev) clearTimeout(prev);
    const raw = String(target.value || '').trim();
    // Auto-commit once a full numeric id (or URL) looks complete.
    const ready =
      /^\d{3,}$/.test(raw) || /\/games\/[^/?#]+/i.test(raw) || /^https?:\/\//i.test(raw);
    if (!ready) return;
    timers.set(
      target,
      setTimeout(() => {
        timers.delete(target);
        void commit(target);
      }, 550),
    );
  });
}

/**
 * @param {HTMLElement} wrap
 * @param {{
 *   onSelectionChange?: (selected: number) => void,
 *   onImportExistingChange?: (enabled: boolean) => void,
 * }} options
 */
function bindMatchSelection(wrap, options) {
  const selectAll = /** @type {HTMLInputElement | null} */ (
    wrap.querySelector('[data-bdt-match-select-all]')
  );
  const existingToggle = /** @type {HTMLInputElement | null} */ (
    wrap.querySelector('[data-bdt-import-existing]')
  );

  const rowChecks = () =>
    [...wrap.querySelectorAll('[data-bdt-match-select]')].map(
      (el) => /** @type {HTMLInputElement} */ (el),
    );

  const isExistingRow = (box) =>
    box.closest('tr')?.getAttribute('data-existing') === '1';

  const isImportableRow = (box) =>
    box.closest('tr')?.getAttribute('data-importable') !== '0';

  const isVisibleRow = (box) => {
    const row = box.closest('tr');
    return Boolean(row) && !row.hidden;
  };

  const importExistingEnabled = () => Boolean(existingToggle?.checked);

  selectAll?.addEventListener('change', () => {
    const checked = Boolean(selectAll.checked);
    const allowExisting = importExistingEnabled();
    for (const box of rowChecks()) {
      if (!isVisibleRow(box)) continue;
      if (!isImportableRow(box) || box.disabled) {
        box.checked = false;
        continue;
      }
      if (checked && isExistingRow(box) && !allowExisting) {
        box.checked = false;
        continue;
      }
      box.checked = checked;
    }
    applyMatchFilters(wrap);
    syncMatchSelectionUi(wrap, options.onSelectionChange);
  });

  existingToggle?.addEventListener('change', () => {
    const enabled = Boolean(existingToggle.checked);
    options.onImportExistingChange?.(enabled);
    for (const box of rowChecks()) {
      if (!isExistingRow(box)) continue;
      box.checked = enabled;
    }
    applyMatchFilters(wrap);
    syncMatchSelectionUi(wrap, options.onSelectionChange);
  });

  wrap.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
      return;
    }
    if (target.matches('[data-bdt-match-filter]')) {
      applyMatchFilters(wrap);
      syncMatchSelectionUi(wrap, options.onSelectionChange);
      return;
    }
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('[data-bdt-match-select]')) return;
    applyMatchFilters(wrap);
    syncMatchSelectionUi(wrap, options.onSelectionChange);
  });

  wrap.addEventListener('input', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('[data-bdt-match-search]')) return;
    applyMatchFilters(wrap);
    syncMatchSelectionUi(wrap, options.onSelectionChange);
  });
}

/**
 * @param {HTMLElement} wrap
 */
function applyMatchFilters(wrap) {
  const existing = filterValue(wrap, 'existing');
  const status = filterValue(wrap, 'status');
  const source = filterValue(wrap, 'source');
  const selected = filterValue(wrap, 'selected');
  const query = searchQuery(wrap);

  for (const row of wrap.querySelectorAll('tbody tr')) {
    const el = /** @type {HTMLTableRowElement} */ (row);
    const box = /** @type {HTMLInputElement | null} */ (
      el.querySelector('[data-bdt-match-select]')
    );
    const matchExisting =
      existing === 'all' ||
      (existing === 'yes' && el.getAttribute('data-existing') === '1') ||
      (existing === 'no' && el.getAttribute('data-existing') !== '1');
    const matchStatus =
      status === 'all' || el.getAttribute('data-status') === status;
    const matchSource =
      source === 'all' || el.getAttribute('data-source') === source;
    const isChecked = Boolean(box?.checked);
    const matchSelected =
      selected === 'all' ||
      (selected === 'on' && isChecked) ||
      (selected === 'off' && !isChecked);
    const matchQuery =
      !query ||
      (el.getAttribute('data-title') || '').includes(query) ||
      (el.getAttribute('data-site-title') || '').includes(query);
    el.hidden = !(
      matchExisting &&
      matchStatus &&
      matchSource &&
      matchSelected &&
      matchQuery
    );
  }
}

/**
 * @param {HTMLElement} wrap
 */
function searchQuery(wrap) {
  const el = /** @type {HTMLInputElement | null} */ (
    wrap.querySelector('[data-bdt-match-search]')
  );
  return String(el?.value || '')
    .trim()
    .toLowerCase();
}

/**
 * @param {HTMLElement} wrap
 * @param {string} key
 */
function filterValue(wrap, key) {
  const el = /** @type {HTMLSelectElement | null} */ (
    wrap.querySelector(`[data-bdt-match-filter="${key}"]`)
  );
  return el?.value || 'all';
}

/**
 * @param {HTMLElement} wrap
 * @param {(selected: number) => void} [onSelectionChange]
 */
function syncMatchSelectionUi(wrap, onSelectionChange) {
  const boxes = [...wrap.querySelectorAll('[data-bdt-match-select]')].map(
    (el) => /** @type {HTMLInputElement} */ (el),
  );
  const existingToggle = /** @type {HTMLInputElement | null} */ (
    wrap.querySelector('[data-bdt-import-existing]')
  );
  const allowExisting = Boolean(existingToggle?.checked);
  const visibleSelectable = boxes.filter((box) => {
    const row = box.closest('tr');
    if (!row || row.hidden) return false;
    if (box.disabled) return false;
    if (row.getAttribute('data-importable') === '0') return false;
    const existing = row.getAttribute('data-existing') === '1';
    return allowExisting || !existing;
  });
  const selected = boxes.filter((box) => box.checked && !box.disabled).length;
  const total = boxes.length;
  const shown = boxes.filter((box) => {
    const row = box.closest('tr');
    return Boolean(row) && !row.hidden;
  }).length;
  const selectableChecked = visibleSelectable.filter((box) => box.checked).length;

  const selectAll = /** @type {HTMLInputElement | null} */ (
    wrap.querySelector('[data-bdt-match-select-all]')
  );
  if (selectAll) {
    const allSelectableOn =
      visibleSelectable.length > 0 &&
      selectableChecked === visibleSelectable.length;
    selectAll.checked = allSelectableOn;
    selectAll.indeterminate =
      selectableChecked > 0 && selectableChecked < visibleSelectable.length;
  }

  const label = wrap.querySelector('[data-bdt-match-selected]');
  if (label) {
    let text = fmt(t.importMatchSelected, { selected, total });
    if (shown !== total) {
      text += ` · ${fmt(t.importMatchShown, { shown, total })}`;
    }
    label.textContent = text;
  }

  onSelectionChange?.(selected);
}

function matchStatusLabel(status) {
  switch (status) {
    case 'found':
      return t.importMatchFound;
    case 'preset':
      return t.importMatchPreset;
    case 'not_found':
      return t.importMatchNotFound;
    case 'error':
      return t.importMatchError;
    default:
      return status;
  }
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   visible: boolean,
 *   current?: number,
 *   total?: number,
 *   title?: string,
 *   label?: string,
 *   reset?: boolean,
 *   activeTitles?: string[],
 *   concurrency?: number,
 * }} state
 */
export function setMatchProgress(root, state) {
  const el = root.querySelector('[data-bdt-progress]');
  if (!el) return;

  if (!state.visible) {
    el.hidden = true;
    return;
  }

  const total = Math.max(1, Number(state.total) || 1);
  const current = Math.min(total, Math.max(0, Number(state.current) || 0));
  const pct = Math.round((current / total) * 100);
  const activeTitles = Array.isArray(state.activeTitles)
    ? state.activeTitles.filter(Boolean)
    : [];
  const concurrency = Math.max(0, Number(state.concurrency) || 0);
  const label =
    state.label ||
    fmtProgress(current, total, state.title || '', activeTitles, concurrency);

  el.hidden = false;

  let fill = el.querySelector('.bdt-progress__fill');
  let labelEl = el.querySelector('.bdt-progress__label');
  let pctEl = el.querySelector('.bdt-progress__pct');
  let track = el.querySelector('.bdt-progress__track');
  let activeEl = el.querySelector('.bdt-progress__active');

  if (!fill || !labelEl || !pctEl || !track || !activeEl) {
    el.innerHTML = `
      <div class="bdt-progress__head">
        <span class="bdt-progress__spinner" aria-hidden="true"></span>
        <span class="bdt-progress__label"></span>
        <strong class="bdt-progress__pct">0%</strong>
      </div>
      <div class="bdt-progress__active" hidden></div>
      <div class="bdt-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="bdt-progress__fill" style="width:0%"></div>
      </div>
    `;
    fill = el.querySelector('.bdt-progress__fill');
    labelEl = el.querySelector('.bdt-progress__label');
    pctEl = el.querySelector('.bdt-progress__pct');
    track = el.querySelector('.bdt-progress__track');
    activeEl = el.querySelector('.bdt-progress__active');
  }

  if (labelEl) labelEl.textContent = label;
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (track) {
    track.setAttribute('aria-valuenow', String(pct));
  }
  if (activeEl) {
    if (activeTitles.length) {
      activeEl.hidden = false;
      activeEl.innerHTML = activeTitles
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
  if (fill) {
    const fillEl = /** @type {HTMLElement} */ (fill);
    const shouldReset = state.reset || current === 0;
    if (shouldReset) {
      fillEl.style.transition = 'none';
      fillEl.style.width = '0%';
      void fillEl.offsetWidth;
      fillEl.style.transition = '';
    }
    fillEl.style.width = `${pct}%`;
  }
}

/**
 * @param {number} current
 * @param {number} total
 * @param {string} title
 * @param {string[]} activeTitles
 * @param {number} concurrency
 */
function fmtProgress(current, total, title, activeTitles, concurrency) {
  if (concurrency > 1 || activeTitles.length > 1) {
    const active = activeTitles.length || Math.min(concurrency, total - current);
    return String(t.importMatchProgressParallel || '')
      .replace('{current}', String(current))
      .replace('{total}', String(total))
      .replace('{active}', String(active))
      .replace('{concurrency}', String(concurrency || active));
  }
  return String(t.importMatchProgress || '')
    .replace('{current}', String(current))
    .replace('{total}', String(total))
    .replace('{title}', title || activeTitles[0] || '…');
}

/**
 * Debug-only collapsible list of games scraped into the library index.
 * @param {HTMLElement} root
 * @param {import('../destinations/backloggd/library.js').UserLibraryIndex | null | undefined} library
 */
export function renderLibraryDebug(root, library) {
  const host = root.querySelector('[data-bdt-debug-library]');
  if (!host) return;

  if (!settings.debugMode || !library) {
    host.hidden = true;
    host.innerHTML = '';
    return;
  }

  const games = Array.isArray(library.games) ? library.games : [];
  const rows = games
    .map((game) => {
      const title = game.title || '—';
      const slug = game.slug || '';
      const id = game.gameId != null ? String(game.gameId) : '—';
      const link = slug
        ? `<a href="${escapeAttr(backloggdUrl(`/games/${encodeURIComponent(slug)}/`))}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)}</a>`
        : escapeHtml(title);
      const sourcePath = String(game.sourceUrl || '').trim();
      const sourceLabel = sourcePath || '—';
      const sourceCell = sourcePath
        ? `<a href="${escapeAttr(backloggdUrl(sourcePath))}" target="_blank" rel="noopener noreferrer" title="${escapeAttr(sourcePath)}">${escapeHtml(sourceLabel)}</a>`
        : escapeHtml('—');
      return `
        <tr>
          <td class="bdt-debug-library__title">${link}</td>
          <td class="bdt-debug-library__id">${escapeHtml(id)}</td>
          <td class="bdt-debug-library__slug">${escapeHtml(slug || '—')}</td>
          <td class="bdt-debug-library__source">${sourceCell}</td>
        </tr>
      `;
    })
    .join('');

  host.hidden = false;
  host.innerHTML = `
    <details class="bdt-debug-library__details">
      <summary class="bdt-debug-library__summary">
        <span class="bdt-debug-library__summary-main">
          <span class="bdt-debug-library__badge">DEBUG</span>
          <strong class="bdt-debug-library__title-text">${escapeHtml(t.importDebugLibraryTitle)}</strong>
          <span class="bdt-debug-library__count">${escapeHtml(
            fmt(t.importDebugLibraryCount, {
              count: games.length,
              pages: library.pageCount || 0,
              user: library.username || '—',
            }),
          )}</span>
        </span>
        <span class="bdt-debug-library__chevron" aria-hidden="true"></span>
      </summary>
      <div class="bdt-debug-library__body">
        <p class="bdt-debug-library__lead">${escapeHtml(t.importDebugLibraryLead)}</p>
        ${
          games.length
            ? `<div class="bdt-debug-library__scroll">
                <table class="bdt-debug-library__table">
                  <thead>
                    <tr>
                      <th>${escapeHtml(t.importDebugLibraryColTitle)}</th>
                      <th>${escapeHtml(t.importDebugLibraryColId)}</th>
                      <th>${escapeHtml(t.importDebugLibraryColSlug)}</th>
                      <th>${escapeHtml(t.importDebugLibraryColSource)}</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>`
            : `<p class="bdt-muted">${escapeHtml(t.importDebugLibraryEmpty)}</p>`
        }
      </div>
    </details>
  `;
}

/**
 * @param {HTMLElement} root
 */
export function clearLibraryDebug(root) {
  const host = root.querySelector('[data-bdt-debug-library]');
  if (!host) return;
  host.hidden = true;
  host.innerHTML = '';
}
