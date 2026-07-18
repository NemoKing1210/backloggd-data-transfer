/**
 * Current Backloggd username from the navbar (logged-in session).
 * @returns {string}
 */
export function getCurrentUsername() {
  const candidates = [
    document.querySelector('#profile-li .dropdown-menu a[href^="/u/"]'),
    document.querySelector('#profile-li a[href^="/u/"]'),
    document.querySelector('#mobile-user-nav a[href^="/u/"]'),
    document.querySelector('a.dropdown-item[href^="/u/"]'),
    document.querySelector('a.nav-link[href^="/u/"]'),
    document.querySelector('a[href^="/u/"][href$="/"]'),
  ];

  for (const el of candidates) {
    const href = el?.getAttribute?.('href') || '';
    const match = href.match(/^\/u\/([^/?#]+)/i);
    if (match?.[1] && !['games', 'users', 'search'].includes(match[1].toLowerCase())) {
      return decodeURIComponent(match[1]);
    }
  }

  // Fallback: visible profile name next to the chevron (href is often "#").
  const label = document.querySelector('#navbarDropdown')?.textContent || '';
  const name = label.replace(/\s+/g, ' ').trim().split(' ')[0];
  if (name && name.length >= 2 && !/chevron|menu/i.test(name)) {
    return name;
  }

  return '';
}
