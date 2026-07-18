import { getCurrentUsername } from './user.js';
import { backloggdUrl } from './site.js';

/** @type {number | null} */
let cachedUserId = null;

/**
 * CSRF token from the logged-in Backloggd page (Rails).
 * @returns {string}
 */
export function getCsrfToken() {
  const meta = document
    .querySelector('meta[name="csrf-token"]')
    ?.getAttribute('content');
  if (meta) return meta.trim();

  const input = /** @type {HTMLInputElement | null} */ (
    document.querySelector('input[name="authenticity_token"]')
  );
  if (input?.value) return input.value.trim();

  return '';
}

/**
 * Resolve numeric Backloggd user id (needed for log POST URL).
 * Cached for the page session.
 * @returns {Promise<number>}
 */
export async function resolveBackloggdUserId() {
  if (cachedUserId != null) return cachedUserId;

  const fromDom = extractUserIdFromHtml(document.documentElement?.outerHTML || '');
  if (fromDom != null) {
    cachedUserId = fromDom;
    return fromDom;
  }

  const username = getCurrentUsername();
  const paths = [];
  if (username) {
    paths.push(`/u/${encodeURIComponent(username)}/`);
    paths.push(`/u/${encodeURIComponent(username)}/games/`);
  }
  paths.push('/settings/');

  for (const path of paths) {
    try {
      const html = await fetchHtml(backloggdUrl(path));
      const id = extractUserIdFromHtml(html);
      if (id != null) {
        cachedUserId = id;
        return id;
      }
    } catch (_) {
      /* try next */
    }
  }

  throw new Error('Could not resolve Backloggd user id (are you logged in?)');
}

/**
 * @param {string} html
 * @returns {number | null}
 */
export function extractUserIdFromHtml(html) {
  if (!html) return null;

  const patterns = [
    /\/api\/user\/(\d+)(?:\/|$)/,
    /["']user_id["']\s*[:=]\s*["']?(\d+)/i,
    /["']userId["']\s*[:=]\s*["']?(\d+)/i,
    /data-user-id=["'](\d+)["']/i,
    /data-userid=["'](\d+)["']/i,
    /name=["']user_id["'][^>]*value=["'](\d+)["']/i,
    /value=["'](\d+)["'][^>]*name=["']user_id["']/i,
    /\/users\/(\d+)(?:\/|"|'|\s|$)/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      const id = Number(match[1]);
      if (Number.isFinite(id) && id > 0) return id;
    }
  }

  return null;
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchHtml(url) {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'same-origin',
    headers: { Accept: 'text/html' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
