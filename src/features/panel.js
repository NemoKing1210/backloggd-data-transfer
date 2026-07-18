import { REPO_URL, SCRIPT_VERSION } from '../constants.js';
import { importTransferToBackloggd } from '../destinations/backloggd/index.js';
import { analyzeTransferDocument, statusDisplayLabel } from '../format/analyze.js';
import { createExampleTransferDocument } from '../format/example.js';
import { parseTransferDocument } from '../format/parse.js';
import { serializeTransferDocument, transferFilename } from '../format/serialize.js';
import { fmt } from '../i18n/index.js';
import { saveSettings } from '../settings.js';
import { reloadRuntimeSettings, settings, t } from '../state.js';
import { downloadBlob, readFileAsText } from '../utils/download.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
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
  const summary = root.querySelector('[data-bdt-summary]');
  if (summary) summary.hidden = true;
  const importBtn = root.querySelector('[data-bdt-import]');
  if (importBtn) importBtn.hidden = true;
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
  const hintEl = root.querySelector('[data-bdt-format-hint]');

  if (metaEl) {
    metaEl.textContent = importFormat === 'csv' ? t.importDropCsv : t.importDropJson;
  }
  if (hintEl) {
    hintEl.textContent =
      importFormat === 'csv' ? t.importFormatCsvHint : t.importFormatJsonHint;
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
    btn.classList.toggle('is-active', btn.getAttribute('data-bdt-format') === importFormat);
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
    showToast(t.importDropJson, { type: 'warning' });
    return;
  }
  if (importFormat === 'csv' && !name.endsWith('.csv')) {
    showToast(t.importDropCsv, { type: 'warning' });
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

  const newText =
    analysis.newCount == null ? t.importStatPending : String(analysis.newCount);
  const existingText =
    analysis.existingCount == null
      ? t.importStatPending
      : String(analysis.existingCount);

  const statusLines = Object.entries(analysis.byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([key, count]) =>
        `<li><span>${escapeHtml(statusDisplayLabel(key, t.importStatNoStatus))}</span><strong>${count}</strong></li>`,
    )
    .join('');

  summary.innerHTML = `
    <h3 class="bdt-summary__title">${escapeHtml(t.importSummaryTitle)}</h3>
    <dl class="bdt-summary__grid">
      <div><dt>${escapeHtml(t.importStatVersion)}</dt><dd>${escapeHtml(String(analysis.version))}</dd></div>
      <div><dt>${escapeHtml(t.importStatSource)}</dt><dd>${escapeHtml(sourceLabel)}</dd></div>
      <div><dt>${escapeHtml(t.importStatExported)}</dt><dd>${escapeHtml(analysis.exportedAt || '—')}</dd></div>
      <div><dt>${escapeHtml(t.importStatTotal)}</dt><dd>${analysis.total}</dd></div>
      <div><dt>${escapeHtml(t.importStatUnique)}</dt><dd>${analysis.uniqueTitles}</dd></div>
      <div><dt>${escapeHtml(t.importStatDuplicates)}</dt><dd>${analysis.duplicates}</dd></div>
      <div><dt>${escapeHtml(t.importStatNew)}</dt><dd>${escapeHtml(newText)}</dd></div>
      <div><dt>${escapeHtml(t.importStatExisting)}</dt><dd>${escapeHtml(existingText)}</dd></div>
      <div><dt>${escapeHtml(t.importStatRated)}</dt><dd>${analysis.withRating}</dd></div>
      <div><dt>${escapeHtml(t.importStatFavorites)}</dt><dd>${analysis.favorites}</dd></div>
      <div><dt>${escapeHtml(t.importStatDates)}</dt><dd>${analysis.withDates}</dd></div>
      <div><dt>${escapeHtml(t.importStatReviews)}</dt><dd>${analysis.withReview}</dd></div>
    </dl>
    <p class="bdt-summary__statuses-label">${escapeHtml(t.importStatByStatus)}</p>
    <ul class="bdt-summary__statuses">${statusLines || `<li><span>—</span><strong>0</strong></li>`}</ul>
    <p class="bdt-muted bdt-stub">${escapeHtml(t.importNewNote)}</p>
  `;
  summary.hidden = false;

  const importBtn = root.querySelector('[data-bdt-import]');
  if (importBtn) importBtn.hidden = false;
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
            <div class="bdt-segment" role="radiogroup" aria-label="${escapeAttr(t.importFormatLabel)}">
              <button type="button" class="bdt-segment__btn" data-bdt-format="json" role="radio">${escapeHtml(t.importFormatJson)}</button>
              <button type="button" class="bdt-segment__btn" data-bdt-format="csv" role="radio">${escapeHtml(t.importFormatCsv)}</button>
            </div>
            <p class="bdt-muted bdt-field__hint" data-bdt-format-hint></p>
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
          <div class="bdt-summary" data-bdt-summary hidden></div>
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
      showToast(t.importCsvStub, { type: 'warning' });
      return;
    }
    if (!pendingFile) {
      showToast(t.importNeedFile, { type: 'warning' });
      return;
    }
    analyzeBtn.disabled = true;
    try {
      const text = await readFileAsText(pendingFile);
      const parsed = parseTransferDocument(text);
      if (!parsed.ok) {
        resetAnalysisUi(backdrop);
        showToast(fmt(t.importInvalid, { error: parsed.error }), { type: 'error' });
        return;
      }
      loadedDoc = parsed.value;
      const analysis = analyzeTransferDocument(loadedDoc);
      renderSummary(backdrop, analysis);
      showToast(
        fmt(t.importAnalyzed, {
          count: analysis.total,
          platform: analysis.platform,
        }),
        { type: 'success' },
      );
    } catch (err) {
      resetAnalysisUi(backdrop);
      showToast(err instanceof Error ? err.message : String(err), { type: 'error' });
    } finally {
      syncActionButtons(backdrop);
    }
  });

  backdrop.querySelector('[data-bdt-import]')?.addEventListener('click', async () => {
    if (!loadedDoc) {
      showToast(t.importNeedAnalyze, { type: 'warning' });
      return;
    }
    const importBtn = backdrop.querySelector('[data-bdt-import]');
    if (importBtn) importBtn.disabled = true;
    const logEl = backdrop.querySelector('[data-bdt-log]');
    if (logEl) {
      logEl.hidden = false;
      logEl.textContent = '';
    }

    try {
      const summary = await importTransferToBackloggd(loadedDoc, {
        dryRun: false,
        delayMs: settings.importDelayMs,
        onProgress({ index, total, entry, result }) {
          const line = fmt(t.importProgress, {
            index: index + 1,
            total,
            title: entry.title,
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
        { type: summary.failCount ? 'warning' : 'success' },
      );
    } finally {
      if (importBtn) importBtn.disabled = false;
    }
  });

  backdrop.querySelector('[data-bdt-example]')?.addEventListener('click', () => {
    const doc = createExampleTransferDocument();
    const filename = transferFilename('example');
    downloadBlob(filename, serializeTransferDocument(doc));
    showToast(fmt(t.importExampleDownloaded, { filename }), { type: 'success' });
  });

  // Apply initial format UI without clearing twice
  backdrop.querySelectorAll('[data-bdt-format]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-bdt-format') === importFormat);
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
}
