/** Site origin for same-origin requests (www vs apex). */
export function backloggdOrigin() {
  if (typeof location !== 'undefined' && location.origin) {
    return location.origin;
  }
  return 'https://www.backloggd.com';
}

/**
 * Absolute URL on the current Backloggd host.
 * @param {string} path
 * @returns {string}
 */
export function backloggdUrl(path) {
  return new URL(path, `${backloggdOrigin()}/`).href;
}
