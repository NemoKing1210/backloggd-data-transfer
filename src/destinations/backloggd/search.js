import { gmRequest } from '../../gm.js';
import { scoreTitleMatch } from '../../utils/title.js';
import { backloggdUrl } from './site.js';

/** Minimum score to accept an autocomplete suggestion as a match. */
export const MATCH_MIN_SCORE = 72;

/**
 * @typedef {object} BackloggdGameMatch
 * @property {number} id
 * @property {string} slug
 * @property {string} title
 * @property {string} [year]
 * @property {number} score
 * @property {string} url
 */

/**
 * @param {string} title
 * @returns {Promise<{ suggestions: BackloggdGameMatch[], best: BackloggdGameMatch | null }>}
 */
export async function searchBackloggdSuggestions(title) {
  const q = String(title || '').trim();
  if (!q) return { suggestions: [], best: null };

  const url = backloggdUrl(`/autocomplete?query=${encodeURIComponent(q)}`);
  const data = await fetchAutocomplete(url);
  const raw = Array.isArray(data?.suggestions) ? data.suggestions : [];

  const suggestions = raw
    .map((item) => {
      const d = item?.data || {};
      const id = Number(d.id);
      const matchTitle = String(d.title || item?.value || '').trim();
      const slug = String(d.slug || '').trim();
      if (!Number.isFinite(id) || !matchTitle) return null;
      return {
        id,
        slug,
        title: matchTitle,
        year: d.year != null ? String(d.year) : '',
        score: scoreTitleMatch(q, matchTitle),
        url: slug ? backloggdUrl(`/games/${encodeURIComponent(slug)}/`) : '',
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const best =
    suggestions.find((s) => s.score >= MATCH_MIN_SCORE) ||
    (suggestions[0]?.score === 100 ? suggestions[0] : null);

  return { suggestions, best: best || null };
}

/**
 * Resolve a single title to a Backloggd game (or null).
 * @param {string} title
 * @returns {Promise<BackloggdGameMatch | null>}
 */
export async function searchBackloggdGame(title) {
  const { best } = await searchBackloggdSuggestions(title);
  return best;
}

async function fetchAutocomplete(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_) {
    return gmRequest({
      url,
      method: 'GET',
      responseType: 'json',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      timeout: 15000,
    });
  }
}
