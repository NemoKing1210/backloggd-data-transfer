import { fmt } from '../i18n/index.js';
import { escapeHtml } from '../utils/html.js';
import { t } from '../state.js';

/**
 * @typedef {'ok' | 'fail' | 'skip' | 'pending' | 'active'} ImportLogKind
 *
 * @typedef {{
 *   ok: number,
 *   fail: number,
 *   skip: number,
 *   total: number,
 *   elapsedMs?: number,
 * }} ImportLogCounts
 */

/**
 * Human-readable duration for import summary.
 * @param {number} ms
 */
export function formatImportDuration(ms) {
  const totalMs = Math.max(0, Math.round(Number(ms) || 0));
  const totalSec = Math.floor(totalMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const tenths = Math.floor((totalMs % 1000) / 100);

  if (hours > 0) {
    return fmt(t.importDurationHms, {
      hours,
      minutes: String(minutes).padStart(2, '0'),
      seconds: String(seconds).padStart(2, '0'),
    });
  }
  if (minutes > 0) {
    return fmt(t.importDurationMs, {
      minutes,
      seconds: String(seconds).padStart(2, '0'),
    });
  }
  if (totalSec < 10 && totalMs > 0) {
    return fmt(t.importDurationSecFrac, {
      seconds: `${seconds}.${tenths}`,
    });
  }
  return fmt(t.importDurationSec, { seconds: totalSec });
}

/**
 * Mount / reset the live import log panel.
 * @param {HTMLElement} root
 * @param {{ total: number }} options
 */
export function beginImportLog(root, options) {
  const el = root.querySelector('[data-bdt-log]');
  if (!el) return null;

  const total = Math.max(0, Number(options.total) || 0);
  el.hidden = false;
  el.className = 'bdt-import-log';
  el.innerHTML = `
    <div class="bdt-import-log__now" data-bdt-import-now>
      <div class="bdt-import-log__now-top">
        <span class="bdt-import-log__eyebrow">${escapeHtml(t.importLogNowLabel)}</span>
        <span class="bdt-import-log__counter" data-bdt-import-counter>0 / ${escapeHtml(String(total))}</span>
      </div>
      <strong class="bdt-import-log__title" data-bdt-import-now-title>${escapeHtml(t.importLogWaiting)}</strong>
      <p class="bdt-import-log__hint" data-bdt-import-now-hint>${escapeHtml(
        fmt(t.importLogNowHint, { count: total }),
      )}</p>
    </div>

    <div class="bdt-import-log__progress">
      <div class="bdt-import-log__progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-bdt-import-track>
        <div class="bdt-import-log__progress-fill" data-bdt-import-fill style="width:0%"></div>
      </div>
      <strong class="bdt-import-log__pct" data-bdt-import-pct>0%</strong>
    </div>

    <div class="bdt-import-log__stats" data-bdt-import-stats>
      ${statChip('ok', 0, t.importLogStatOk)}
      ${statChip('fail', 0, t.importLogStatFail)}
      ${statChip('skip', 0, t.importLogStatSkip)}
      ${statChip('left', total, t.importLogStatLeft)}
    </div>

    <p class="bdt-import-log__elapsed" data-bdt-import-elapsed hidden></p>

    <ul class="bdt-import-log__list" data-bdt-import-list aria-live="polite"></ul>
  `;

  return el;
}

/**
 * Update the “current game” header before a request starts.
 * @param {HTMLElement} root
 * @param {{ index: number, total: number, title: string }} info
 */
export function setImportLogCurrent(root, info) {
  const el = root.querySelector('[data-bdt-log]');
  if (!el || el.hidden) return;

  const titleEl = el.querySelector('[data-bdt-import-now-title]');
  const hintEl = el.querySelector('[data-bdt-import-now-hint]');
  const counterEl = el.querySelector('[data-bdt-import-counter]');
  const now = el.querySelector('[data-bdt-import-now]');

  if (titleEl) titleEl.textContent = info.title || t.importLogWaiting;
  if (hintEl) {
    hintEl.textContent = fmt(t.importLogWriting, {
      index: info.index + 1,
      total: info.total,
    });
  }
  if (counterEl) {
    counterEl.textContent = `${info.index + 1} / ${info.total}`;
  }
  now?.classList.add('is-active');
  now?.classList.remove('is-done', 'is-fail', 'is-warn');
}

/**
 * Append a finished row and refresh counters / progress.
 * @param {HTMLElement} root
 * @param {{
 *   index: number,
 *   total: number,
 *   title: string,
 *   kind: ImportLogKind,
 *   detail?: string,
 *   counts: ImportLogCounts,
 * }} info
 */
export function appendImportLogResult(root, info) {
  const el = root.querySelector('[data-bdt-log]');
  if (!el || el.hidden) return;

  const list = el.querySelector('[data-bdt-import-list]');
  if (list) {
    const li = document.createElement('li');
    li.className = `bdt-import-log__item is-${info.kind}`;
    li.innerHTML = `
      <span class="bdt-import-log__item-index">#${escapeHtml(String(info.index + 1))}</span>
      <span class="bdt-import-log__item-title">${escapeHtml(info.title || '—')}</span>
      <span class="bdt-import-log__item-status">${escapeHtml(statusLabel(info.kind, info.detail))}</span>
    `;
    list.appendChild(li);
    list.scrollTop = list.scrollHeight;
  }

  syncImportLogCounts(el, info.counts);
  setImportLogProgress(el, info.counts);
}

/**
 * Finalize the header after import completes.
 * @param {HTMLElement} root
 * @param {ImportLogCounts & { doneTitle?: string }} counts
 */
export function finishImportLog(root, counts) {
  const el = root.querySelector('[data-bdt-log]');
  if (!el || el.hidden) return;

  const titleEl = el.querySelector('[data-bdt-import-now-title]');
  const hintEl = el.querySelector('[data-bdt-import-now-hint]');
  const now = el.querySelector('[data-bdt-import-now]');
  const done = (counts.ok || 0) + (counts.fail || 0) + (counts.skip || 0);

  if (titleEl) {
    titleEl.textContent = counts.doneTitle || t.importLogFinished;
  }
  if (hintEl) {
    const summary = fmt(t.importDoneWithSkip, {
      ok: counts.ok || 0,
      fail: counts.fail || 0,
      skip: counts.skip || 0,
    });
    hintEl.textContent =
      counts.elapsedMs != null
        ? `${summary} · ${fmt(t.importElapsed, {
            time: formatImportDuration(counts.elapsedMs),
          })}`
        : summary;
  }

  const counterEl = el.querySelector('[data-bdt-import-counter]');
  if (counterEl) {
    counterEl.textContent = `${done} / ${counts.total || done}`;
  }

  const elapsedEl = el.querySelector('[data-bdt-import-elapsed]');
  if (elapsedEl && counts.elapsedMs != null) {
    elapsedEl.hidden = false;
    elapsedEl.textContent = fmt(t.importElapsedLabel, {
      time: formatImportDuration(counts.elapsedMs),
    });
  }

  now?.classList.remove('is-active');
  if ((counts.fail || 0) > 0 && (counts.ok || 0) === 0) {
    now?.classList.add('is-fail');
  } else if ((counts.fail || 0) > 0 || (counts.skip || 0) > 0) {
    now?.classList.add('is-warn');
  } else {
    now?.classList.add('is-done');
  }

  syncImportLogCounts(el, counts);
  setImportLogProgress(el, {
    ok: counts.ok || 0,
    fail: counts.fail || 0,
    skip: counts.skip || 0,
    total: counts.total || done,
  });
}

/**
 * Clear / hide the import log.
 * @param {HTMLElement} root
 */
export function clearImportLog(root) {
  const el = root.querySelector('[data-bdt-log]');
  if (!el) return;
  el.hidden = true;
  el.className = 'bdt-import-log';
  el.innerHTML = '';
}

/**
 * @param {HTMLElement} el
 * @param {ImportLogCounts} counts
 */
function syncImportLogCounts(el, counts) {
  const stats = el.querySelector('[data-bdt-import-stats]');
  if (!stats) return;
  const left = Math.max(
    0,
    (counts.total || 0) - (counts.ok || 0) - (counts.fail || 0) - (counts.skip || 0),
  );
  stats.innerHTML = `
    ${statChip('ok', counts.ok || 0, t.importLogStatOk)}
    ${statChip('fail', counts.fail || 0, t.importLogStatFail)}
    ${statChip('skip', counts.skip || 0, t.importLogStatSkip)}
    ${statChip('left', left, t.importLogStatLeft)}
  `;
}

/**
 * @param {HTMLElement} el
 * @param {ImportLogCounts} counts
 */
function setImportLogProgress(el, counts) {
  const total = Math.max(1, Number(counts.total) || 1);
  const done = Math.min(
    total,
    (counts.ok || 0) + (counts.fail || 0) + (counts.skip || 0),
  );
  const pct = Math.round((done / total) * 100);
  const fill = /** @type {HTMLElement | null} */ (
    el.querySelector('[data-bdt-import-fill]')
  );
  const track = el.querySelector('[data-bdt-import-track]');
  const pctEl = el.querySelector('[data-bdt-import-pct]');
  if (fill) fill.style.width = `${pct}%`;
  if (track) track.setAttribute('aria-valuenow', String(pct));
  if (pctEl) pctEl.textContent = `${pct}%`;
}

/**
 * @param {string} kind
 * @param {number} value
 * @param {string} label
 */
function statChip(kind, value, label) {
  return `
    <span class="bdt-import-log__stat bdt-import-log__stat--${escapeHtml(kind)}">
      <strong>${escapeHtml(String(value))}</strong>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

/**
 * @param {ImportLogKind} kind
 * @param {string} [detail]
 */
function statusLabel(kind, detail) {
  if (kind === 'ok') return t.importLogOk;
  if (kind === 'skip') {
    return detail
      ? fmt(t.importLogSkipDetail, { reason: detail })
      : t.importLogSkip;
  }
  if (kind === 'fail') {
    return detail
      ? fmt(t.importLogFail, { error: detail })
      : t.importLogFailGeneric;
  }
  return kind;
}
