import { escapeHtml } from '../utils/html.js';

const HOST_ID = 'bdt-toast-host';
const DEFAULT_MS = 3800;
const MAX_VISIBLE = 4;

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

/**
 * @param {string} message
 * @param {{ type?: 'info' | 'success' | 'warning' | 'error', duration?: number }} [options]
 */
export function showToast(message, options = {}) {
  const text = String(message || '').trim();
  if (!text) return null;

  const type = ['info', 'success', 'warning', 'error'].includes(options.type)
    ? options.type
    : 'info';
  const duration =
    Number.isFinite(options.duration) && options.duration > 0
      ? options.duration
      : DEFAULT_MS;

  const host = ensureHost();
  while (host.children.length >= MAX_VISIBLE) {
    dismissToast(host.firstElementChild);
  }

  const el = document.createElement('div');
  el.className = `bdt-toast bdt-toast--${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="bdt-toast__text">${escapeHtml(text)}</span>`;
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
