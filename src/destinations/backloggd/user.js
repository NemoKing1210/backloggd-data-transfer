/**
 * Current Backloggd username from the navbar (logged-in session).
 * @returns {string}
 */
export function getCurrentUsername() {
  const candidates = [
    document.querySelector('#profile-li .dropdown-menu a[href^="/u/"]'),
    document.querySelector('#profile-li a[href^="/u/"]'),
    document.querySelector('#mobile-user-nav a[href^="/u/"]'),
    document.querySelector('a.nav-link[href^="/u/"]'),
    document.querySelector('a[href^="/u/"][href$="/"]'),
  ];

  for (const el of candidates) {
    const href = el?.getAttribute?.('href') || '';
    const match = href.match(/^\/u\/([^/?#]+)/i);
    if (match?.[1] && match[1].toLowerCase() !== 'games') {
      return decodeURIComponent(match[1]);
    }
  }

  return '';
}
