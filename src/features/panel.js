import { REPO_URL, SCRIPT_VERSION, MATCH_DELAY_MS } from '../constants.js';
import { importTransferToBackloggd } from '../destinations/backloggd/index.js';
import { loadCurrentUserLibrary } from '../destinations/backloggd/library.js';
import { matchTransferEntries } from '../destinations/backloggd/match.js';
import { analyzeTransferDocument, statusDisplayLabel } from '../format/analyze.js';
import { createExampleTransferDocument } from '../format/example.js';
import { parseTransferDocument } from '../format/parse.js';
import { entryDisplayTitle } from '../format/schema.js';
import { serializeTransferDocument, transferFilename } from '../format/serialize.js';
import { fmt } from '../i18n/index.js';
import { saveSettings } from '../settings.js';
import { reloadRuntimeSettings, settings, t } from '../state.js';
import { downloadBlob, readFileAsText } from '../utils/download.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
import {
  getSelectedMatchIndices,
  renderMatchTable,
  setMatchProgress,
} from './match-ui.js';
import { clearReadErrors, collectReadIssues, renderReadErrors } from './errors-ui.js';
import { showToast } from './toast.js';

const PANEL_ID = 'bdt-panel-backdrop';
export const NAV_BTN_ID = 'bdt-nav-transfer';

/** @type {import('../format/schema.js').TransferDocument | null} */
let loadedDoc = null;
/** @type {File | null} */
let pendingFile = null;
/** @type {'json' | 'csv'} */
let importFormat = 'json';
/** @type {string | null} */
let prevHtmlOverflow = null;
/** Bumps to cancel an in-flight match run. */
let matchRunId = 0;

function lockPageScroll() {
  if (prevHtmlOverflow !== null) return;
  prevHtmlOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = 'hidden';
}

function unlockPageScroll() {
  if (prevHtmlOverflow === null) return;
  document.documentElement.style.overflow = prevHtmlOverflow;
  prevHtmlOverflow = null;
}

export function ensureNavButton() {
  if (document.getElementById(NAV_BTN_ID)) return;

  const btn = document.createElement('button');
  btn.id = NAV_BTN_ID;
  btn.type = 'button';
  btn.className = 'btn btn-main mb-2 my-sm-0 py-0';
  btn.title = t.navButtonTitle;
  // Prefer icons already used on Backloggd (kit subset); fa-file-import is often missing.
  btn.innerHTML = `<i class="fa-solid fa-layer-group fa-xs" aria-hidden="true"></i> ${escapeHtml(t.navButton)}`;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    openPanel();
  });

  // Same slot as native #add-a-game / Backloggd Plus #blp-nav-settings
  const after =
    document.getElementById('blp-nav-settings') || document.getElementById('add-a-game');
  if (after?.parentElement) {
    btn.classList.add('ml-2');
    const h = after.getBoundingClientRect().height;
    if (h > 0) document.documentElement.style.setProperty('--bdt-nav-btn-h', `${Math.round(h)}px`);
    after.insertAdjacentElement('afterend', btn);
    return;
  }

  const logSlot = document.querySelector(
    '#navbarSupportedContent .col.my-auto, #primary-nav .col.my-auto',
  );
  if (logSlot) {
    btn.classList.add('ml-2');
    logSlot.appendChild(btn);
    return;
  }

  const nav =
    document.querySelector('#navbarSupportedContent > ul.navbar-nav') ||
    document.querySelector('#primary-nav ul.navbar-nav.ml-auto');
  if (!nav) return;

  const li = document.createElement('li');
  li.className = 'nav-item my-auto';
  li.appendChild(btn);
  nav.appendChild(li);
}

function resetAnalysisUi(root) {
  loadedDoc = null;
  matchRunId += 1;
  const summary = root.querySelector('[data-bdt-summary]');
  if (summary) summary.hidden = true;
  clearReadErrors(root);
  const importBtn = root.querySelector('[data-bdt-import]');
  if (importBtn) importBtn.hidden = true;
  const matchTable = root.querySelector('[data-bdt-match-table]');
  if (matchTable) {
    matchTable.hidden = true;
    matchTable.innerHTML = '';
  }
  setMatchProgress(root, { visible: false });
  const logEl = root.querySelector('[data-bdt-log]');
  if (logEl) {
    logEl.hidden = true;
    logEl.textContent = '';
  }
}

function formatAccept(format) {
  return format === 'csv' ? '.csv,text/csv' : '.json,application/json';
}

function clearPendingFile(root) {
  pendingFile = null;
  const input = root.querySelector('[data-bdt-file]');
  if (input) input.value = '';
  updateDropzoneUi(root);
  resetAnalysisUi(root);
  syncActionButtons(root);
}

function syncActionButtons(root) {
  const analyzeBtn = root.querySelector('[data-bdt-analyze]');
  const exampleBtn = root.querySelector('[data-bdt-example]');
  const csvStub = root.querySelector('[data-bdt-csv-stub]');
  const isCsv = importFormat === 'csv';

  if (csvStub) csvStub.hidden = !isCsv;
  if (exampleBtn) exampleBtn.hidden = isCsv;
  if (analyzeBtn) {
    analyzeBtn.disabled = isCsv || !pendingFile;
  }
}

function updateDropzoneUi(root) {
  const zone = root.querySelector('[data-bdt-dropzone]');
  const empty = root.querySelector('[data-bdt-drop-empty]');
  const filled = root.querySelector('[data-bdt-drop-filled]');
  const nameEl = root.querySelector('[data-bdt-file-name]');
  const metaEl = root.querySelector('[data-bdt-drop-meta]');

  if (metaEl) {
    metaEl.textContent =
      importFormat === 'csv' ? t.importDropAcceptCsv : t.importDropAcceptJson;
  }

  if (!zone || !empty || !filled) return;

  if (pendingFile) {
    zone.classList.add('has-file');
    empty.hidden = true;
    filled.hidden = false;
    if (nameEl) nameEl.textContent = pendingFile.name;
  } else {
    zone.classList.remove('has-file');
    empty.hidden = false;
    filled.hidden = true;
    if (nameEl) nameEl.textContent = '';
  }
}

/**
 * @param {HTMLElement} root
 * @param {'json' | 'csv'} format
 */
function setImportFormat(root, format) {
  importFormat = format === 'csv' ? 'csv' : 'json';
  saveSettings({ ...settings, importFormat });
  reloadRuntimeSettings();

  root.querySelectorAll('[data-bdt-format]').forEach((btn) => {
    const active = btn.getAttribute('data-bdt-format') === importFormat;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });

  const input = root.querySelector('[data-bdt-file]');
  if (input) input.accept = formatAccept(importFormat);

  clearPendingFile(root);
}

function applySelectedFile(root, file) {
  if (!file) {
    clearPendingFile(root);
    return;
  }

  const name = String(file.name || '').toLowerCase();
  if (importFormat === 'json' && !name.endsWith('.json')) {
    showToast(t.importDropJson, { type: 'warning', title: t.toastFileTypeTitle });
    return;
  }
  if (importFormat === 'csv' && !name.endsWith('.csv')) {
    showToast(t.importDropCsv, { type: 'warning', title: t.toastFileTypeTitle });
    return;
  }

  pendingFile = file;
  resetAnalysisUi(root);
  updateDropzoneUi(root);
  syncActionButtons(root);
}

/**
 * @param {HTMLElement} root
 * @param {import('../format/analyze.js').TransferAnalysis} analysis
 */
function renderSummary(root, analysis) {
  const summary = root.querySelector('[data-bdt-summary]');
  if (!summary) return;

  const sourceLabel = analysis.label
    ? `${analysis.platform} · ${analysis.label}`
    : analysis.platform;
  const matchPct =
    analysis.total > 0
      ? Math.round((analysis.foundCount / analysis.total) * 100)
      : 0;

  const statusChips = Object.entries(analysis.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => {
      const label = statusDisplayLabel(key, t.importStatNoStatus);
      return `<li class="bdt-summary__chip" data-status="${escapeAttr(key)}"><span class="bdt-summary__chip-label">${escapeHtml(label)}</span><strong class="bdt-summary__chip-value">${count}</strong></li>`;
    })
    .join('');

  const detailItems = [
    [t.importStatUnique, analysis.uniqueTitles],
    [t.importStatDuplicates, analysis.duplicates],
    [t.importStatExisting, analysis.existingCount],
    [t.importStatRated, analysis.withRating],
    [t.importStatFavorites, analysis.favorites],
    [t.importStatDates, analysis.withDates],
    [t.importStatReviews, analysis.withReview],
    [t.importStatGameId, analysis.withGameId],
  ]
    .map(
      ([label, value]) =>
        `<li class="bdt-summary__detail"><span>${escapeHtml(label)}</span><strong>${value}</strong></li>`,
    )
    .join('');

  summary.innerHTML = `
    <div class="bdt-summary__head">
      <h3 class="bdt-summary__title">${escapeHtml(t.importSummaryTitle)}</h3>
      <ul class="bdt-summary__meta">
        <li><span>${escapeHtml(t.importStatVersion)}</span><strong>v${escapeHtml(String(analysis.version))}</strong></li>
        <li><span>${escapeHtml(t.importStatSource)}</span><strong>${escapeHtml(sourceLabel)}</strong></li>
        <li><span>${escapeHtml(t.importStatExported)}</span><strong>${escapeHtml(analysis.exportedAt || '—')}</strong></li>
      </ul>
    </div>

    <div class="bdt-summary__metrics" role="group" aria-label="${escapeAttr(t.importStatMatchGroup)}">
      <div class="bdt-summary__metric">
        <strong class="bdt-summary__metric-value">${analysis.total}</strong>
        <span class="bdt-summary__metric-label">${escapeHtml(t.importStatTotal)}</span>
      </div>
      <div class="bdt-summary__metric bdt-summary__metric--ok">
        <strong class="bdt-summary__metric-value">${analysis.foundCount}</strong>
        <span class="bdt-summary__metric-label">${escapeHtml(t.importStatFound)}</span>
      </div>
      <div class="bdt-summary__metric bdt-summary__metric--warn">
        <strong class="bdt-summary__metric-value">${analysis.notFoundCount}</strong>
        <span class="bdt-summary__metric-label">${escapeHtml(t.importStatNotFound)}</span>
      </div>
      <div class="bdt-summary__metric bdt-summary__metric--pct">
        <strong class="bdt-summary__metric-value">${matchPct}%</strong>
        <span class="bdt-summary__metric-label">${escapeHtml(t.importStatMatchRate)}</span>
      </div>
    </div>

    <div class="bdt-summary__section">
      <p class="bdt-summary__section-title">${escapeHtml(t.importStatDetails)}</p>
      <ul class="bdt-summary__details">${detailItems}</ul>
    </div>

    <div class="bdt-summary__section">
      <p class="bdt-summary__section-title">${escapeHtml(t.importStatByStatus)}</p>
      <ul class="bdt-summary__statuses">${statusChips || `<li class="bdt-summary__chip"><span class="bdt-summary__chip-label">—</span><strong class="bdt-summary__chip-value">0</strong></li>`}</ul>
    </div>
  `;
  summary.hidden = false;
}

/**
 * @param {HTMLElement} root
 * @param {number} [selectedCount]
 */
function syncImportButton(root, selectedCount) {
  const importBtn = root.querySelector('[data-bdt-import]');
  if (!importBtn) return;

  const matchTable = root.querySelector('[data-bdt-match-table]');
  const hasTable = Boolean(matchTable && !matchTable.hidden);
  importBtn.hidden = !loadedDoc || !hasTable;
  if (importBtn.hidden) return;

  const count =
    selectedCount != null
      ? selectedCount
      : getSelectedMatchIndices(root).length;
  importBtn.textContent = fmt(t.importStartSelected, { count });
  importBtn.disabled = count === 0;
}

export function openPanel(tab = 'import') {
  closePanel();
  reloadRuntimeSettings();
  pendingFile = null;
  loadedDoc = null;
  importFormat = settings.importFormat === 'csv' ? 'csv' : 'json';

  const backdrop = document.createElement('div');
  backdrop.id = PANEL_ID;
  backdrop.className = 'bdt-panel-backdrop';
  backdrop.innerHTML = `
    <div class="bdt-panel" role="dialog" aria-modal="true" aria-labelledby="bdt-panel-title">
      <header class="bdt-panel__header">
        <div>
          <h2 id="bdt-panel-title" class="bdt-panel__title">${escapeHtml(t.panelTitle)}</h2>
          <p class="bdt-panel__subtitle">${escapeHtml(t.panelSubtitle)} · v${escapeHtml(SCRIPT_VERSION)}</p>
        </div>
        <button type="button" class="bdt-panel__close" data-bdt-close aria-label="${escapeAttr(t.close)}">×</button>
      </header>
      <nav class="bdt-panel__tabs" role="tablist">
        <button type="button" class="bdt-tab" data-bdt-tab="import" role="tab">${escapeHtml(t.tabImport)}</button>
        <button type="button" class="bdt-tab" data-bdt-tab="about" role="tab">${escapeHtml(t.tabAbout)}</button>
      </nav>
      <div class="bdt-panel__body">
        <section class="bdt-tab-panel" data-bdt-panel="import" hidden>
          <p class="bdt-muted">${escapeHtml(t.importHint)}</p>

          <div class="bdt-field">
            <p class="bdt-field__label">${escapeHtml(t.importFormatLabel)}</p>
            <div class="bdt-format-cards" role="radiogroup" aria-label="${escapeAttr(t.importFormatLabel)}">
              <button type="button" class="bdt-format-card" data-bdt-format="json" role="radio" aria-checked="false">
                <span class="bdt-format-card__icon" aria-hidden="true"><i class="fa-solid fa-layer-group"></i></span>
                <span class="bdt-format-card__body">
                  <span class="bdt-format-card__top">
                    <span class="bdt-format-card__title">${escapeHtml(t.importFormatJson)}</span>
                    <span class="bdt-format-card__badge bdt-format-card__badge--ready">${escapeHtml(t.importFormatJsonBadge)}</span>
                  </span>
                  <span class="bdt-format-card__hint">${escapeHtml(t.importFormatJsonHint)}</span>
                  <span class="bdt-format-card__ext">${escapeHtml(t.importFormatJsonExt)}</span>
                </span>
                <span class="bdt-format-card__check" aria-hidden="true"></span>
              </button>
              <button type="button" class="bdt-format-card" data-bdt-format="csv" role="radio" aria-checked="false">
                <span class="bdt-format-card__icon" aria-hidden="true"><i class="fa-solid fa-align-right"></i></span>
                <span class="bdt-format-card__body">
                  <span class="bdt-format-card__top">
                    <span class="bdt-format-card__title">${escapeHtml(t.importFormatCsv)}</span>
                    <span class="bdt-format-card__badge bdt-format-card__badge--soon">${escapeHtml(t.importFormatCsvBadge)}</span>
                  </span>
                  <span class="bdt-format-card__hint">${escapeHtml(t.importFormatCsvHint)}</span>
                  <span class="bdt-format-card__ext">${escapeHtml(t.importFormatCsvExt)}</span>
                </span>
                <span class="bdt-format-card__check" aria-hidden="true"></span>
              </button>
            </div>
          </div>

          <div class="bdt-dropzone" data-bdt-dropzone>
            <input type="file" class="bdt-dropzone__input" accept="${escapeAttr(formatAccept(importFormat))}" data-bdt-file />
            <div class="bdt-dropzone__empty" data-bdt-drop-empty>
              <div class="bdt-dropzone__icon" aria-hidden="true">
                <i class="fa-solid fa-layer-group"></i>
              </div>
              <p class="bdt-dropzone__title">${escapeHtml(t.importDropTitle)}</p>
              <p class="bdt-dropzone__meta" data-bdt-drop-meta></p>
              <span class="bdt-dropzone__browse">${escapeHtml(t.importDropBrowse)}</span>
            </div>
            <div class="bdt-dropzone__filled" data-bdt-drop-filled hidden>
              <div class="bdt-dropzone__file">
                <span class="bdt-dropzone__badge">${escapeHtml(t.importDropSelected)}</span>
                <strong class="bdt-dropzone__name" data-bdt-file-name></strong>
              </div>
              <button type="button" class="bdt-btn bdt-btn--ghost bdt-btn--sm" data-bdt-clear>${escapeHtml(t.importDropClear)}</button>
            </div>
          </div>

          <p class="bdt-muted bdt-stub" data-bdt-csv-stub hidden>${escapeHtml(t.importCsvStub)}</p>

          <div class="bdt-actions">
            <button type="button" class="bdt-btn bdt-btn--primary" data-bdt-analyze disabled>${escapeHtml(t.importAnalyze)}</button>
            <button type="button" class="bdt-btn bdt-btn--ghost" data-bdt-example>${escapeHtml(t.importDownloadExample)}</button>
          </div>
          <div class="bdt-progress" data-bdt-progress hidden></div>
          <div class="bdt-summary" data-bdt-summary hidden></div>
          <div class="bdt-errors" data-bdt-errors hidden></div>
          <div class="bdt-match-wrap" data-bdt-match-table hidden></div>
          <div class="bdt-actions" data-bdt-import-wrap>
            <button type="button" class="bdt-btn bdt-btn--primary" data-bdt-import hidden>${escapeHtml(t.importStart)}</button>
          </div>
          <pre class="bdt-log" data-bdt-log hidden></pre>
        </section>
        <section class="bdt-tab-panel" data-bdt-panel="about" hidden>
          <p>${escapeHtml(t.aboutBody)}</p>
          <p>
            <a href="${escapeAttr(REPO_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.aboutRepo)}</a>
            ·
            <a href="${escapeAttr(`${REPO_URL}/blob/main/docs/transfer-format.md`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.aboutFormat)}</a>
          </p>
        </section>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  lockPageScroll();

  const close = () => closePanel();
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('[data-bdt-close]')?.addEventListener('click', close);

  backdrop.querySelectorAll('[data-bdt-tab]').forEach((btn) => {
    btn.addEventListener('click', () => selectTab(backdrop, btn.getAttribute('data-bdt-tab')));
  });

  backdrop.querySelectorAll('[data-bdt-format]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setImportFormat(backdrop, btn.getAttribute('data-bdt-format') === 'csv' ? 'csv' : 'json');
    });
  });

  const fileInput = backdrop.querySelector('[data-bdt-file]');
  const dropzone = backdrop.querySelector('[data-bdt-dropzone]');

  fileInput?.addEventListener('change', () => {
    applySelectedFile(backdrop, fileInput.files?.[0] || null);
  });

  dropzone?.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-dragover');
  });
  dropzone?.addEventListener('dragleave', (e) => {
    if (!dropzone.contains(e.relatedTarget)) {
      dropzone.classList.remove('is-dragover');
    }
  });
  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-dragover');
    const file = e.dataTransfer?.files?.[0] || null;
    applySelectedFile(backdrop, file);
  });

  backdrop.querySelector('[data-bdt-clear]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearPendingFile(backdrop);
  });

  const analyzeBtn = backdrop.querySelector('[data-bdt-analyze]');
  analyzeBtn?.addEventListener('click', async () => {
    if (importFormat === 'csv') {
      showToast(t.importCsvStub, { type: 'warning', title: t.toastCsvSoonTitle });
      return;
    }
    if (!pendingFile) {
      showToast(t.importNeedFile, { type: 'warning', title: t.importNeedFileTitle });
      return;
    }
    analyzeBtn.disabled = true;
    const runId = ++matchRunId;
    try {
      const text = await readFileAsText(pendingFile);
      const parsed = parseTransferDocument(text);
      if (!parsed.ok) {
        resetAnalysisUi(backdrop);
        showToast(fmt(t.importInvalid, { error: parsed.error }), {
          type: 'error',
          title: t.importInvalidTitle,
        });
        return;
      }
      loadedDoc = parsed.value;
      const total = loadedDoc.entries.length;

      setMatchProgress(backdrop, {
        visible: true,
        current: 0,
        total: 1,
        label: t.importLibraryProgress,
      });

      let library = null;
      /** @type {string | null} */
      let libraryError = null;
      try {
        library = await loadCurrentUserLibrary({
          shouldCancel: () => runId !== matchRunId,
          onProgress({ listIndex, listTotal, page }) {
            if (runId !== matchRunId) return;
            setMatchProgress(backdrop, {
              visible: true,
              current: listIndex + 1,
              total: listTotal,
              label: fmt(t.importLibraryProgressDetail, {
                list: listIndex + 1,
                total: listTotal,
                page,
              }),
            });
          },
        });
      } catch (err) {
        if (runId !== matchRunId) return;
        libraryError = err instanceof Error ? err.message : String(err);
        showToast(fmt(t.importLibraryFailed, { error: libraryError }), {
          type: 'warning',
          title: t.importLibraryFailedTitle,
        });
      }

      if (runId !== matchRunId) return;

      setMatchProgress(backdrop, {
        visible: true,
        current: 0,
        total: Math.max(total, 1),
        title: '',
        reset: true,
      });

      const matchSummary = await matchTransferEntries(loadedDoc, {
        delayMs: MATCH_DELAY_MS,
        library,
        shouldCancel: () => runId !== matchRunId,
        onProgress({ index, total: tot, entry }) {
          if (runId !== matchRunId) return;
          setMatchProgress(backdrop, {
            visible: true,
            current: index + 1,
            total: tot,
            title: entryDisplayTitle(entry),
          });
        },
      });

      if (runId !== matchRunId) return;

      setMatchProgress(backdrop, { visible: false });
      const analysis = analyzeTransferDocument(loadedDoc, {
        foundCount: matchSummary.foundCount,
        notFoundCount: matchSummary.notFoundCount + matchSummary.errorCount,
        existingCount: matchSummary.existingCount,
      });
      renderSummary(backdrop, analysis);
      renderReadErrors(
        backdrop,
        collectReadIssues(matchSummary.results, libraryError),
      );
      renderMatchTable(backdrop, matchSummary.results, {
        importExisting: settings.importExisting === true,
        onSelectionChange(selected) {
          syncImportButton(backdrop, selected);
        },
        onImportExistingChange(enabled) {
          saveSettings({ ...settings, importExisting: enabled });
          reloadRuntimeSettings();
        },
      });
      syncImportButton(backdrop);
      showToast(
        fmt(t.importAnalyzed, {
          count: analysis.total,
          found: analysis.foundCount,
          missing: analysis.notFoundCount,
        }),
        {
          type: analysis.notFoundCount ? 'warning' : 'success',
          title: t.importAnalyzedTitle,
        },
      );
    } catch (err) {
      if (runId === matchRunId) {
        resetAnalysisUi(backdrop);
        showToast(err instanceof Error ? err.message : String(err), {
          type: 'error',
          title: t.importReadFailedTitle,
        });
      }
    } finally {
      if (runId === matchRunId) {
        setMatchProgress(backdrop, { visible: false });
        syncActionButtons(backdrop);
      }
    }
  });

  backdrop.querySelector('[data-bdt-import]')?.addEventListener('click', async () => {
    if (!loadedDoc) {
      showToast(t.importNeedAnalyze, {
        type: 'warning',
        title: t.importNeedAnalyzeTitle,
      });
      return;
    }

    const selectedIndices = new Set(getSelectedMatchIndices(backdrop));
    if (!selectedIndices.size) {
      showToast(t.importNeedSelection, {
        type: 'warning',
        title: t.importNeedSelectionTitle,
      });
      return;
    }

    const importDoc = {
      ...loadedDoc,
      entries: loadedDoc.entries.filter((_, index) => selectedIndices.has(index)),
    };

    const importBtn = backdrop.querySelector('[data-bdt-import]');
    if (importBtn) importBtn.disabled = true;
    const logEl = backdrop.querySelector('[data-bdt-log]');
    if (logEl) {
      logEl.hidden = false;
      logEl.textContent = '';
    }

    try {
      const summary = await importTransferToBackloggd(importDoc, {
        dryRun: false,
        delayMs: settings.importDelayMs,
        onProgress({ index, total, entry, result }) {
          const line = fmt(t.importProgress, {
            index: index + 1,
            total,
            title: entryDisplayTitle(entry),
          });
          const status = result.ok ? 'ok' : result.error || 'fail';
          if (logEl) logEl.textContent += `${line} — ${status}\n`;
        },
      });

      showToast(
        fmt(t.importDone, {
          ok: summary.okCount,
          fail: summary.failCount,
        }),
        {
          type: summary.failCount ? 'warning' : 'success',
          title: t.importDoneTitle,
        },
      );
    } finally {
      syncImportButton(backdrop);
    }
  });

  backdrop.querySelector('[data-bdt-example]')?.addEventListener('click', () => {
    const doc = createExampleTransferDocument();
    const filename = transferFilename('example');
    downloadBlob(filename, serializeTransferDocument(doc));
    showToast(fmt(t.importExampleDownloaded, { filename }), {
      type: 'success',
      title: t.importExampleTitle,
    });
  });

  // Apply initial format UI without clearing twice
  backdrop.querySelectorAll('[data-bdt-format]').forEach((btn) => {
    const active = btn.getAttribute('data-bdt-format') === importFormat;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  updateDropzoneUi(backdrop);
  syncActionButtons(backdrop);

  selectTab(backdrop, tab);
}

function selectTab(backdrop, tab) {
  backdrop.querySelectorAll('[data-bdt-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-bdt-tab') === tab);
  });
  backdrop.querySelectorAll('[data-bdt-panel]').forEach((panel) => {
    panel.hidden = panel.getAttribute('data-bdt-panel') !== tab;
  });
}

export function closePanel() {
  document.getElementById(PANEL_ID)?.remove();
  unlockPageScroll();
  pendingFile = null;
  loadedDoc = null;
  matchRunId += 1;
}
