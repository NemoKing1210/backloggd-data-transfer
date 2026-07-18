import {
  clearGameCache,
  clearGameCacheMisses,
  formatCacheBytes,
  getCacheUsageStats,
  listGameCacheEntries,
  cacheMeterPct,
} from '../cache/games.js';
import { backloggdUrl } from '../destinations/backloggd/site.js';
import { fmt } from '../i18n/index.js';
import { t } from '../state.js';
import { escapeAttr, escapeHtml } from '../utils/html.js';
import { showToast } from './toast.js';

/**
 * Render the Cache tab.
 * @param {HTMLElement} root
 */
export function renderCachePanel(root) {
  const panel = root.querySelector('[data-bdt-panel="cache"]');
  if (!panel) return;

  const stats = getCacheUsageStats();
  const entries = listGameCacheEntries(100);
  syncCacheTabBadge(root, stats);

  const denom = Math.max(stats.usedBytes, stats.limitBytes, 1);
  const foundPct = cacheMeterPct(stats.foundBytes, denom);
  const missPct = cacheMeterPct(stats.missBytes, denom);
  const historyPct = cacheMeterPct(stats.historyBytes, denom);
  const mapsPct = cacheMeterPct(stats.mapsBytes, denom);
  const settingsPct = cacheMeterPct(stats.settingsBytes, denom);
  const freePct = cacheMeterPct(stats.freeBytes, denom);
  const usedPct = Math.round(cacheMeterPct(stats.usedBytes, stats.limitBytes));

  panel.innerHTML = `
    <div class="bdt-cache">
      <div class="bdt-cache__head">
        <div>
          <h3 class="bdt-cache__title">${escapeHtml(t.cacheTitle)}</h3>
          <p class="bdt-cache__lead">${escapeHtml(t.cacheLead)}</p>
        </div>
        <div class="bdt-cache__actions">
          <button type="button" class="bdt-btn bdt-btn--ghost bdt-btn--sm" data-bdt-cache-clear-misses>
            ${escapeHtml(t.cacheClearMisses)}
          </button>
          <button type="button" class="bdt-btn bdt-btn--danger bdt-btn--sm" data-bdt-cache-clear>
            ${escapeHtml(t.cacheClearAll)}
          </button>
        </div>
      </div>

      <section class="bdt-cache-meter" data-bdt-cache-meter>
        <div class="bdt-cache-meter__head">
          <div class="bdt-cache-meter__titles">
            <span class="bdt-cache-meter__label">${escapeHtml(t.cacheMeterLabel)}</span>
            <strong class="bdt-cache-meter__used">${escapeHtml(
              fmt(t.cacheBarUsed, {
                used: formatCacheBytes(stats.usedBytes),
                limit: formatCacheBytes(stats.limitBytes),
              }),
            )}</strong>
          </div>
          <div class="bdt-cache-meter__pct-wrap" title="${escapeAttr(fmt(t.cacheBarPctTitle, { pct: usedPct }))}">
            <strong class="bdt-cache-meter__pct ${usedPct >= 90 ? 'is-high' : usedPct >= 70 ? 'is-mid' : ''}">${escapeHtml(
              fmt(t.cacheBarPct, { pct: usedPct }),
            )}</strong>
            <span class="bdt-cache-meter__pct-label">${escapeHtml(t.cacheBarPctLabel)}</span>
          </div>
        </div>
        <div
          class="bdt-cache-meter__bar"
          role="img"
          aria-label="${escapeAttr(
            fmt(t.cacheBarAria, {
              used: formatCacheBytes(stats.usedBytes),
              free: formatCacheBytes(stats.freeBytes),
              pct: usedPct,
            }),
          )}"
        >
          <span class="bdt-cache-meter__seg bdt-cache-meter__seg--found" style="width:${foundPct}%"></span>
          <span class="bdt-cache-meter__seg bdt-cache-meter__seg--miss" style="width:${missPct}%"></span>
          <span class="bdt-cache-meter__seg bdt-cache-meter__seg--history" style="width:${historyPct}%"></span>
          <span class="bdt-cache-meter__seg bdt-cache-meter__seg--maps" style="width:${mapsPct}%"></span>
          <span class="bdt-cache-meter__seg bdt-cache-meter__seg--settings" style="width:${settingsPct}%"></span>
          <span class="bdt-cache-meter__seg bdt-cache-meter__seg--free" style="width:${freePct}%"></span>
        </div>
        <ul class="bdt-cache-meter__legend">
          ${legendItem('found', t.cacheBarFound, stats.foundCount, stats.foundBytes)}
          ${legendItem('miss', t.cacheBarMiss, stats.missCount, stats.missBytes)}
          ${legendItem('history', t.cacheBarHistory, stats.historyCount, stats.historyBytes)}
          ${legendItem('maps', t.cacheBarMaps, null, stats.mapsBytes)}
          ${legendItem('settings', t.cacheBarSettings, null, stats.settingsBytes)}
          ${legendItem('free', t.cacheBarFree, null, stats.freeBytes)}
        </ul>
        <p class="bdt-cache-meter__hint">${escapeHtml(t.cacheBarHint)}</p>
      </section>

      <div class="bdt-cache-cards">
        ${statCard(t.cacheStatGames, String(stats.gamesCount), formatCacheBytes(stats.gamesBytes))}
        ${statCard(t.cacheStatFound, String(stats.foundCount), formatCacheBytes(stats.foundBytes))}
        ${statCard(t.cacheStatMiss, String(stats.missCount), formatCacheBytes(stats.missBytes))}
        ${statCard(
          t.cacheStatUpdated,
          stats.newestAt ? formatCacheWhen(stats.newestAt) : '—',
          t.cacheStatUpdatedHint,
        )}
      </div>

      <section class="bdt-cache-list-wrap">
        <div class="bdt-cache-list__head">
          <h4 class="bdt-cache-list__title">${escapeHtml(t.cacheListTitle)}</h4>
          <p class="bdt-cache-list__meta">${escapeHtml(
            fmt(t.cacheListMeta, {
              shown: entries.length,
              total: stats.gamesCount,
            }),
          )}</p>
        </div>
        ${
          entries.length
            ? `<div class="bdt-cache-list">
                <table class="bdt-cache-table">
                  <thead>
                    <tr>
                      <th>${escapeHtml(t.cacheColQuery)}</th>
                      <th>${escapeHtml(t.cacheColKind)}</th>
                      <th>${escapeHtml(t.cacheColMatch)}</th>
                      <th>${escapeHtml(t.cacheColId)}</th>
                      <th>${escapeHtml(t.cacheColWhen)}</th>
                      <th>${escapeHtml(t.cacheColSize)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${entries.map(renderCacheRow).join('')}
                  </tbody>
                </table>
              </div>`
            : `<div class="bdt-cache-empty">
                <p class="bdt-cache-empty__title">${escapeHtml(t.cacheEmptyTitle)}</p>
                <p class="bdt-cache-empty__text">${escapeHtml(t.cacheEmptyLead)}</p>
              </div>`
        }
      </section>
    </div>
  `;

  panel.querySelector('[data-bdt-cache-clear]')?.addEventListener('click', () => {
    if (!window.confirm(t.cacheClearConfirm)) return;
    const removed = clearGameCache();
    showToast(fmt(t.cacheCleared, { count: removed }), {
      type: 'success',
      title: t.cacheClearAll,
    });
    renderCachePanel(root);
  });

  panel
    .querySelector('[data-bdt-cache-clear-misses]')
    ?.addEventListener('click', () => {
      const removed = clearGameCacheMisses();
      showToast(fmt(t.cacheMissesCleared, { count: removed }), {
        type: 'success',
        title: t.cacheClearMisses,
      });
      renderCachePanel(root);
    });
}

/**
 * Show fill % on the Cache tab badge.
 * @param {HTMLElement} root
 * @param {ReturnType<typeof getCacheUsageStats> | number} [statsOrPct]
 */
export function syncCacheTabBadge(root, statsOrPct) {
  const badge = root.querySelector('[data-bdt-cache-badge]');
  if (!badge) return;

  let pct;
  if (typeof statsOrPct === 'number' && Number.isFinite(statsOrPct)) {
    pct = Math.round(Math.max(0, Math.min(100, statsOrPct)));
  } else {
    const stats = statsOrPct && typeof statsOrPct === 'object'
      ? statsOrPct
      : getCacheUsageStats();
    pct = Math.round(cacheMeterPct(stats.usedBytes, stats.limitBytes));
  }

  badge.hidden = false;
  badge.textContent = fmt(t.cacheTabBadge, { pct });
  badge.title = fmt(t.cacheBarPctTitle, { pct });
  badge.classList.toggle('is-mid', pct >= 70 && pct < 90);
  badge.classList.toggle('is-high', pct >= 90);
}

/**
 * @param {string} kind
 * @param {string} label
 * @param {number | null} count
 * @param {number} bytes
 */
function legendItem(kind, label, count, bytes) {
  const detail =
    count == null
      ? formatCacheBytes(bytes)
      : fmt(t.cacheBarLegend, {
          count,
          size: formatCacheBytes(bytes),
        });
  return `
    <li>
      <span class="bdt-cache-meter__swatch bdt-cache-meter__swatch--${escapeAttr(kind)}"></span>
      <span class="bdt-cache-meter__legend-label">${escapeHtml(label)}</span>
      <span class="bdt-cache-meter__legend-value">${escapeHtml(detail)}</span>
    </li>
  `;
}

/**
 * @param {string} title
 * @param {string} value
 * @param {string} hint
 */
function statCard(title, value, hint) {
  return `
    <article class="bdt-cache-card">
      <p class="bdt-cache-card__label">${escapeHtml(title)}</p>
      <strong class="bdt-cache-card__value">${escapeHtml(value)}</strong>
      <p class="bdt-cache-card__hint">${escapeHtml(hint)}</p>
    </article>
  `;
}

/**
 * @param {{
 *   kind: string,
 *   query: string,
 *   match: { id?: number, title?: string, slug?: string, year?: string } | null,
 *   at: number,
 *   bytes: number,
 * }} row
 */
function renderCacheRow(row) {
  const kindLabel = row.kind === 'miss' ? t.cacheKindMiss : t.cacheKindHit;
  const matchTitle = row.match?.title || '—';
  const link =
    row.match?.slug
      ? `<a href="${escapeAttr(backloggdUrl(`/games/${encodeURIComponent(row.match.slug)}/`))}" target="_blank" rel="noopener noreferrer">${escapeHtml(matchTitle)}</a>`
      : escapeHtml(matchTitle);
  const id = row.match?.id != null ? String(row.match.id) : '—';

  return `
    <tr class="bdt-cache-row bdt-cache-row--${escapeAttr(row.kind)}">
      <td class="bdt-cache-col-query">${escapeHtml(row.query)}</td>
      <td><span class="bdt-cache-pill bdt-cache-pill--${escapeAttr(row.kind)}">${escapeHtml(kindLabel)}</span></td>
      <td class="bdt-cache-col-match">${link}</td>
      <td class="bdt-cache-col-id">${escapeHtml(id)}</td>
      <td class="bdt-cache-col-when">${escapeHtml(formatCacheWhen(row.at))}</td>
      <td class="bdt-cache-col-size">${escapeHtml(formatCacheBytes(row.bytes))}</td>
    </tr>
  `;
}

/**
 * @param {number} ts
 */
function formatCacheWhen(ts) {
  if (!ts) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ts));
  } catch (_) {
    return new Date(ts).toLocaleString();
  }
}
