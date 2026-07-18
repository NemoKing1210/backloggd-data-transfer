import {
  MATCH_CONCURRENCY_MAX,
  MATCH_CONCURRENCY_MIN,
} from '../constants.js';
import { LOCALE_NATIVE_NAMES, SUPPORTED_LOCALES, fmt } from '../i18n/index.js';
import { saveSettings } from '../settings.js';
import { reloadRuntimeSettings, settings, t } from '../state.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
import { showToast } from './toast.js';

/**
 * @param {HTMLElement} root
 * @param {{ onLocaleChange?: () => void, onSettingsChange?: (next: typeof settings) => void }} [options]
 */
export function renderSettingsPanel(root, options = {}) {
  const panel = root.querySelector('[data-bdt-panel="settings"]');
  if (!panel) return;

  const localeOptions = [
    `<option value="auto"${settings.uiLocale === 'auto' ? ' selected' : ''}>${escapeHtml(t.settingsLocaleAuto)}</option>`,
    ...SUPPORTED_LOCALES.map((code) => {
      const label = LOCALE_NATIVE_NAMES[code] || code;
      const selected = settings.uiLocale === code ? ' selected' : '';
      return `<option value="${escapeAttr(code)}"${selected}>${escapeHtml(label)}</option>`;
    }),
  ].join('');

  panel.innerHTML = `
    <div class="bdt-settings">
      <div class="bdt-settings__head">
        <h3 class="bdt-settings__title">${escapeHtml(t.settingsTitle)}</h3>
        <p class="bdt-settings__lead">${escapeHtml(t.settingsLead)}</p>
      </div>

      <div class="bdt-settings__grid">
        <label class="bdt-settings__field">
          <span class="bdt-settings__label">${escapeHtml(t.settingsLocale)}</span>
          <select class="bdt-settings__select" data-bdt-setting="uiLocale">
            ${localeOptions}
          </select>
          <span class="bdt-settings__hint">${escapeHtml(t.settingsLocaleHint)}</span>
        </label>

        <label class="bdt-settings__field">
          <span class="bdt-settings__label">${escapeHtml(t.settingsImportDelay)}</span>
          <div class="bdt-settings__inline">
            <input
              type="number"
              class="bdt-settings__input"
              data-bdt-setting="importDelayMs"
              min="0"
              max="15000"
              step="50"
              value="${escapeAttr(String(settings.importDelayMs))}"
            />
            <span class="bdt-settings__suffix">${escapeHtml(t.settingsMs)}</span>
          </div>
          <span class="bdt-settings__hint">${escapeHtml(t.settingsImportDelayHint)}</span>
        </label>

        <label class="bdt-settings__field">
          <span class="bdt-settings__label">${escapeHtml(t.settingsMatchConcurrency)}</span>
          <div class="bdt-settings__inline">
            <input
              type="number"
              class="bdt-settings__input"
              data-bdt-setting="matchConcurrency"
              min="${MATCH_CONCURRENCY_MIN}"
              max="${MATCH_CONCURRENCY_MAX}"
              step="1"
              value="${escapeAttr(String(settings.matchConcurrency))}"
            />
            <span class="bdt-settings__suffix">${escapeHtml(
              fmt(t.settingsMatchConcurrencyRange, {
                min: MATCH_CONCURRENCY_MIN,
                max: MATCH_CONCURRENCY_MAX,
              }),
            )}</span>
          </div>
          <span class="bdt-settings__hint">${escapeHtml(t.settingsMatchConcurrencyHint)}</span>
        </label>

        <div class="bdt-settings__field bdt-settings__field--toggle">
          <label class="bdt-toggle">
            <input
              type="checkbox"
              data-bdt-setting="debugMode"
              ${settings.debugMode ? 'checked' : ''}
            />
            <span class="bdt-toggle__track" aria-hidden="true"></span>
            <span class="bdt-toggle__label">${escapeHtml(t.settingsDebugMode)}</span>
          </label>
          <span class="bdt-settings__hint">${escapeHtml(t.settingsDebugModeHint)}</span>
        </div>
      </div>
    </div>
  `;

  bindSettings(panel, options);
}

/**
 * @param {HTMLElement} panel
 * @param {{ onLocaleChange?: () => void, onSettingsChange?: (next: typeof settings) => void }} options
 */
function bindSettings(panel, options) {
  const root =
    /** @type {HTMLElement} */ (panel.closest('.bdt-panel-backdrop')) || panel;

  const persist = (patch, { reloadLocale = false } = {}) => {
    saveSettings({ ...settings, ...patch });
    reloadRuntimeSettings();
    if (reloadLocale) {
      options.onLocaleChange?.();
      return;
    }
    showToast(t.settingsSaved, { type: 'success', title: t.settingsSavedTitle });
    options.onSettingsChange?.(settings);
    renderSettingsPanel(root, options);
  };

  panel.querySelector('[data-bdt-setting="uiLocale"]')?.addEventListener('change', (e) => {
    const value = /** @type {HTMLSelectElement} */ (e.target).value || 'auto';
    persist({ uiLocale: value }, { reloadLocale: true });
  });

  panel.querySelector('[data-bdt-setting="importDelayMs"]')?.addEventListener('change', (e) => {
    const value = Number(/** @type {HTMLInputElement} */ (e.target).value);
    persist({ importDelayMs: value });
  });

  panel.querySelector('[data-bdt-setting="matchConcurrency"]')?.addEventListener('change', (e) => {
    const value = Number(/** @type {HTMLInputElement} */ (e.target).value);
    persist({ matchConcurrency: value });
  });

  panel.querySelector('[data-bdt-setting="debugMode"]')?.addEventListener('change', (e) => {
    const enabled = Boolean(/** @type {HTMLInputElement} */ (e.target).checked);
    persist({ debugMode: enabled });
  });
}
