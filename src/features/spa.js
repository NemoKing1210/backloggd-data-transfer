import { SCAN_DEBOUNCE_MS } from '../constants.js';
import { debounce } from '../utils/debounce.js';

export function isBackloggdHost() {
  const host = location.hostname.replace(/^www\./, '');
  return host === 'backloggd.com';
}

export function observeDom(onChange) {
  const scheduled = debounce(onChange, SCAN_DEBOUNCE_MS);
  const observer = new MutationObserver(() => scheduled());
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
  return observer;
}

export function bindSpaNavigation(onNavigate) {
  const fire = debounce(onNavigate, SCAN_DEBOUNCE_MS);
  window.addEventListener('popstate', fire);
  document.addEventListener('turbo:load', fire);
  document.addEventListener('turbo:render', fire);
}
