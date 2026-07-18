import { AUTHOR, REPO_URL, SCRIPT_VERSION, MATCH_DELAY_MS } from '../constants.js';
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
  appendImportLogResult,
  beginImportLog,
  clearImportLog,
  finishImportLog,
  formatImportDuration,
  setImportLogCurrent,
} from './import-log-ui.js';
import {
  getSelectedMatchIndices,
  renderMatchTable,
  setMatchProgress,
} from './match-ui.js';
import { clearReadErrors, clearImportErrors, collectImportIssues, collectReadIssues, renderImportErrors, renderReadErrors } from './errors-ui.js';
import { clearCsvMapping, readCsvMapping, readCsvValueMaps, renderCsvMapping } from './csv-map-ui.js';
import { rememberCsvValueMaps } from '../format/csv/value-map-memory.js';
import { renderHistoryPanel, syncHistoryTabBadge } from './history-ui.js';
import { renderCachePanel, syncCacheTabBadge } from './cache-ui.js';
import { showToast } from './toast.js';
import {
  findBackloggdUserId,
  getCsrfToken,
  isLoggedIn,
  setBackloggdUserId,
} from '../destinations/backloggd/auth.js';
import { recordImportHistory } from '../history/store.js';
import { parseCsv } from '../format/csv/parse.js';
import { buildTransferFromCsv, suggestCsvMapping } from '../format/csv/map.js';

const PANEL_ID = 'bdt-panel-backdrop';
export const NAV_BTN_ID = 'bdt-nav-transfer';

/** @type {import('../format/schema.js').TransferDocument | null} */
let loadedDoc = null;
/** @type {File | null} */
let pendingFile = null;
/** @type {{ headers: string[], rows: Record<string, string>[], rowCount: number } | null} */
let csvData = null;
/** @type {Record<string, string>} */
let csvMapping = {};
/** @type {{ status: Record<string, string>, rating: Record<string, string> }} */
let csvValueMaps = { status: {}, rating: {}, platform: {} };
/** @type {'json' | 'csv'} */
let importFormat = 'json';
/** @type {string | null} */
let prevHtmlOverflow = null;
/** Bumps to cancel an in-flight match run. */
let matchRunId = 0;
/**
 * Import wizard step.
 * @type {'file' | 'mapping' | 'reading' | 'review' | 'importing' | 'done'}
 */
let importStep = 'file';
/** Highest step the user may jump to via the stepper. */
let mappingReady = false;
let reviewReady = false;
let importReady = false;

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
  mappingReady = false;
  reviewReady = false;
  importReady = false;
  matchRunId += 1;
  clearCsvMapping(root);
  const summary = root.querySelector('[data-bdt-summary]');
  if (summary) {
    summary.hidden = true;
    summary.innerHTML = '';
  }
  clearReadErrors(root);
  clearImportErrors(root);
  const authGate = root.querySelector('[data-bdt-import-auth]');
  if (authGate) authGate.hidden = true;
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
  const statusEl = root.querySelector('[data-bdt-import-status]');
  if (statusEl) statusEl.innerHTML = '';
}

/**
 * @param {HTMLElement} root
 * @param {'file' | 'mapping' | 'reading' | 'review' | 'importing' | 'done'} step
 */
function setImportStep(root, step) {
  importStep = step;

  const stageKey =
    step === 'importing' || step === 'done'
      ? 'import'
      : step === 'reading'
        ? 'reading'
        : step;

  root.querySelectorAll('[data-bdt-stage]').forEach((el) => {
    const active = el.getAttribute('data-bdt-stage') === stageKey;
    el.hidden = !active;
    el.classList.toggle('is-active', active);
    if (active) {
      el.classList.remove('is-enter');
      void el.offsetWidth;
      el.classList.add('is-enter');
    }
  });

  const map = {
    file: 'file',
    mapping: 'mapping',
    reading: 'review',
    review: 'review',
    importing: 'import',
    done: 'import',
  };
  const activeNav = map[step];
  const showMapStep = importFormat === 'csv';

  root.querySelectorAll('[data-bdt-step]').forEach((btn) => {
    const id = btn.getAttribute('data-bdt-step');
    if (id === 'mapping') {
      btn.closest('.bdt-steps__item')?.toggleAttribute('hidden', !showMapStep);
    }

    const done =
      (id === 'file' && step !== 'file') ||
      (id === 'mapping' &&
        (step === 'reading' ||
          step === 'review' ||
          step === 'importing' ||
          step === 'done')) ||
      (id === 'review' && (step === 'importing' || step === 'done')) ||
      (id === 'import' && step === 'done');
    const current = id === activeNav;
    btn.classList.toggle('is-current', current);
    btn.classList.toggle('is-done', done && !current);
    btn.classList.toggle(
      'is-busy',
      (step === 'reading' && id === 'review') || (step === 'mapping' && id === 'mapping'),
    );

    let enabled = id === 'file';
    if (id === 'mapping') enabled = showMapStep && (mappingReady || step === 'mapping');
    if (id === 'review') {
      enabled = reviewReady || step === 'reading' || step === 'review';
    }
    if (id === 'import') enabled = importReady || step === 'importing' || step === 'done';
    if (step === 'reading' || step === 'importing') {
      enabled = id === activeNav || id === 'file' || (id === 'mapping' && showMapStep);
      if (step === 'importing' && id === 'review') enabled = true;
      if (step === 'importing' && id === 'mapping' && showMapStep) enabled = true;
    }
    btn.disabled = !enabled;
    btn.setAttribute('aria-current', current ? 'step' : 'false');
  });

  root.querySelector('[data-bdt-steps]')?.classList.toggle('has-mapping', showMapStep);

  const reviewIndex = root.querySelector('[data-bdt-step-index="review"]');
  const importIndex = root.querySelector('[data-bdt-step-index="import"]');
  if (reviewIndex) reviewIndex.textContent = showMapStep ? '3' : '2';
  if (importIndex) importIndex.textContent = showMapStep ? '4' : '3';

  const body = root.querySelector('.bdt-panel__body');
  if (body) body.scrollTop = 0;
}

function goBackToFile(root) {
  csvData = null;
  csvMapping = {};
  csvValueMaps = { status: {}, rating: {}, platform: {} };
  resetAnalysisUi(root);
  setImportStep(root, 'file');
  syncActionButtons(root);
}

function goBackToMapping(root) {
  if (importFormat !== 'csv' || !csvData) {
    goBackToFile(root);
    return;
  }
  loadedDoc = null;
  reviewReady = false;
  importReady = false;
  mappingReady = true;
  renderCsvMapping(root, {
    headers: csvData.headers,
    rows: csvData.rows,
    mapping: csvMapping,
    valueMaps: csvValueMaps,
    filename: pendingFile?.name,
    onChange(next) {
      csvMapping = next.mapping;
      csvValueMaps = next.valueMaps;
    },
  });
  setImportStep(root, 'mapping');
}

function goBackToReview(root) {
  if (!reviewReady || !loadedDoc) {
    goBackToFile(root);
    return;
  }
  setImportStep(root, 'review');
  syncImportButton(root);
}

/**
 * @param {HTMLElement} root
 * @param {{ okCount: number, failCount: number, skipCount?: number, results?: object[], elapsedMs?: number }} summary
 * @param {import('../format/schema.js').TransferEntry[]} entries
 */
function renderImportResult(root, summary, entries) {
  const statusEl = root.querySelector('[data-bdt-import-status]');
  if (!statusEl) return;

  const authGate = root.querySelector('[data-bdt-import-auth]');
  if (authGate) authGate.hidden = true;

  const skipCount = Number(summary.skipCount) || 0;
  const allOk = summary.failCount === 0 && skipCount === 0;
  const allFailed = summary.okCount === 0 && summary.failCount > 0;
  const orbClass = allOk
    ? 'bdt-stage__orb--done'
    : allFailed
      ? 'bdt-stage__orb--fail'
      : 'bdt-stage__orb--warn';
  const title = allOk
    ? t.importDoneTitle
    : allFailed
      ? t.importFailedTitle
      : t.importPartialTitle;

  const countsLine = fmt(t.importDoneWithSkip, {
    ok: summary.okCount,
    fail: summary.failCount,
    skip: skipCount,
  });
  const elapsedLine =
    summary.elapsedMs != null
      ? fmt(t.importElapsedLabel, {
          time: formatImportDuration(summary.elapsedMs),
        })
      : '';

  statusEl.hidden = false;
  statusEl.innerHTML = `
    <div class="bdt-stage__orb ${orbClass}" aria-hidden="true"></div>
    <h3 class="bdt-stage__title">${escapeHtml(title)}</h3>
    <p class="bdt-stage__text">${escapeHtml(countsLine)}</p>
    ${
      elapsedLine
        ? `<p class="bdt-stage__meta">${escapeHtml(elapsedLine)}</p>`
        : ''
    }
  `;

  renderImportErrors(root, collectImportIssues(summary.results || [], entries));
}

/**
 * Hide progress chrome and clear the import auth gate.
 * @param {HTMLElement} root
 */
function prepareImportGate(root) {
  importReady = true;
  setImportStep(root, 'done');

  const statusEl = root.querySelector('[data-bdt-import-status]');

  if (statusEl) {
    statusEl.hidden = true;
    statusEl.innerHTML = '';
  }
  clearImportLog(root);
  clearImportErrors(root);
}

/**
 * Show a blocking gate on the import stage (not logged in / CSRF missing).
 * @param {HTMLElement} root
 * @param {{ title: string, body: string, detail?: string }} msg
 */
function showImportAuthGate(root, msg) {
  prepareImportGate(root);

  const authGate = root.querySelector('[data-bdt-import-auth]');
  if (authGate) {
    authGate.hidden = false;
    authGate.innerHTML = `
      <div class="bdt-auth-gate__icon" aria-hidden="true">
        <i class="fa-solid fa-user-lock"></i>
      </div>
      <h3 class="bdt-auth-gate__title">${escapeHtml(msg.title)}</h3>
      <p class="bdt-auth-gate__text">${escapeHtml(msg.body)}</p>
      ${
        msg.detail
          ? `<p class="bdt-auth-gate__detail">${escapeHtml(msg.detail)}</p>`
          : ''
      }
      <a class="bdt-btn bdt-btn--primary" href="/users/sign_in">${escapeHtml(t.importSignIn)}</a>
    `;
  }

  showToast(msg.body, { type: 'error', title: msg.title });
}

/**
 * Ask the user to enter their Backloggd user id, then continue import.
 * @param {HTMLElement} root
 * @param {import('../format/schema.js').TransferDocument} importDoc
 */
function showImportUserIdGate(root, importDoc) {
  prepareImportGate(root);

  const authGate = root.querySelector('[data-bdt-import-auth]');
  if (!authGate) return;

  authGate.hidden = false;
  authGate.innerHTML = `
    <div class="bdt-auth-gate__icon" aria-hidden="true">
      <i class="fa-solid fa-fingerprint"></i>
    </div>
    <h3 class="bdt-auth-gate__title">${escapeHtml(t.importNeedUserIdTitle)}</h3>
    <p class="bdt-auth-gate__text">${escapeHtml(t.importNeedUserIdBody)}</p>
    <label class="bdt-auth-gate__field">
      <span class="bdt-auth-gate__label">${escapeHtml(t.importUserIdLabel)}</span>
      <input
        type="number"
        inputmode="numeric"
        min="1"
        step="1"
        class="bdt-auth-gate__input"
        data-bdt-user-id-input
        placeholder="${escapeAttr(t.importUserIdPlaceholder)}"
        autocomplete="off"
      />
    </label>
    <p class="bdt-auth-gate__hint">${escapeHtml(t.importUserIdHint)}</p>
    <button type="button" class="bdt-btn bdt-btn--primary" data-bdt-user-id-continue>
      ${escapeHtml(t.importUserIdContinue)}
    </button>
  `;

  const input = /** @type {HTMLInputElement | null} */ (
    authGate.querySelector('[data-bdt-user-id-input]')
  );
  const continueBtn = authGate.querySelector('[data-bdt-user-id-continue]');

  const submit = () => {
    try {
      setBackloggdUserId(input?.value ?? '');
    } catch (_) {
      showToast(t.importUserIdInvalid, {
        type: 'warning',
        title: t.importNeedUserIdTitle,
      });
      input?.focus();
      return;
    }
    void runImport(root, importDoc);
  };

  continueBtn?.addEventListener('click', submit);
  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  });
  input?.focus();

  showToast(t.importNeedUserIdBody, {
    type: 'warning',
    title: t.importNeedUserIdTitle,
  });
}

/**
 * Run the live import after auth checks have passed.
 * @param {HTMLElement} root
 * @param {import('../format/schema.js').TransferDocument} importDoc
 */
async function runImport(root, importDoc) {
  const authGate = root.querySelector('[data-bdt-import-auth]');
  const statusEl = root.querySelector('[data-bdt-import-status]');
  const importBtn = root.querySelector('[data-bdt-import]');

  if (importBtn) importBtn.disabled = true;
  importReady = true;
  clearImportErrors(root);
  setImportStep(root, 'importing');

  if (authGate) {
    authGate.hidden = true;
    authGate.innerHTML = '';
  }

  const total = importDoc.entries.length;

  if (statusEl) {
    statusEl.hidden = false;
    statusEl.innerHTML = `
      <div class="bdt-stage__orb" aria-hidden="true"></div>
      <h3 class="bdt-stage__title">${escapeHtml(t.importStepImportingTitle)}</h3>
      <p class="bdt-stage__text">${escapeHtml(fmt(t.importStepImportingLead, { count: total }))}</p>
    `;
  }

  beginImportLog(root, { total });

  /** @type {{ ok: number, fail: number, skip: number, total: number, elapsedMs?: number }} */
  const counts = { ok: 0, fail: 0, skip: 0, total };
  const startedAt = performance.now();

  try {
    const summary = await importTransferToBackloggd(importDoc, {
      dryRun: false,
      delayMs: settings.importDelayMs,
      onItemStart({ index, total: tot, entry }) {
        setImportLogCurrent(root, {
          index,
          total: tot,
          title: entryDisplayTitle(entry),
        });
      },
      onProgress({ index, total: tot, entry, result }) {
        const title = entryDisplayTitle(entry);

        let kind = 'fail';
        if (result.ok) {
          kind = 'ok';
          counts.ok += 1;
        } else if (result.skipped) {
          kind = 'skip';
          counts.skip += 1;
        } else {
          counts.fail += 1;
        }

        appendImportLogResult(root, {
          index,
          total: tot,
          title,
          kind,
          detail: result.error || '',
          counts: { ...counts },
        });
      },
    });

    const elapsedMs = Math.round(performance.now() - startedAt);
    counts.ok = summary.okCount;
    counts.fail = summary.failCount;
    counts.skip = Number(summary.skipCount) || 0;
    counts.total = summary.total ?? total;
    counts.elapsedMs = elapsedMs;
    summary.elapsedMs = elapsedMs;

    setImportStep(root, 'done');
    finishImportLog(root, counts);
    renderImportResult(root, summary, importDoc.entries);

    try {
      recordImportHistory({
        filename: pendingFile?.name || '',
        doc: importDoc,
        summary,
        entries: importDoc.entries,
      });
      syncHistoryTabBadge(root);
    } catch (_) {
      /* history is best-effort */
    }

    const toastType =
      summary.failCount === 0 && counts.skip === 0
        ? 'success'
        : summary.okCount === 0 && summary.failCount > 0
          ? 'error'
          : 'warning';
    const toastTitle =
      summary.failCount === 0 && counts.skip === 0
        ? t.importDoneTitle
        : summary.okCount === 0 && summary.failCount > 0
          ? t.importFailedTitle
          : t.importPartialTitle;

    showToast(
      `${fmt(t.importDoneWithSkip, {
        ok: summary.okCount,
        fail: summary.failCount,
        skip: counts.skip,
      })} · ${fmt(t.importElapsed, {
        time: formatImportDuration(elapsedMs),
      })}`,
      { type: toastType, title: toastTitle },
    );
  } catch (err) {
    const elapsedMs = Math.round(performance.now() - startedAt);
    setImportStep(root, 'done');
    const message = err instanceof Error ? err.message : String(err);
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.innerHTML = `
        <div class="bdt-stage__orb bdt-stage__orb--fail" aria-hidden="true"></div>
        <h3 class="bdt-stage__title">${escapeHtml(t.importFailedTitle)}</h3>
        <p class="bdt-stage__text">${escapeHtml(message)}</p>
        <p class="bdt-stage__meta">${escapeHtml(
          fmt(t.importElapsedLabel, {
            time: formatImportDuration(elapsedMs),
          }),
        )}</p>
      `;
    }
    renderImportErrors(root, [
      {
        kind: 'error',
        text: message,
        detail: message,
      },
    ]);
    finishImportLog(root, {
      ...counts,
      elapsedMs,
      doneTitle: t.importFailedTitle,
    });
    showToast(message, { type: 'error', title: t.importFailedTitle });
  } finally {
    syncImportButton(root);
  }
}

/**
 * Match games and open the review stage for a transfer document.
 * @param {HTMLElement} root
 * @param {import('../format/schema.js').TransferDocument} doc
 */
async function runMatchAndReview(root, doc) {
  const runId = ++matchRunId;
  loadedDoc = doc;
  reviewReady = false;
  importReady = false;
  setImportStep(root, 'reading');

  try {
    const total = loadedDoc.entries.length;

    setMatchProgress(root, {
      visible: true,
      current: 0,
      total: 1,
      label: t.importLibraryProgress,
      reset: true,
    });

    let library = null;
    /** @type {string | null} */
    let libraryError = null;
    try {
      library = await loadCurrentUserLibrary({
        shouldCancel: () => runId !== matchRunId,
        onProgress({ listIndex, listTotal, page }) {
          if (runId !== matchRunId) return;
          setMatchProgress(root, {
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

    setMatchProgress(root, {
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
        setMatchProgress(root, {
          visible: true,
          current: index + 1,
          total: tot,
          title: entryDisplayTitle(entry),
        });
      },
    });

    if (runId !== matchRunId) return;

    setMatchProgress(root, { visible: false });
    const analysis = analyzeTransferDocument(loadedDoc, {
      foundCount: matchSummary.foundCount,
      notFoundCount: matchSummary.notFoundCount + matchSummary.errorCount,
      existingCount: matchSummary.existingCount,
    });
    renderSummary(root, analysis);
    renderReadErrors(root, collectReadIssues(matchSummary.results, libraryError));
    reviewReady = true;
    setImportStep(root, 'review');
    renderMatchTable(root, matchSummary.results, {
      importExisting: settings.importExisting === true,
      onSelectionChange(selected) {
        syncImportButton(root, selected);
      },
      onImportExistingChange(enabled) {
        saveSettings({ ...settings, importExisting: enabled });
        reloadRuntimeSettings();
      },
    });
    syncImportButton(root);
    syncCacheTabBadge(root);
    showToast(
      fmt(t.importAnalyzedWithCache, {
        count: analysis.total,
        found: analysis.foundCount,
        missing: analysis.notFoundCount,
        cached: matchSummary.cacheHitCount || 0,
      }),
      {
        type: analysis.notFoundCount ? 'warning' : 'success',
        title: t.importAnalyzedTitle,
      },
    );
  } catch (err) {
    if (runId !== matchRunId) return;
    resetAnalysisUi(root);
    if (importFormat === 'csv' && csvData) {
      mappingReady = true;
      setImportStep(root, 'mapping');
    } else {
      setImportStep(root, 'file');
    }
    showToast(err instanceof Error ? err.message : String(err), {
      type: 'error',
      title: t.importReadFailedTitle,
    });
  } finally {
    if (runId === matchRunId) {
      setMatchProgress(root, { visible: false });
      syncActionButtons(root);
    }
  }
}

function formatAccept(format) {
  return format === 'csv' ? '.csv,text/csv' : '.json,application/json';
}

function clearPendingFile(root) {
  pendingFile = null;
  csvData = null;
  csvMapping = {};
  csvValueMaps = { status: {}, rating: {}, platform: {} };
  const input = root.querySelector('[data-bdt-file]');
  if (input) input.value = '';
  updateDropzoneUi(root);
  resetAnalysisUi(root);
  setImportStep(root, 'file');
  syncActionButtons(root);
}

function syncActionButtons(root) {
  const analyzeBtn = root.querySelector('[data-bdt-analyze]');
  const exampleBtn = root.querySelector('[data-bdt-example]');
  const csvStub = root.querySelector('[data-bdt-csv-stub]');
  const isCsv = importFormat === 'csv';

  if (csvStub) csvStub.hidden = true;
  if (exampleBtn) exampleBtn.hidden = isCsv;
  if (analyzeBtn) {
    analyzeBtn.disabled = !pendingFile;
    analyzeBtn.textContent = isCsv ? t.importAnalyzeMap : t.importAnalyzeContinue;
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
 * Formats currently available for import selection.
 * @type {ReadonlySet<string>}
 */
const READY_IMPORT_FORMATS = new Set(['json', 'csv']);

/**
 * @param {HTMLElement} root
 * @param {'json' | 'csv'} format
 */
function setImportFormat(root, format) {
  const next = format === 'csv' ? 'csv' : 'json';
  if (!READY_IMPORT_FORMATS.has(next)) {
    showToast(t.importCsvStub, { type: 'warning', title: t.toastCsvSoonTitle });
    return;
  }

  importFormat = next;
  saveSettings({ ...settings, importFormat });
  reloadRuntimeSettings();
  syncFormatCards(root);

  const input = root.querySelector('[data-bdt-file]');
  if (input) input.accept = formatAccept(importFormat);

  clearPendingFile(root);
}

/**
 * @param {HTMLElement} root
 */
function syncFormatCards(root) {
  root.querySelectorAll('[data-bdt-format]').forEach((btn) => {
    const format = btn.getAttribute('data-bdt-format') || '';
    const ready = READY_IMPORT_FORMATS.has(format);
    const active = ready && format === importFormat;

    btn.classList.toggle('is-active', active);
    btn.classList.toggle('is-disabled', !ready);
    btn.disabled = !ready;
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
    btn.setAttribute('aria-disabled', ready ? 'false' : 'true');
    if (!ready) {
      btn.setAttribute('title', t.importCsvStub);
    } else {
      btn.removeAttribute('title');
    }
  });
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

  const onReview = importStep === 'review';
  importBtn.hidden = !onReview || !loadedDoc;
  if (importBtn.hidden) return;

  const count =
    selectedCount != null
      ? selectedCount
      : getSelectedMatchIndices(root).length;
  importBtn.textContent = fmt(t.importStartSelected, { count });
  importBtn.disabled = count === 0 || importStep === 'importing';
}

export function openPanel(tab = 'import') {
  closePanel();
  reloadRuntimeSettings();
  pendingFile = null;
  loadedDoc = null;
  csvData = null;
  csvMapping = {};
  csvValueMaps = { status: {}, rating: {}, platform: {} };
  importStep = 'file';
  mappingReady = false;
  reviewReady = false;
  importReady = false;
  importFormat = READY_IMPORT_FORMATS.has(settings.importFormat)
    ? settings.importFormat
    : 'json';

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
        <button
          type="button"
          class="bdt-tab is-locked"
          data-bdt-tab="export"
          data-bdt-tab-locked="true"
          role="tab"
          aria-disabled="true"
          title="${escapeAttr(t.exportSoonBody)}"
        >
          ${escapeHtml(t.tabExport)}
          <span class="bdt-tab__badge bdt-tab__badge--soon">${escapeHtml(t.exportLockedBadge)}</span>
        </button>
        <button type="button" class="bdt-tab" data-bdt-tab="history" role="tab">
          ${escapeHtml(t.tabHistory)}
          <span class="bdt-tab__badge" data-bdt-history-badge hidden>0</span>
        </button>
        <button type="button" class="bdt-tab" data-bdt-tab="cache" role="tab">
          ${escapeHtml(t.tabCache)}
          <span class="bdt-tab__badge" data-bdt-cache-badge>0%</span>
        </button>
        <button type="button" class="bdt-tab" data-bdt-tab="about" role="tab">${escapeHtml(t.tabAbout)}</button>
      </nav>
      <div class="bdt-panel__body">
        <section class="bdt-tab-panel bdt-import" data-bdt-panel="import" hidden>
          <ol class="bdt-steps" data-bdt-steps>
            <li class="bdt-steps__item">
              <button type="button" class="bdt-steps__btn is-current" data-bdt-step="file">
                <span class="bdt-steps__index">1</span>
                <span class="bdt-steps__label">${escapeHtml(t.importStepFile)}</span>
              </button>
            </li>
            <li class="bdt-steps__item" hidden>
              <button type="button" class="bdt-steps__btn" data-bdt-step="mapping" disabled>
                <span class="bdt-steps__index">2</span>
                <span class="bdt-steps__label">${escapeHtml(t.importStepMap)}</span>
              </button>
            </li>
            <li class="bdt-steps__item">
              <button type="button" class="bdt-steps__btn" data-bdt-step="review" disabled>
                <span class="bdt-steps__index" data-bdt-step-index="review">2</span>
                <span class="bdt-steps__label">${escapeHtml(t.importStepReview)}</span>
              </button>
            </li>
            <li class="bdt-steps__item">
              <button type="button" class="bdt-steps__btn" data-bdt-step="import" disabled>
                <span class="bdt-steps__index" data-bdt-step-index="import">3</span>
                <span class="bdt-steps__label">${escapeHtml(t.importStepImport)}</span>
              </button>
            </li>
          </ol>

          <div class="bdt-stages">
            <div class="bdt-stage is-active is-enter" data-bdt-stage="file">
              <p class="bdt-stage__lead">${escapeHtml(t.importStepFileLead)}</p>

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
                  <button
                    type="button"
                    class="bdt-format-card"
                    data-bdt-format="csv"
                    role="radio"
                    aria-checked="false"
                  >
                    <span class="bdt-format-card__icon" aria-hidden="true"><i class="fa-solid fa-align-right"></i></span>
                    <span class="bdt-format-card__body">
                      <span class="bdt-format-card__top">
                        <span class="bdt-format-card__title">${escapeHtml(t.importFormatCsv)}</span>
                        <span class="bdt-format-card__badge bdt-format-card__badge--ready">${escapeHtml(t.importFormatCsvBadge)}</span>
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

              <div class="bdt-stage__footer">
                <button type="button" class="bdt-btn bdt-btn--ghost" data-bdt-example>${escapeHtml(t.importDownloadExample)}</button>
                <button type="button" class="bdt-btn bdt-btn--primary" data-bdt-analyze disabled>${escapeHtml(t.importAnalyzeContinue)}</button>
              </div>
            </div>

            <div class="bdt-stage" data-bdt-stage="mapping" hidden>
              <p class="bdt-stage__lead">${escapeHtml(t.importStepMapLead)}</p>
              <div class="bdt-csv-map-host" data-bdt-csv-map hidden></div>
              <div class="bdt-stage__footer bdt-stage__footer--sticky">
                <button type="button" class="bdt-btn bdt-btn--ghost" data-bdt-back-file-map>${escapeHtml(t.importBack)}</button>
                <button type="button" class="bdt-btn bdt-btn--primary" data-bdt-csv-continue>${escapeHtml(t.csvMapContinue)}</button>
              </div>
            </div>

            <div class="bdt-stage" data-bdt-stage="reading" hidden>
              <div class="bdt-stage__hero">
                <div class="bdt-stage__orb" aria-hidden="true"></div>
                <h3 class="bdt-stage__title">${escapeHtml(t.importStepReadingTitle)}</h3>
                <p class="bdt-stage__text">${escapeHtml(t.importStepReadingLead)}</p>
              </div>
              <div class="bdt-progress" data-bdt-progress hidden></div>
              <div class="bdt-stage__footer">
                <button type="button" class="bdt-btn bdt-btn--ghost" data-bdt-cancel-read>${escapeHtml(t.importCancelRead)}</button>
              </div>
            </div>

            <div class="bdt-stage" data-bdt-stage="review" hidden>
              <p class="bdt-stage__lead">${escapeHtml(t.importStepReviewLead)}</p>
              <div class="bdt-summary" data-bdt-summary hidden></div>
              <div class="bdt-errors" data-bdt-errors hidden></div>
              <div class="bdt-match-wrap" data-bdt-match-table hidden></div>
              <div class="bdt-stage__footer bdt-stage__footer--sticky">
                <button type="button" class="bdt-btn bdt-btn--ghost" data-bdt-back-file>${escapeHtml(t.importBack)}</button>
                <button type="button" class="bdt-btn bdt-btn--primary" data-bdt-import hidden>${escapeHtml(t.importStart)}</button>
              </div>
            </div>

            <div class="bdt-stage" data-bdt-stage="import" hidden>
              <div class="bdt-auth-gate" data-bdt-import-auth hidden></div>
              <div class="bdt-stage__hero" data-bdt-import-status></div>
              <div class="bdt-errors" data-bdt-import-errors hidden></div>
              <div class="bdt-import-log" data-bdt-log hidden></div>
              <div class="bdt-stage__footer">
                <button type="button" class="bdt-btn bdt-btn--ghost" data-bdt-back-review>${escapeHtml(t.importBackReview)}</button>
                <button type="button" class="bdt-btn bdt-btn--primary" data-bdt-restart>${escapeHtml(t.importRestart)}</button>
              </div>
            </div>
          </div>
        </section>
        <section class="bdt-tab-panel" data-bdt-panel="export" hidden>
          <div class="bdt-export-locked">
            <div class="bdt-export-locked__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
                <path d="M12 3v11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
                <path d="M7.5 8.5 12 4l4.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M5 20h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
              </svg>
            </div>
            <h3 class="bdt-export-locked__title">${escapeHtml(t.exportLockedTitle)}</h3>
            <p class="bdt-export-locked__text">${escapeHtml(t.exportLockedLead)}</p>
            <span class="bdt-export-locked__badge">${escapeHtml(t.exportLockedBadge)}</span>
          </div>
        </section>
        <section class="bdt-tab-panel" data-bdt-panel="history" hidden></section>
        <section class="bdt-tab-panel" data-bdt-panel="cache" hidden></section>
        <section class="bdt-tab-panel" data-bdt-panel="about" hidden>
          <div class="bdt-about">
            <div class="bdt-about__hero">
              <div class="bdt-about__hero-text">
                <p class="bdt-about__eyebrow">${escapeHtml(t.aboutEyebrow)}</p>
                <h3 class="bdt-about__title">${escapeHtml(t.panelTitle)}</h3>
                <p class="bdt-about__body">${escapeHtml(t.aboutBody)}</p>
              </div>
              <span class="bdt-about__version">v${escapeHtml(SCRIPT_VERSION)}</span>
            </div>

            <ul class="bdt-about__points">
              <li>${escapeHtml(t.aboutPointImport)}</li>
              <li>${escapeHtml(t.aboutPointFormat)}</li>
              <li>${escapeHtml(t.aboutPointExport)}</li>
            </ul>

            <div class="bdt-about__links">
              <a class="bdt-about__link" href="${escapeAttr(REPO_URL)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.aboutRepo)}</a>
              <a class="bdt-about__link" href="${escapeAttr(`${REPO_URL}/blob/main/docs/transfer-format.md`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.aboutFormat)}</a>
              <a class="bdt-about__link" href="${escapeAttr(`${REPO_URL}/issues`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.aboutIssues)}</a>
            </div>

            <article class="bdt-author">
              <img
                class="bdt-author__avatar"
                src="${escapeAttr(AUTHOR.avatarUrl)}"
                alt=""
                width="72"
                height="72"
                loading="lazy"
                decoding="async"
              />
              <div class="bdt-author__body">
                <p class="bdt-author__label">${escapeHtml(t.aboutAuthorLabel)}</p>
                <h4 class="bdt-author__name">${escapeHtml(AUTHOR.name)}</h4>
                <p class="bdt-author__handle">@${escapeHtml(AUTHOR.handle)}</p>
                <a class="bdt-author__email" href="mailto:${escapeAttr(AUTHOR.email)}">${escapeHtml(AUTHOR.email)}</a>
                <div class="bdt-author__links">
                  <a href="${escapeAttr(AUTHOR.githubUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.aboutAuthorGithub)}</a>
                  <a href="${escapeAttr(AUTHOR.backloggdUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.aboutAuthorBackloggd)}</a>
                  <a href="${escapeAttr(AUTHOR.profileUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t.aboutAuthorProfile)}</a>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  lockPageScroll();
  syncHistoryTabBadge(backdrop);
  syncCacheTabBadge(backdrop);

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
      const format = btn.getAttribute('data-bdt-format') === 'csv' ? 'csv' : 'json';
      if (!READY_IMPORT_FORMATS.has(format) || btn.disabled) {
        showToast(t.importCsvStub, { type: 'warning', title: t.toastCsvSoonTitle });
        return;
      }
      setImportFormat(backdrop, format);
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

  backdrop.querySelectorAll('[data-bdt-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-bdt-step');
      if (target === 'file') {
        if (importStep === 'reading' || importStep === 'importing') {
          matchRunId += 1;
        }
        if (importStep !== 'file') {
          goBackToFile(backdrop);
        } else {
          setImportStep(backdrop, 'file');
        }
        return;
      }
      if (target === 'mapping' && mappingReady && importFormat === 'csv') {
        goBackToMapping(backdrop);
        return;
      }
      if (target === 'review' && reviewReady) {
        goBackToReview(backdrop);
        return;
      }
      if (target === 'import' && importReady) {
        setImportStep(backdrop, 'done');
      }
    });
  });

  backdrop.querySelector('[data-bdt-back-file]')?.addEventListener('click', () => {
    if (importFormat === 'csv' && csvData) {
      goBackToMapping(backdrop);
      return;
    }
    goBackToFile(backdrop);
  });
  backdrop.querySelector('[data-bdt-back-file-map]')?.addEventListener('click', () => {
    goBackToFile(backdrop);
  });
  backdrop.querySelector('[data-bdt-back-review]')?.addEventListener('click', () => {
    goBackToReview(backdrop);
  });
  backdrop.querySelector('[data-bdt-restart]')?.addEventListener('click', () => {
    clearPendingFile(backdrop);
  });
  backdrop.querySelector('[data-bdt-cancel-read]')?.addEventListener('click', () => {
    matchRunId += 1;
    resetAnalysisUi(backdrop);
    if (importFormat === 'csv' && csvData) {
      mappingReady = true;
      renderCsvMapping(backdrop, {
        headers: csvData.headers,
        rows: csvData.rows,
        mapping: csvMapping,
        valueMaps: csvValueMaps,
        filename: pendingFile?.name,
        onChange(next) {
          csvMapping = next.mapping;
          csvValueMaps = next.valueMaps;
        },
      });
      setImportStep(backdrop, 'mapping');
    } else {
      setImportStep(backdrop, 'file');
    }
    syncActionButtons(backdrop);
    showToast(t.importReadCancelled, {
      type: 'info',
      title: t.importCancelRead,
    });
  });

  backdrop.querySelector('[data-bdt-csv-continue]')?.addEventListener('click', async () => {
    if (!csvData) {
      showToast(t.importNeedFile, { type: 'warning', title: t.importNeedFileTitle });
      return;
    }
    csvMapping = readCsvMapping(backdrop);
    csvValueMaps = readCsvValueMaps(backdrop);
    rememberCsvValueMaps(csvValueMaps);
    const built = buildTransferFromCsv({
      rows: csvData.rows,
      mapping: csvMapping,
      valueMaps: csvValueMaps,
      filename: pendingFile?.name,
    });
    if (!built.ok) {
      showToast(built.error, { type: 'warning', title: t.csvMapInvalidTitle });
      return;
    }
    await runMatchAndReview(backdrop, built.value);
  });

  const analyzeBtn = backdrop.querySelector('[data-bdt-analyze]');
  analyzeBtn?.addEventListener('click', async () => {
    if (!pendingFile) {
      showToast(t.importNeedFile, { type: 'warning', title: t.importNeedFileTitle });
      return;
    }

    analyzeBtn.disabled = true;
    reviewReady = false;
    importReady = false;

    try {
      const text = await readFileAsText(pendingFile);

      if (importFormat === 'csv') {
        const parsed = parseCsv(text);
        if (!parsed.headers.length || !parsed.rowCount) {
          showToast(t.csvEmptyError, { type: 'error', title: t.importInvalidTitle });
          return;
        }
        csvData = parsed;
        csvMapping = suggestCsvMapping(parsed.headers);
        csvValueMaps = { status: {}, rating: {}, platform: {} };
        mappingReady = true;
        renderCsvMapping(backdrop, {
          headers: parsed.headers,
          rows: parsed.rows,
          mapping: csvMapping,
          valueMaps: csvValueMaps,
          filename: pendingFile.name,
          onChange(next) {
            csvMapping = next.mapping;
            csvValueMaps = next.valueMaps;
          },
        });
        setImportStep(backdrop, 'mapping');
        showToast(
          fmt(t.csvMapReady, { count: parsed.rowCount }),
          { type: 'success', title: t.csvMapReadyTitle },
        );
        return;
      }

      const parsed = parseTransferDocument(text);
      if (!parsed.ok) {
        resetAnalysisUi(backdrop);
        setImportStep(backdrop, 'file');
        showToast(fmt(t.importInvalid, { error: parsed.error }), {
          type: 'error',
          title: t.importInvalidTitle,
        });
        return;
      }
      await runMatchAndReview(backdrop, parsed.value);
    } catch (err) {
      resetAnalysisUi(backdrop);
      setImportStep(backdrop, 'file');
      showToast(err instanceof Error ? err.message : String(err), {
        type: 'error',
        title: t.importReadFailedTitle,
      });
    } finally {
      syncActionButtons(backdrop);
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

    const importEntries = loadedDoc.entries.filter((entry, index) => {
      if (!selectedIndices.has(index)) return false;
      if (entry.game_id == null) return false;
      return true;
    });

    if (!importEntries.length) {
      showToast(t.importNeedResolvable, {
        type: 'warning',
        title: t.importNeedResolvableTitle,
      });
      return;
    }

    const importDoc = {
      ...loadedDoc,
      entries: importEntries,
    };

    if (!isLoggedIn()) {
      const importBtn = backdrop.querySelector('[data-bdt-import]');
      if (importBtn) importBtn.disabled = true;
      showImportAuthGate(backdrop, {
        title: t.importNeedLoginTitle,
        body: t.importNeedLoginBody,
      });
      syncImportButton(backdrop);
      return;
    }

    if (!getCsrfToken()) {
      const importBtn = backdrop.querySelector('[data-bdt-import]');
      if (importBtn) importBtn.disabled = true;
      showImportAuthGate(backdrop, {
        title: t.importNeedLoginTitle,
        body: t.importNeedCsrfBody,
      });
      syncImportButton(backdrop);
      return;
    }

    if (findBackloggdUserId() == null) {
      const importBtn = backdrop.querySelector('[data-bdt-import]');
      if (importBtn) importBtn.disabled = true;
      showImportUserIdGate(backdrop, importDoc);
      syncImportButton(backdrop);
      return;
    }

    await runImport(backdrop, importDoc);
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
  syncFormatCards(backdrop);
  updateDropzoneUi(backdrop);
  syncActionButtons(backdrop);
  setImportStep(backdrop, 'file');

  selectTab(backdrop, tab);
}

function selectTab(backdrop, tab) {
  const tabBtn = backdrop.querySelector(`[data-bdt-tab="${tab}"]`);
  if (
    tabBtn?.getAttribute('data-bdt-tab-locked') === 'true' ||
    tabBtn?.classList.contains('is-locked')
  ) {
    showToast(t.exportSoonBody, {
      type: 'warning',
      title: t.exportSoonTitle,
    });
    return;
  }

  backdrop.querySelectorAll('[data-bdt-tab]').forEach((btn) => {
    btn.classList.toggle('is-active', btn.getAttribute('data-bdt-tab') === tab);
  });
  backdrop.querySelectorAll('[data-bdt-panel]').forEach((panel) => {
    panel.hidden = panel.getAttribute('data-bdt-panel') !== tab;
  });
  if (tab === 'history') {
    renderHistoryPanel(backdrop);
  }
  if (tab === 'cache') {
    renderCachePanel(backdrop);
  }
}

export function closePanel() {
  document.getElementById(PANEL_ID)?.remove();
  unlockPageScroll();
  pendingFile = null;
  loadedDoc = null;
  csvData = null;
  csvMapping = {};
  csvValueMaps = { status: {}, rating: {}, platform: {} };
  importStep = 'file';
  mappingReady = false;
  reviewReady = false;
  importReady = false;
  matchRunId += 1;
}
