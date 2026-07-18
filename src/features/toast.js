import { escapeHtml } from '../utils/html.js';
import { t } from '../state.js';

const HOST_ID = 'bdt-toast-host';
const DEFAULT_MS = 4200;
const MAX_VISIBLE = 4;

const TYPE_ICONS = Object.freeze({
  success: 'fa-solid fa-circle-check',
  warning: 'fa-solid fa-triangle-exclamation',
  error: 'fa-solid fa-circle-xmark',
  info: 'fa-solid fa-circle-info',
});

function ensureHost() {
  let host = document.getElementById(HOST_ID);
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.id = HOST_ID;
  host.className = 'bdt-toast-host';
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-relevant', 'additions');
  (document.body || document.documentElement).appendChild(host);
  return host;
}

function dismissToast(el) {
  if (!el || el.dataset.bdtLeaving === '1') return;
  el.dataset.bdtLeaving = '1';
  el.classList.add('is-leaving');
  const done = () => el.remove();
  el.addEventListener('transitionend', done, { once: true });
  setTimeout(done, 320);
}

function defaultTitle(type) {
  switch (type) {
    case 'success':
      return t.toastTitleSuccess;
    case 'warning':
      return t.toastTitleWarning;
    case 'error':
      return t.toastTitleError;
    default:
      return t.toastTitleInfo;
  }
}

/**
 * @param {string} message
 * @param {{
 *   type?: 'info' | 'success' | 'warning' | 'error',
 *   title?: string,
 *   duration?: number,
 * }} [options]
 */
export function showToast(message, options = {}) {
  const text = String(message || '').trim();
  if (!text) return null;

  const type = ['info', 'success', 'warning', 'error'].includes(options.type)
    ? options.type
    : 'info';
  const title = String(options.title || defaultTitle(type)).trim() || defaultTitle(type);
  const duration =
    Number.isFinite(options.duration) && options.duration > 0
      ? options.duration
      : type === 'error'
        ? 5600
        : DEFAULT_MS;

  const host = ensureHost();
  while (host.children.length >= MAX_VISIBLE) {
    dismissToast(host.firstElementChild);
  }

  const el = document.createElement('div');
  el.className = `bdt-toast bdt-toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `
    <span class="bdt-toast__icon" aria-hidden="true">
      <i class="${TYPE_ICONS[type] || TYPE_ICONS.info}"></i>
    </span>
    <div class="bdt-toast__body">
      <strong class="bdt-toast__title">${escapeHtml(title)}</strong>
      <p class="bdt-toast__text">${escapeHtml(text)}</p>
    </div>
    <button type="button" class="bdt-toast__close" aria-label="${escapeHtml(t.close)}">×</button>
  `;

  el.querySelector('.bdt-toast__close')?.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissToast(el);
  });
  el.addEventListener('click', () => dismissToast(el));
  host.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add('is-in');
  });

  if (duration < Infinity) {
    setTimeout(() => dismissToast(el), duration);
  }
  return el;
}
