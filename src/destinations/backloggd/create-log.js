import { entryDisplayTitle, primaryPlaythrough } from '../../format/schema.js';
import { platformByIdOrName } from '../../format/platforms.js';
import { getCsrfToken, resolveBackloggdUserId } from './auth.js';
import { backloggdUrl } from './site.js';

/**
 * Build form fields for Backloggd `POST /api/user/{userId}/log/{gameId}`.
 * Returns a flat object ready for `URLSearchParams` / x-www-form-urlencoded.
 *
 * @param {import('../../format/schema.js').TransferEntry} entry
 * @param {{ gameId: number|string, overrideCoverId?: number|null }} ids
 * @returns {Record<string, string>}
 */
export function buildLogFormBody(entry, ids) {
  const log = normalizeLogFlags(entry.log || {});
  const pt = primaryPlaythrough(entry);
  const gameId = String(ids.gameId);
  const cover =
    ids.overrideCoverId != null
      ? ids.overrideCoverId
      : log.override_cover_id;

  /** @type {Record<string, string>} */
  const body = {
    game_id: gameId,
    'playthroughs[0][id]': '-1',
    'playthroughs[0][title]': resolvePlaythroughTitle(pt),
    'playthroughs[0][rating]': pt.rating == null ? '' : String(pt.rating),
    'playthroughs[0][sync_sessions]': String(Boolean(pt.sync_sessions)),
    'playthroughs[0][review]': pt.review || '',
    'playthroughs[0][review_spoilers]': String(Boolean(pt.review_spoilers)),
    'playthroughs[0][platform]': pt.platform == null ? '' : String(pt.platform),
    'playthroughs[0][hours_played]':
      pt.hours_played == null ? '' : String(pt.hours_played),
    'playthroughs[0][mins_played]':
      pt.mins_played == null ? '' : String(pt.mins_played),
    'playthroughs[0][is_master]': String(Boolean(pt.is_master)),
    'playthroughs[0][is_replay]': String(Boolean(pt.is_replay)),
    'playthroughs[0][start_date]': pt.start_date || '',
    'playthroughs[0][finish_date]': pt.finish_date || '',
    'playthroughs[0][edition_id]':
      pt.edition_id == null ? '' : String(pt.edition_id),
    'playthroughs[0][edition_type]':
      pt.edition_type == null ? '' : String(pt.edition_type),
    'playthroughs[0][medium_id]':
      pt.medium_id == null ? '' : String(pt.medium_id),
    'playthroughs[0][played_platform]':
      pt.played_platform == null ? '' : String(pt.played_platform),
    'playthroughs[0][storefront_id]':
      pt.storefront_id == null ? '' : String(pt.storefront_id),
    'playthroughs[0][hours_finished]':
      pt.hours_finished == null ? '' : String(pt.hours_finished),
    'playthroughs[0][mins_finished]':
      pt.mins_finished == null ? '' : String(pt.mins_finished),
    'playthroughs[0][hours_mastered]':
      pt.hours_mastered == null ? '' : String(pt.hours_mastered),
    'playthroughs[0][mins_mastered]':
      pt.mins_mastered == null ? '' : String(pt.mins_mastered),
    'log[game_liked]': String(Boolean(log.game_liked)),
    'log[id]': log.id == null ? '' : String(log.id),
    'log[last_edited_at]': log.last_edited_at || '',
    'log[override_cover_id]': cover == null ? '' : String(cover),
    'log[is_play]': String(Boolean(log.is_play)),
    'log[is_playing]': String(Boolean(log.is_playing)),
    'log[is_backlog]': String(Boolean(log.is_backlog)),
    'log[is_wishlist]': String(Boolean(log.is_wishlist)),
    'log[status]': log.status || '',
    'log[total_hours]': log.total_hours == null ? '' : String(log.total_hours),
    'log[total_minutes]':
      log.total_minutes == null ? '' : String(log.total_minutes),
    'log[time_source]': log.time_source == null ? '1' : String(log.time_source),
    modal_type: 'full',
  };

  const sessions = resolveDateSessions(entry, pt);
  sessions.forEach((session, i) => {
    const prefix = `dates[-1][${i}]`;
    body[`${prefix}[id]`] = '-1';
    body[`${prefix}[range_start_date]`] = session.range_start_date || '';
    body[`${prefix}[range_end_date]`] = session.range_end_date || '';
    body[`${prefix}[edited]`] = 'true';
    body[`${prefix}[status]`] =
      session.status == null ? '' : String(session.status);
    body[`${prefix}[note]`] = session.note || '';
    body[`${prefix}[hours]`] = session.hours == null ? '' : String(session.hours);
    body[`${prefix}[minutes]`] =
      session.minutes == null ? '' : String(session.minutes);
    body[`${prefix}[start_date]`] = session.start_date || '';
    body[`${prefix}[finish_date]`] = session.finish_date || '';
  });

  return body;
}

/**
 * Prefer explicit `dates[]`; otherwise derive a journal session from
 * playthrough start/finish so Started/Finished on actually persist.
 * @param {import('../../format/schema.js').TransferEntry} entry
 * @param {import('../../format/schema.js').TransferPlaythrough} pt
 */
function resolveDateSessions(entry, pt) {
  const existing = entry.dates || [];
  if (existing.length) return existing;

  const start = pt.start_date || '';
  const finish = pt.finish_date || '';
  if (!start && !finish) return [];

  return [
    {
      range_start_date: start || finish,
      range_end_date: finish || start,
      status: null,
      note: '',
      hours: null,
      minutes: null,
      start_date: start,
      finish_date: finish,
    },
  ];
}

/**
 * Log tab title: platform name when known, otherwise "Log".
 * @param {import('../../format/schema.js').TransferPlaythrough} pt
 */
function resolvePlaythroughTitle(pt) {
  const fromPlatform = platformByIdOrName(pt.platform)?.name;
  if (fromPlatform) return fromPlatform;
  const title = String(pt.title || '').trim();
  if (title) return title;
  return 'Log';
}

/**
 * Align shelf flags with `log.status` when callers only set status.
 * @param {import('../../format/schema.js').TransferLog} log
 */
function normalizeLogFlags(log) {
  const next = { ...log };
  const status = String(next.status || '');

  if (
    next.is_play == null &&
    next.is_playing == null &&
    next.is_backlog == null &&
    next.is_wishlist == null
  ) {
    next.is_play = false;
    next.is_playing = false;
    next.is_backlog = false;
    next.is_wishlist = false;

    switch (status) {
      case 'playing':
        next.is_playing = true;
        next.is_play = true;
        break;
      case 'backlog':
        next.is_backlog = true;
        break;
      case 'wishlist':
        next.is_wishlist = true;
        break;
      case 'completed':
      case 'played':
      case 'shelved':
      case 'abandoned':
      case 'retired':
        next.is_play = true;
        break;
      default:
        break;
    }
  }

  return next;
}

/**
 * Create / update a game log on Backloggd for one transfer entry.
 *
 * @param {import('../../format/schema.js').TransferEntry} entry
 * @param {{
 *   dryRun?: boolean,
 *   userId?: number,
 *   csrfToken?: string,
 *   resolved?: { slug?: string, title?: string, url?: string, game_id?: number } | null,
 * }} [options]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string, dryRun?: boolean, status?: number }>}
 */
export async function createBackloggdLog(entry, options = {}) {
  const dryRun = options.dryRun === true;
  const title = entryDisplayTitle(entry);
  if (!title && entry.game_id == null) {
    return { ok: false, error: 'Missing title / game_id' };
  }

  const gameId = entry.game_id ?? options.resolved?.game_id ?? null;
  if (gameId == null) {
    return { ok: false, error: 'game_id not resolved', skipped: true };
  }

  const form = buildLogFormBody(entry, { gameId });

  if (dryRun) {
    return { ok: true, dryRun: true, skipped: false };
  }

  let userId = options.userId;
  try {
    if (userId == null) userId = await resolveBackloggdUserId();
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const csrf = options.csrfToken || getCsrfToken();
  if (!csrf) {
    return { ok: false, error: 'CSRF token not found on page' };
  }

  const url = backloggdUrl(`/api/user/${userId}/log/${gameId}`);
  const body = new URLSearchParams(form).toString();
  const slug = entry.slug || options.resolved?.slug || '';
  const referrer = slug
    ? backloggdUrl(`/games/${encodeURIComponent(slug)}/`)
    : backloggdUrl('/');

  try {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF-Token': csrf,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body,
      referrer,
    });

    if (res.status === 429) {
      return { ok: false, error: 'Rate limited (429)', status: 429 };
    }

    if (!res.ok) {
      const detail = await readErrorDetail(res);
      return {
        ok: false,
        error: detail || `HTTP ${res.status}`,
        status: res.status,
      };
    }

    return { ok: true, status: res.status };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * @param {Response} res
 * @returns {Promise<string>}
 */
async function readErrorDetail(res) {
  try {
    const text = await res.text();
    if (!text) return '';
    try {
      const json = JSON.parse(text);
      if (typeof json?.error === 'string') return json.error;
      if (typeof json?.message === 'string') return json.message;
      return text.slice(0, 200);
    } catch (_) {
      return text.slice(0, 200);
    }
  } catch (_) {
    return '';
  }
}
