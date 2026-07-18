import { statusDisplayLabel } from '../format/analyze.js';
import { entryDisplayTitle, primaryPlaythrough } from '../format/schema.js';
import { fmt } from '../i18n/index.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
import { t } from '../state.js';

/**
 * @param {HTMLElement} root
 * @param {import('../destinations/backloggd/match.js').EntryMatchResult[]} results
 * @param {{
 *   importExisting?: boolean,
 *   onSelectionChange?: (selected: number) => void,
 *   onImportExistingChange?: (enabled: boolean) => void,
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

  const rows = results
    .map((row) => {
      const entry = row.entry;
      const pt = primaryPlaythrough(entry);
      const title = entryDisplayTitle(entry);
      const matchedTitle = row.match?.title || '—';
      const gameId = row.match?.id ?? entry.game_id ?? '—';
      const year = row.match?.year || '—';
      const link = row.match?.url
        ? `<a href="${escapeAttr(row.match.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(matchedTitle)}</a>`
        : escapeHtml(matchedTitle);
      const checked = row.existingLog ? importExisting : true;
      const existingLabel = row.existingLog
        ? t.importMatchExistingYes
        : t.importMatchExistingNo;

      return `
        <tr
          class="bdt-match-row bdt-match-row--${escapeAttr(row.status)}${row.existingLog ? ' bdt-match-row--existing' : ''}"
          data-existing="${row.existingLog ? '1' : '0'}"
        >
          <td class="bdt-match-col-check">
            <input
              type="checkbox"
              class="bdt-match-check"
              data-bdt-match-select
              value="${row.index}"
              ${checked ? 'checked' : ''}
              aria-label="${escapeAttr(fmt(t.importMatchSelectRow, { title }))}"
            />
          </td>
          <td class="bdt-match-col-num">${row.index + 1}</td>
          <td class="bdt-match-col-title">${escapeHtml(title)}</td>
          <td>${escapeHtml(statusDisplayLabel(entry.log?.status, t.importStatNoStatus))}</td>
          <td>${escapeHtml(pt.start_date || '—')}</td>
          <td>${escapeHtml(pt.finish_date || '—')}</td>
          <td>${pt.rating == null ? '—' : escapeHtml(String(pt.rating))}</td>
          <td>${escapeHtml(pt.title || '—')}</td>
          <td><span class="bdt-match-pill bdt-match-pill--${escapeAttr(row.status)}">${escapeHtml(matchStatusLabel(row.status))}</span></td>
          <td>
            <span class="bdt-match-pill bdt-match-pill--${row.existingLog ? 'existing' : 'new'}">${escapeHtml(existingLabel)}</span>
          </td>
          <td class="bdt-match-col-site">${link}</td>
          <td class="bdt-match-col-id">${escapeHtml(String(gameId))}</td>
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
  syncMatchSelectionUi(wrap, options.onSelectionChange);
}

/**
 * @param {HTMLElement} root
 * @returns {number[]}
 */
export function getSelectedMatchIndices(root) {
  return [...root.querySelectorAll('[data-bdt-match-select]:checked')].map((el) =>
    Number(/** @type {HTMLInputElement} */ (el).value),
  );
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

  const importExistingEnabled = () => Boolean(existingToggle?.checked);

  selectAll?.addEventListener('change', () => {
    const checked = Boolean(selectAll.checked);
    const allowExisting = importExistingEnabled();
    for (const box of rowChecks()) {
      if (checked && isExistingRow(box) && !allowExisting) {
        box.checked = false;
        continue;
      }
      box.checked = checked;
    }
    syncMatchSelectionUi(wrap, options.onSelectionChange);
  });

  existingToggle?.addEventListener('change', () => {
    const enabled = Boolean(existingToggle.checked);
    options.onImportExistingChange?.(enabled);
    for (const box of rowChecks()) {
      if (!isExistingRow(box)) continue;
      box.checked = enabled;
    }
    syncMatchSelectionUi(wrap, options.onSelectionChange);
  });

  wrap.addEventListener('change', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('[data-bdt-match-select]')) return;
    syncMatchSelectionUi(wrap, options.onSelectionChange);
  });
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
  const selectable = boxes.filter((box) => {
    const existing = box.closest('tr')?.getAttribute('data-existing') === '1';
    return allowExisting || !existing;
  });
  const selected = boxes.filter((box) => box.checked).length;
  const total = boxes.length;
  const selectableChecked = selectable.filter((box) => box.checked).length;

  const selectAll = /** @type {HTMLInputElement | null} */ (
    wrap.querySelector('[data-bdt-match-select-all]')
  );
  if (selectAll) {
    const allSelectableOn =
      selectable.length > 0 && selectableChecked === selectable.length;
    selectAll.checked = allSelectableOn;
    selectAll.indeterminate =
      selectableChecked > 0 && selectableChecked < selectable.length;
  }

  const label = wrap.querySelector('[data-bdt-match-selected]');
  if (label) {
    label.textContent = fmt(t.importMatchSelected, { selected, total });
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
 * @param {{ visible: boolean, current?: number, total?: number, title?: string, label?: string, reset?: boolean }} state
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
  const label =
    state.label ||
    fmtProgress(current, total, state.title || '');

  el.hidden = false;

  let fill = el.querySelector('.bdt-progress__fill');
  let labelEl = el.querySelector('.bdt-progress__label');
  let pctEl = el.querySelector('.bdt-progress__pct');
  let track = el.querySelector('.bdt-progress__track');

  if (!fill || !labelEl || !pctEl || !track) {
    el.innerHTML = `
      <div class="bdt-progress__head">
        <span class="bdt-progress__spinner" aria-hidden="true"></span>
        <span class="bdt-progress__label"></span>
        <strong class="bdt-progress__pct">0%</strong>
      </div>
      <div class="bdt-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="bdt-progress__fill" style="width:0%"></div>
      </div>
    `;
    fill = el.querySelector('.bdt-progress__fill');
    labelEl = el.querySelector('.bdt-progress__label');
    pctEl = el.querySelector('.bdt-progress__pct');
    track = el.querySelector('.bdt-progress__track');
  }

  if (labelEl) labelEl.textContent = label;
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (track) {
    track.setAttribute('aria-valuenow', String(pct));
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

function fmtProgress(current, total, title) {
  return String(t.importMatchProgress || '')
    .replace('{current}', String(current))
    .replace('{total}', String(total))
    .replace('{title}', title);
}
