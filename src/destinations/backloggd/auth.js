import { getCurrentUsername } from './user.js';

/** @type {number | null} */
let cachedUserId = null;

/**
 * Whether the current page session looks logged in.
 * @returns {boolean}
 */
export function isLoggedIn() {
  if (getCurrentUsername()) return true;

  if (
    document.querySelector(
      '#profile-li, #add-a-game, #mobile-user-nav, a[href*="sign_out"], a[data-method="delete"][href*="sign_out"]',
    )
  ) {
    return true;
  }

  const hasSignIn = Boolean(
    document.querySelector('a[href*="/users/sign_in"], a[href*="sign_in"]'),
  );
  const hasCsrf = Boolean(getCsrfToken());
  return hasCsrf && !hasSignIn;
}

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
 * Find numeric Backloggd user id without throwing.
 * Prefers page elements with a `user_id` attribute, then session cache.
 * @returns {number | null}
 */
export function findBackloggdUserId() {
  if (cachedUserId != null) return cachedUserId;

  const username = getCurrentUsername();

  const fromAttr = readUserIdFromUserIdAttr();
  if (fromAttr != null) {
    return rememberUserId(fromAttr, username);
  }

  const stored = readStoredUserId(username);
  if (stored != null) {
    cachedUserId = stored;
    return stored;
  }

  return null;
}

/**
 * Resolve numeric Backloggd user id (needed for log POST URL).
 * @returns {Promise<number>}
 */
export async function resolveBackloggdUserId() {
  const id = findBackloggdUserId();
  if (id != null) return id;

  throw new Error(
    isLoggedIn()
      ? 'Could not find user_id on the page. Enter your Backloggd user id manually.'
      : 'Could not resolve Backloggd user id (are you logged in?)',
  );
}

/**
 * Persist a manually entered (or detected) user id for this session.
 * @param {number | string} raw
 * @returns {number}
 */
export function setBackloggdUserId(raw) {
  const id = Number(raw);
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) {
    throw new Error('Invalid Backloggd user id');
  }
  return rememberUserId(id, getCurrentUsername());
}

/**
 * Read numeric id from elements that expose a `user_id` attribute.
 * @returns {number | null}
 */
function readUserIdFromUserIdAttr() {
  const nodes = document.querySelectorAll('[user_id]');
  for (const el of nodes) {
    const id = parsePositiveInt(el.getAttribute('user_id'));
    if (id != null) return id;
  }
  return null;
}

/**
 * @param {string | null | undefined} raw
 * @returns {number | null}
 */
function parsePositiveInt(raw) {
  if (raw == null || raw === '') return null;
  const id = Number(String(raw).trim());
  if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) return null;
  return id;
}

/**
 * @param {number} id
 * @param {string} username
 * @returns {number}
 */
function rememberUserId(id, username) {
  cachedUserId = id;
  writeStoredUserId(username, id);
  return id;
}

/**
 * @param {string} username
 * @returns {number | null}
 */
function readStoredUserId(username) {
  if (!username || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`bdt_uid:${username.toLowerCase()}`);
    return parsePositiveInt(raw);
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} username
 * @param {number} id
 */
function writeStoredUserId(username, id) {
  if (!username || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`bdt_uid:${username.toLowerCase()}`, String(id));
  } catch (_) {
    /* ignore quota / private mode */
  }
}
