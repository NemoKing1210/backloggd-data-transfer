import { entryDisplayTitle, primaryPlaythrough } from '../../format/schema.js';

/**
 * Build form fields for Backloggd `POST /api/user/{userId}/log/{gameId}`.
 * Returns a flat object ready for `URLSearchParams` / x-www-form-urlencoded.
 *
 * @param {import('../../format/schema.js').TransferEntry} entry
 * @param {{ gameId: number|string, overrideCoverId?: number|null }} ids
 * @returns {Record<string, string>}
 */
export function buildLogFormBody(entry, ids) {
  const log = entry.log || {};
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
    'playthroughs[0][title]': pt.title || '',
    'playthroughs[0][rating]': pt.rating == null ? '' : String(pt.rating),
    'playthroughs[0][sync_sessions]': String(Boolean(pt.sync_sessions)),
    'playthroughs[0][review]': pt.review || '',
    'playthroughs[0][review_spoilers]': String(Boolean(pt.review_spoilers)),
    'playthroughs[0][platform]': pt.platform == null ? '' : String(pt.platform),
    'playthroughs[0][hours_played]': pt.hours_played == null ? '' : String(pt.hours_played),
    'playthroughs[0][mins_played]': pt.mins_played == null ? '' : String(pt.mins_played),
    'playthroughs[0][is_master]': String(Boolean(pt.is_master)),
    'playthroughs[0][is_replay]': String(Boolean(pt.is_replay)),
    'playthroughs[0][start_date]': pt.start_date || '',
    'playthroughs[0][finish_date]': pt.finish_date || '',
    'playthroughs[0][edition_id]': pt.edition_id == null ? '' : String(pt.edition_id),
    'playthroughs[0][edition_type]': pt.edition_type == null ? '' : String(pt.edition_type),
    'playthroughs[0][medium_id]': pt.medium_id == null ? '' : String(pt.medium_id),
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
    'log[id]': '',
    'log[last_edited_at]': '',
    'log[override_cover_id]': cover == null ? '' : String(cover),
    'log[is_play]': String(Boolean(log.is_play)),
    'log[is_playing]': String(Boolean(log.is_playing)),
    'log[is_backlog]': String(Boolean(log.is_backlog)),
    'log[is_wishlist]': String(Boolean(log.is_wishlist)),
    'log[status]': log.status || '',
    'log[total_hours]': log.total_hours == null ? '' : String(log.total_hours),
    'log[total_minutes]': log.total_minutes == null ? '' : String(log.total_minutes),
    'log[time_source]': log.time_source == null ? '1' : String(log.time_source),
    modal_type: 'full',
  };

  const sessions = entry.dates || [];
  sessions.forEach((session, i) => {
    const prefix = `dates[-1][${i}]`;
    body[`${prefix}[id]`] = '-1';
    body[`${prefix}[range_start_date]`] = session.range_start_date || '';
    body[`${prefix}[range_end_date]`] = session.range_end_date || '';
    body[`${prefix}[edited]`] = 'true';
    body[`${prefix}[status]`] = session.status == null ? '' : String(session.status);
    body[`${prefix}[note]`] = session.note || '';
    body[`${prefix}[hours]`] = session.hours == null ? '' : String(session.hours);
    body[`${prefix}[minutes]`] = session.minutes == null ? '' : String(session.minutes);
    body[`${prefix}[start_date]`] = session.start_date || '';
    body[`${prefix}[finish_date]`] = session.finish_date || '';
  });

  return body;
}

/**
 * Create / update a game log on Backloggd for one transfer entry.
 *
 * @param {import('../../format/schema.js').TransferEntry} entry
 * @param {{ dryRun?: boolean, resolved?: { slug?: string, title?: string, url?: string, game_id?: number } | null }} [options]
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: string, dryRun?: boolean }>}
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

  // Ready for live POST once CSRF + user id wiring lands.
  const form = buildLogFormBody(entry, { gameId });

  if (dryRun) {
    return { ok: true, dryRun: true, skipped: false };
  }

  console.warn('[bdt] createBackloggdLog not posted yet:', title, form);
  return { ok: false, error: 'Backloggd write API not implemented yet' };
}
