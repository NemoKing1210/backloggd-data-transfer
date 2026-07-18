import { entryDisplayTitle } from '../format/schema.js';
import { fmt } from '../i18n/index.js';
import { escapeHtml } from '../utils/html.js';
import { showToast } from './toast.js';
import { t } from '../state.js';

/**
 * @typedef {object} ReadIssue
 * @property {'library' | 'not_found' | 'error'} kind
 * @property {string} text
 * @property {number} [index]
 * @property {string} [title]
 * @property {string} [detail]
 */

/**
 * @param {import('../destinations/backloggd/match.js').EntryMatchResult[]} results
 * @param {string | null} [libraryError]
 * @returns {ReadIssue[]}
 */
export function collectReadIssues(results, libraryError = null) {
  /** @type {ReadIssue[]} */
  const issues = [];

  if (libraryError) {
    issues.push({
      kind: 'library',
      text: fmt(t.importLibraryFailed, { error: libraryError }),
      detail: libraryError,
    });
  }

  for (const row of results || []) {
    const title = entryDisplayTitle(row.entry) || '—';
    const num = row.index + 1;

    if (row.status === 'not_found') {
      issues.push({
        kind: 'not_found',
        index: row.index,
        title,
        text: fmt(t.importReadIssueNotFound, { index: num, title }),
      });
      continue;
    }

    if (row.status === 'error') {
      const detail = row.error || t.importMatchError;
      issues.push({
        kind: 'error',
        index: row.index,
        title,
        detail,
        text: fmt(t.importReadIssueError, {
          index: num,
          title,
          error: detail,
        }),
      });
    }
  }

  return issues;
}

/**
 * @param {HTMLElement} root
 * @param {ReadIssue[]} issues
 */
export function renderReadErrors(root, issues) {
  const el = root.querySelector('[data-bdt-errors]');
  if (!el) return;

  if (!issues.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }

  const lines = issues.map((issue) => issue.text);
  const list = issues
    .map(
      (issue) =>
        `<li class="bdt-errors__item bdt-errors__item--${escapeHtml(issue.kind)}">${escapeHtml(issue.text)}</li>`,
    )
    .join('');

  el.hidden = false;
  el.innerHTML = `
    <details class="bdt-errors__details">
      <summary class="bdt-errors__summary">
        <span class="bdt-errors__summary-main">
          <span class="bdt-errors__title">${escapeHtml(t.importReadErrorsTitle)}</span>
          <span class="bdt-errors__count">${issues.length}</span>
        </span>
        <span class="bdt-errors__chevron" aria-hidden="true"></span>
      </summary>
      <div class="bdt-errors__body">
        <div class="bdt-errors__toolbar">
          <button type="button" class="bdt-btn bdt-btn--ghost bdt-btn--sm" data-bdt-errors-copy>
            ${escapeHtml(t.importReadErrorsCopy)}
          </button>
        </div>
        <ul class="bdt-errors__list">${list}</ul>
      </div>
    </details>
  `;

  const copyBtn = el.querySelector('[data-bdt-errors-copy]');
  copyBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = lines.join('\n');
    try {
      await copyText(payload);
      showToast(t.importReadErrorsCopied, {
        type: 'success',
        title: t.toastCopiedTitle,
      });
    } catch (_) {
      showToast(t.importReadErrorsCopyFail, {
        type: 'error',
        title: t.toastCopyFailTitle,
      });
    }
  });
}

/**
 * @param {HTMLElement} root
 */
export function clearReadErrors(root) {
  const el = root.querySelector('[data-bdt-errors]');
  if (!el) return;
  el.hidden = true;
  el.innerHTML = '';
}

/**
 * @param {string} text
 */
async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}
