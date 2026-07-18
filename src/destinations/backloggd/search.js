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

/**
 * Resolve a Backloggd game from a numeric id and/or `/games/{slug}/` URL.
 * Uses the game page when a slug is available; otherwise tries autocomplete
 * with `hintTitle` to fill slug/title/year for the given id.
 *
 * @param {string | number} raw
 * @param {{ hintTitle?: string }} [options]
 * @returns {Promise<BackloggdGameMatch>}
 */
export async function resolveBackloggdGameByIdOrUrl(raw, options = {}) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    throw new Error('Empty game id');
  }

  const hintTitle = String(options.hintTitle || '').trim();
  const fromUrl = parseGamesPath(trimmed);

  if (fromUrl?.slug && !/^\d+$/.test(fromUrl.slug)) {
    const fromPage = await fetchGameFromSlugPage(fromUrl.slug);
    if (fromPage) return fromPage;
    throw new Error(`Game page not found: ${fromUrl.slug}`);
  }

  const id = Number(fromUrl?.slug || trimmed);
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    throw new Error('Invalid game id');
  }

  if (hintTitle) {
    const { suggestions } = await searchBackloggdSuggestions(hintTitle);
    const hit = suggestions.find((s) => s.id === id);
    if (hit) {
      return { ...hit, score: 100 };
    }
  }

  // Id alone is enough to import; enrich later if the user pastes a URL.
  return {
    id,
    slug: '',
    title: hintTitle || `#${id}`,
    year: '',
    score: 100,
    url: '',
  };
}

/**
 * @param {string} raw
 * @returns {{ slug: string } | null}
 */
function parseGamesPath(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    if (/^https?:\/\//i.test(s) || s.startsWith('/')) {
      const url = s.startsWith('/')
        ? new URL(s, backloggdUrl('/'))
        : new URL(s);
      const m = url.pathname.match(/\/games\/([^/?#]+)/i);
      if (m?.[1]) return { slug: decodeURIComponent(m[1]) };
    }
  } catch (_) {
    /* not a URL */
  }
  const m = s.match(/\/games\/([^/?#]+)/i);
  if (m?.[1]) return { slug: decodeURIComponent(m[1]) };
  return null;
}

/**
 * @param {string} slug
 * @returns {Promise<BackloggdGameMatch | null>}
 */
async function fetchGameFromSlugPage(slug) {
  const url = backloggdUrl(`/games/${encodeURIComponent(slug)}/`);
  const html = await fetchHtml(url);
  if (!html || /game not found|page not found/i.test(html)) return null;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const idEl =
    doc.querySelector(`.game-cover[game_id], [game_id].game-cover, [game_id]`) ||
    null;
  const id = Number(idEl?.getAttribute('game_id'));
  if (!Number.isFinite(id) || id <= 0) return null;

  const ogTitle =
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    '';
  const h1 = doc.querySelector('h1')?.textContent || '';
  let title = String(ogTitle || h1)
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*[|·•].*$/, '')
    .trim();
  if (!title) title = slug;

  const yearFromOg = String(ogTitle).match(/\((\d{4})\)/)?.[1] || '';
  const yearFromBody =
    doc.body?.textContent?.match(
      /(?:Released|Release|Выход)[^\d]{0,24}(\d{4})/i,
    )?.[1] || '';
  const year = yearFromOg || yearFromBody || '';

  return {
    id,
    slug,
    title,
    year,
    score: 100,
    url,
  };
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchHtml(url) {
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    try {
      const html = await gmRequest({
        url,
        method: 'GET',
        responseType: 'text',
        headers: { Accept: 'text/html' },
        timeout: 20000,
      });
      if (typeof html === 'string' && html) return html;
    } catch (_) {
      /* keep original */
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
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
