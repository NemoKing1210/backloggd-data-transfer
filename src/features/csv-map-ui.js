import {
  CSV_TARGET_FIELDS,
  sampleColumnValues,
  suggestCsvMapping,
} from '../format/csv/map.js';
import { t } from '../state.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';

/**
 * Render CSV column mapping UI.
 * @param {HTMLElement} root
 * @param {{
 *   headers: string[],
 *   rows: Record<string, string>[],
 *   mapping?: Record<string, string>,
 *   filename?: string,
 *   onChange?: (mapping: Record<string, string>) => void,
 * }} options
 */
export function renderCsvMapping(root, options) {
  const host = root.querySelector('[data-bdt-csv-map]');
  if (!host) return;

  const headers = options.headers || [];
  const rows = options.rows || [];
  const mapping = {
    ...suggestCsvMapping(headers),
    ...(options.mapping || {}),
  };

  const mappedCount = CSV_TARGET_FIELDS.filter((f) => mapping[f.key]).length;
  const requiredOk = Boolean(mapping.title);

  host.hidden = false;
  host.innerHTML = `
    <div class="bdt-csv-map">
      <div class="bdt-csv-map__head">
        <div>
          <h3 class="bdt-csv-map__title">${escapeHtml(t.csvMapTitle)}</h3>
          <p class="bdt-csv-map__lead">${escapeHtml(t.csvMapLead)}</p>
        </div>
        <div class="bdt-csv-map__stats">
          <span class="bdt-csv-map__stat">${escapeHtml(
            fmtLocal(t.csvMapFileStat, { file: options.filename || 'file.csv' }),
          )}</span>
          <span class="bdt-csv-map__stat">${escapeHtml(
            fmtLocal(t.csvMapRowsStat, { count: rows.length }),
          )}</span>
          <span class="bdt-csv-map__stat ${requiredOk ? 'is-ok' : 'is-warn'}" data-bdt-csv-mapped-stat>${escapeHtml(
            fmtLocal(t.csvMapMappedStat, {
              mapped: mappedCount,
              total: CSV_TARGET_FIELDS.length,
            }),
          )}</span>
        </div>
      </div>

      <div class="bdt-csv-map__auto">
        <span class="bdt-csv-map__auto-label">${escapeHtml(t.csvMapAutoLabel)}</span>
        <p class="bdt-csv-map__auto-text" data-bdt-csv-auto-text>${escapeHtml(
          requiredOk ? t.csvMapAutoOk : t.csvMapAutoNeedTitle,
        )}</p>
      </div>

      <div class="bdt-csv-map__grid">
        ${CSV_TARGET_FIELDS.map((field) =>
          renderFieldRow(field, headers, rows, mapping[field.key] || ''),
        ).join('')}
      </div>
    </div>
  `;

  host.querySelectorAll('[data-bdt-csv-field]').forEach((select) => {
    select.addEventListener('change', () => {
      const key = select.getAttribute('data-bdt-csv-field') || '';
      const header = /** @type {HTMLSelectElement} */ (select).value || '';
      const row = select.closest('.bdt-csv-map__row');
      if (row) {
        row.classList.toggle('is-mapped', Boolean(header));
        row.classList.toggle(
          'is-missing',
          key === 'title' && !header,
        );
        const pill = row.querySelector('.bdt-csv-map__pill');
        if (pill) {
          if (header) {
            pill.className = 'bdt-csv-map__pill is-mapped';
            pill.textContent = t.csvMapMapped;
          } else if (key === 'title') {
            pill.className = 'bdt-csv-map__pill is-required';
            pill.textContent = t.csvMapRequired;
          } else {
            pill.className = 'bdt-csv-map__pill';
            pill.textContent = t.csvMapOptional;
          }
        }
        const samplesEl = row.querySelector('.bdt-csv-map__samples');
        if (samplesEl) {
          const samples = sampleColumnValues(rows, header);
          samplesEl.innerHTML = samples.length
            ? samples
                .map((s) => `<span class="bdt-csv-map__sample">${escapeHtml(s)}</span>`)
                .join('')
            : `<span class="bdt-csv-map__sample is-empty">${escapeHtml(t.csvMapNoSamples)}</span>`;
        }
      }

      const next = readCsvMapping(root);
      const mappedCount = CSV_TARGET_FIELDS.filter((f) => next[f.key]).length;
      const requiredOk = Boolean(next.title);
      const mappedStat = host.querySelector('[data-bdt-csv-mapped-stat]');
      if (mappedStat) {
        mappedStat.classList.toggle('is-ok', requiredOk);
        mappedStat.classList.toggle('is-warn', !requiredOk);
        mappedStat.textContent = fmtLocal(t.csvMapMappedStat, {
          mapped: mappedCount,
          total: CSV_TARGET_FIELDS.length,
        });
      }
      const autoText = host.querySelector('[data-bdt-csv-auto-text]');
      if (autoText) {
        autoText.textContent = requiredOk ? t.csvMapAutoOk : t.csvMapAutoNeedTitle;
      }

      options.onChange?.(next);
    });
  });
}

/**
 * @param {HTMLElement} root
 * @returns {Record<string, string>}
 */
export function readCsvMapping(root) {
  /** @type {Record<string, string>} */
  const mapping = {};
  for (const field of CSV_TARGET_FIELDS) mapping[field.key] = '';

  root.querySelectorAll('[data-bdt-csv-field]').forEach((el) => {
    const key = el.getAttribute('data-bdt-csv-field');
    if (!key) return;
    mapping[key] = /** @type {HTMLSelectElement} */ (el).value || '';
  });
  return mapping;
}

/**
 * @param {HTMLElement} root
 */
export function clearCsvMapping(root) {
  const host = root.querySelector('[data-bdt-csv-map]');
  if (!host) return;
  host.hidden = true;
  host.innerHTML = '';
}

/**
 * @param {CsvTargetField} field
 * @param {string[]} headers
 * @param {Record<string, string>[]} rows
 * @param {string} selected
 */
function renderFieldRow(field, headers, rows, selected) {
  const samples = sampleColumnValues(rows, selected);
  const auto = selected
    ? `<span class="bdt-csv-map__pill is-mapped">${escapeHtml(t.csvMapMapped)}</span>`
    : field.required
      ? `<span class="bdt-csv-map__pill is-required">${escapeHtml(t.csvMapRequired)}</span>`
      : `<span class="bdt-csv-map__pill">${escapeHtml(t.csvMapOptional)}</span>`;

  return `
    <div class="bdt-csv-map__row ${selected ? 'is-mapped' : ''} ${field.required && !selected ? 'is-missing' : ''}">
      <div class="bdt-csv-map__field">
        <span class="bdt-csv-map__field-name">${escapeHtml(fieldLabel(field.key))}</span>
        ${auto}
      </div>
      <label class="bdt-csv-map__select-wrap">
        <span class="bdt-csv-map__select-label">${escapeHtml(t.csvMapColumn)}</span>
        <select class="bdt-csv-map__select" data-bdt-csv-field="${escapeAttr(field.key)}">
          <option value="">${escapeHtml(t.csvMapSkip)}</option>
          ${headers
            .map(
              (header) => `
            <option value="${escapeAttr(header)}" ${header === selected ? 'selected' : ''}>
              ${escapeHtml(header)}
            </option>`,
            )
            .join('')}
        </select>
      </label>
      <div class="bdt-csv-map__samples">
        ${
          samples.length
            ? samples
                .map((s) => `<span class="bdt-csv-map__sample">${escapeHtml(s)}</span>`)
                .join('')
            : `<span class="bdt-csv-map__sample is-empty">${escapeHtml(t.csvMapNoSamples)}</span>`
        }
      </div>
    </div>
  `;
}

/**
 * @param {string} key
 */
function fieldLabel(key) {
  const map = {
    title: t.csvFieldTitle,
    status: t.csvFieldStatus,
    rating: t.csvFieldRating,
    start_date: t.csvFieldStart,
    finish_date: t.csvFieldFinish,
    review: t.csvFieldReview,
    platform: t.csvFieldPlatform,
    favorite: t.csvFieldFavorite,
    hours: t.csvFieldHours,
    game_id: t.csvFieldGameId,
    slug: t.csvFieldSlug,
  };
  return map[key] || key;
}

/**
 * Local fmt to avoid circular imports in UI module edge cases.
 * @param {string} template
 * @param {Record<string, string | number>} vars
 */
function fmtLocal(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] == null ? '' : String(vars[k]),
  );
}

/**
 * @typedef {import('../format/csv/map.js').CsvTargetField} CsvTargetField
 */
