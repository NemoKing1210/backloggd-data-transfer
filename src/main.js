import {
  GM_registerMenuCommand,
} from '$';
import { initGameCache } from './cache/games.js';
import './styles/main.css';
import { ROOT_ATTR } from './constants.js';
import { ensureNavButton, openPanel } from './features/panel.js';
import {
  bindSpaNavigation,
  isBackloggdHost,
  observeDom,
} from './features/spa.js';
import { reloadRuntimeSettings, t } from './state.js';

function scanPage() {
  ensureNavButton();
}

function init() {
  if (document.documentElement.hasAttribute(ROOT_ATTR)) return;
  document.documentElement.setAttribute(ROOT_ATTR, '1');

  reloadRuntimeSettings();
  initGameCache();

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand(t.menuOpen, () => openPanel());
  }

  if (!isBackloggdHost()) return;

  scanPage();
  observeDom(scanPage);
  bindSpaNavigation(scanPage);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
