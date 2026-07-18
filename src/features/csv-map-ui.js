import {
  CSV_TARGET_FIELDS,
  sampleColumnValues,
  suggestCsvMapping,
} from '../format/csv/map.js';
import {
  analyzePlatformValues,
  analyzeRatingValues,
  analyzeStatusValues,
  platformSelectOptions,
  ratingSelectOptions,
  statusSelectOptions,
  suggestPlatformValueMap,
  suggestRatingValueMap,
  suggestStatusValueMap,
} from '../format/csv/value-map.js';
import {
  applyRememberedValueMap,
  loadCsvValueMapMemory,
  rememberCsvValueMaps,
} from '../format/csv/value-map-memory.js';
import { LOG_STATUS_LABELS } from '../constants.js';
import { platformByIdOrName } from '../format/platforms.js';
import { RATING_SCORE_LABELS } from '../format/status.js';
import { t } from '../state.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';

/**
 * @typedef {{
 *   status: Record<string, string>,
 *   rating: Record<string, string>,
 *   platform: Record<string, string>,
 * }} CsvValueMaps
 */

/**
 * Render CSV column mapping + status/rating/platform value mapping UI.
 * @param {HTMLElement} root
 * @param {{
 *   headers: string[],
 *   rows: Record<string, string>[],
 *   mapping?: Record<string, string>,
 *   valueMaps?: Partial<CsvValueMaps>,
 *   filename?: string,
 *   onChange?: (state: { mapping: Record<string, string>, valueMaps: CsvValueMaps }) => void,
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

  const statusAnalysis = mapping.status
    ? analyzeStatusValues(rows, mapping.status)
    : null;
  const ratingAnalysis = mapping.rating
    ? analyzeRatingValues(rows, mapping.rating)
    : null;
  const platformAnalysis = mapping.platform
    ? analyzePlatformValues(rows, mapping.platform)
    : null;

  const memory = loadCsvValueMapMemory();
  const suggestedStatus = statusAnalysis ? suggestStatusValueMap(statusAnalysis) : {};
  const suggestedRating = ratingAnalysis ? suggestRatingValueMap(ratingAnalysis) : {};
  const suggestedPlatform = platformAnalysis
    ? suggestPlatformValueMap(platformAnalysis)
    : {};

  const valueMaps = {
    status: {
      ...applyRememberedValueMap(
        suggestedStatus,
        memory.status,
        statusAnalysis?.values || [],
      ),
      ...(options.valueMaps?.status || {}),
    },
    rating: {
      ...applyRememberedValueMap(
        suggestedRating,
        memory.rating,
        ratingAnalysis?.values || [],
      ),
      ...(options.valueMaps?.rating || {}),
    },
    platform: {
      ...applyRememberedValueMap(
        suggestedPlatform,
        memory.platform,
        platformAnalysis?.values || [],
      ),
      ...(options.valueMaps?.platform || {}),
    },
  };

  const mappedCount = CSV_TARGET_FIELDS.filter((f) => mapping[f.key]).length;
  const requiredOk = Boolean(mapping.title);
  const statusOpts = statusSelectOptions();
  const ratingOpts = ratingSelectOptions();
  const platformOpts = platformSelectOptions();

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

      <div class="bdt-csv-values" data-bdt-csv-values>
        ${
          statusAnalysis?.needed
            ? renderValueMapBlock({
                kind: 'status',
                title: t.csvValueStatusTitle,
                lead: t.csvValueStatusLead,
                analysis: statusAnalysis,
                valueMap: valueMaps.status,
                options: statusOpts,
                formatTarget: (v) => LOG_STATUS_LABELS[v] || v || t.csvValueSkip,
              })
            : ''
        }
        ${
          ratingAnalysis?.needed
            ? renderValueMapBlock({
                kind: 'rating',
                title: t.csvValueRatingTitle,
                lead: t.csvValueRatingLead,
                analysis: ratingAnalysis,
                valueMap: valueMaps.rating,
                options: ratingOpts,
                formatTarget: (v) => {
                  if (!v) return t.csvValueSkip;
                  const n = Number(v);
                  const label = RATING_SCORE_LABELS[n] || '';
                  return `${n} · ${label} · ${n / 2}★`;
                },
              })
            : ''
        }
        ${
          platformAnalysis?.needed
            ? renderValueMapBlock({
                kind: 'platform',
                title: t.csvValuePlatformTitle,
                lead: t.csvValuePlatformLead,
                analysis: platformAnalysis,
                valueMap: valueMaps.platform,
                options: platformOpts,
                formatTarget: (v) => {
                  if (!v) return t.csvValueSkip;
                  const hit = platformByIdOrName(v);
                  return hit ? hit.name : v;
                },
              })
            : ''
        }
      </div>
    </div>
  `;

  const emit = () => {
    const nextMapping = readCsvMapping(root);
    const nextValues = readCsvValueMaps(root);
    rememberCsvValueMaps(nextValues);
    options.onChange?.({ mapping: nextMapping, valueMaps: nextValues });
  };

  host.querySelectorAll('[data-bdt-csv-field]').forEach((select) => {
    select.addEventListener('change', () => {
      const nextMapping = readCsvMapping(root);
      const memory = loadCsvValueMapMemory();
      const nextStatusAnalysis = nextMapping.status
        ? analyzeStatusValues(rows, nextMapping.status)
        : null;
      const nextRatingAnalysis = nextMapping.rating
        ? analyzeRatingValues(rows, nextMapping.rating)
        : null;
      const nextPlatformAnalysis = nextMapping.platform
        ? analyzePlatformValues(rows, nextMapping.platform)
        : null;
      const currentValues = readCsvValueMaps(root);
      const nextStatus = nextStatusAnalysis
        ? {
            ...applyRememberedValueMap(
              suggestStatusValueMap(nextStatusAnalysis),
              memory.status,
              nextStatusAnalysis.values,
            ),
            ...currentValues.status,
          }
        : {};
      const nextRating = nextRatingAnalysis
        ? {
            ...applyRememberedValueMap(
              suggestRatingValueMap(nextRatingAnalysis),
              memory.rating,
              nextRatingAnalysis.values,
            ),
            ...currentValues.rating,
          }
        : {};
      const nextPlatform = nextPlatformAnalysis
        ? {
            ...applyRememberedValueMap(
              suggestPlatformValueMap(nextPlatformAnalysis),
              memory.platform,
              nextPlatformAnalysis.values,
            ),
            ...currentValues.platform,
          }
        : {};
      const nextValueMaps = {
        status: nextStatus,
        rating: nextRating,
        platform: nextPlatform,
      };
      options.onChange?.({
        mapping: nextMapping,
        valueMaps: nextValueMaps,
      });
      renderCsvMapping(root, {
        ...options,
        mapping: nextMapping,
        valueMaps: nextValueMaps,
      });
    });
  });

  host.querySelectorAll('[data-bdt-csv-value]').forEach((select) => {
    select.addEventListener('change', () => {
      const row = select.closest('tr');
      const preview = row?.querySelector('.bdt-csv-vmap__preview');
      const kind = select.getAttribute('data-bdt-csv-value-kind');
      const value = /** @type {HTMLSelectElement} */ (select).value || '';
      if (preview) {
        preview.classList.toggle('is-empty', !value);
        if (kind === 'status') {
          preview.textContent = value
            ? LOG_STATUS_LABELS[value] || value
            : t.csvValueSkip;
        } else if (kind === 'rating') {
          const n = Number(value);
          preview.textContent = value
            ? `${n} · ${RATING_SCORE_LABELS[n] || ''} · ${n / 2}★`
            : t.csvValueSkip;
        } else if (kind === 'platform') {
          const hit = value ? platformByIdOrName(value) : null;
          preview.textContent = hit ? hit.name : t.csvValueSkip;
        }
      }
      if (row && !row.classList.contains('is-native')) {
        row.classList.toggle('is-mapped', Boolean(value));
        row.classList.toggle('is-unmapped', !value);
      }
      emit();
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
 * @returns {CsvValueMaps}
 */
export function readCsvValueMaps(root) {
  /** @type {CsvValueMaps} */
  const valueMaps = { status: {}, rating: {}, platform: {} };
  root.querySelectorAll('[data-bdt-csv-value]').forEach((el) => {
    const kind = el.getAttribute('data-bdt-csv-value-kind');
    const raw = el.getAttribute('data-bdt-csv-value');
    if (
      (kind !== 'status' && kind !== 'rating' && kind !== 'platform') ||
      raw == null
    ) {
      return;
    }
    valueMaps[kind][raw] = /** @type {HTMLSelectElement} */ (el).value || '';
  });
  return valueMaps;
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
 * @param {{
 *   kind: 'status' | 'rating' | 'platform',
 *   title: string,
 *   lead: string,
 *   analysis: { values: { raw: string, count: number, needsMap: boolean, suggested: unknown }[], mappedCount: number, unmappedCount: number },
 *   valueMap: Record<string, string>,
 *   options: { value: string, label: string }[],
 *   formatTarget: (value: string) => string,
 * }} cfg
 */
function renderValueMapBlock(cfg) {
  const warn = cfg.analysis.unmappedCount > 0;
  const badgeText = warn
    ? fmtLocal(t.csvValueUnmappedStat, { count: cfg.analysis.unmappedCount })
    : t.csvValueAllMapped;

  return `
    <details class="bdt-csv-vmap ${warn ? 'is-warn' : 'is-ok'}">
      <summary class="bdt-csv-vmap__summary">
        <div class="bdt-csv-vmap__summary-main">
          <span class="bdt-csv-vmap__chevron" aria-hidden="true"></span>
          <div>
            <h4 class="bdt-csv-vmap__title">${escapeHtml(cfg.title)}</h4>
            <p class="bdt-csv-vmap__lead">${escapeHtml(cfg.lead)}</p>
          </div>
        </div>
        <div class="bdt-csv-vmap__badges">
          <span class="bdt-csv-vmap__badge">${escapeHtml(
            fmtLocal(t.csvValueUniqueStat, { count: cfg.analysis.values.length }),
          )}</span>
          <span class="bdt-csv-vmap__badge ${warn ? 'is-warn' : 'is-ok'}">${escapeHtml(
            badgeText,
          )}</span>
        </div>
      </summary>
      <div class="bdt-csv-vmap__table-wrap">
        <table class="bdt-csv-vmap__table">
          <thead>
            <tr>
              <th>${escapeHtml(t.csvValueColSource)}</th>
              <th>${escapeHtml(t.csvValueColCount)}</th>
              <th>${escapeHtml(t.csvValueColTarget)}</th>
              <th>${escapeHtml(t.csvValueColPreview)}</th>
            </tr>
          </thead>
          <tbody>
            ${cfg.analysis.values
              .map((item) => {
                const selected = valueMapLookup(cfg.valueMap, item.raw);
                const preview = cfg.formatTarget(selected);
                const rowClass = item.needsMap
                  ? selected
                    ? 'is-mapped'
                    : 'is-unmapped'
                  : 'is-native';
                return `
                  <tr class="${rowClass}">
                    <td>
                      <code class="bdt-csv-vmap__raw">${escapeHtml(item.raw)}</code>
                      ${
                        item.needsMap
                          ? ''
                          : `<span class="bdt-csv-vmap__native">${escapeHtml(t.csvValueNative)}</span>`
                      }
                    </td>
                    <td class="bdt-csv-vmap__count">${escapeHtml(String(item.count))}</td>
                    <td>
                      <select
                        class="bdt-csv-map__select bdt-csv-vmap__select"
                        data-bdt-csv-value="${escapeAttr(item.raw)}"
                        data-bdt-csv-value-kind="${escapeAttr(cfg.kind)}"
                      >
                        <option value="">${escapeHtml(t.csvValueSkip)}</option>
                        ${cfg.options
                          .map(
                            (opt) => `
                          <option value="${escapeAttr(opt.value)}" ${
                            String(selected) === String(opt.value) ? 'selected' : ''
                          }>
                            ${escapeHtml(opt.label)}
                          </option>`,
                          )
                          .join('')}
                      </select>
                    </td>
                    <td>
                      <span class="bdt-csv-vmap__preview ${selected ? '' : 'is-empty'}">${escapeHtml(preview)}</span>
                    </td>
                  </tr>
                `;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

/**
 * @param {Record<string, string>} map
 * @param {string} raw
 */
function valueMapLookup(map, raw) {
  if (Object.prototype.hasOwnProperty.call(map, raw)) return map[raw] || '';
  const hit = Object.entries(map).find(([k]) => k.toLowerCase() === raw.toLowerCase());
  return hit ? hit[1] || '' : '';
}

/**
 * @param {import('../format/csv/map.js').CsvTargetField} field
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
 * @param {string} template
 * @param {Record<string, string | number>} vars
 */
function fmtLocal(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] == null ? '' : String(vars[k]),
  );
}
