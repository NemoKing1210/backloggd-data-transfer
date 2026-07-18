/**
 * Backloggd platform catalog (IGDB-aligned ids) with flexible aliases.
 * `name` is the catalog label (e.g. "Windows PC"); log tab title stays "Log".
 *
 * @typedef {{
 *   id: number,
 *   name: string,
 *   aliases?: string[],
 * }} BackloggdPlatform
 *
 * @typedef {{ id: number, name: string }} ResolvedPlatform
 */

/** @type {readonly BackloggdPlatform[]} */
export const BACKLOGGD_PLATFORMS = Object.freeze([
  {
    id: 6,
    name: 'Windows PC',
    aliases: [
      'pc',
      'windows',
      'win',
      'win32',
      'windows pc',
      'microsoft windows',
      'pc (microsoft windows)',
      'pc microsoft windows',
      'steam',
      'steamos',
      'steam deck',
      'steamdeck',
      'deck',
    ],
  },
  {
    id: 14,
    name: 'Mac',
    aliases: ['macos', 'mac os', 'osx', 'os x', 'apple', 'macintosh'],
  },
  {
    id: 3,
    name: 'Linux',
    aliases: ['gnu/linux', 'ubuntu', 'debian'],
  },
  {
    id: 167,
    name: 'PlayStation 5',
    aliases: ['ps5', 'ps 5', 'playstation5', 'sony playstation 5'],
  },
  {
    id: 48,
    name: 'PlayStation 4',
    aliases: ['ps4', 'ps 4', 'playstation4', 'sony playstation 4'],
  },
  {
    id: 9,
    name: 'PlayStation 3',
    aliases: ['ps3', 'ps 3', 'playstation3'],
  },
  {
    id: 8,
    name: 'PlayStation 2',
    aliases: ['ps2', 'ps 2', 'playstation2'],
  },
  {
    id: 7,
    name: 'PlayStation',
    aliases: ['ps1', 'psx', 'ps one', 'playstation 1', 'playstation one'],
  },
  {
    id: 46,
    name: 'PlayStation Vita',
    aliases: ['ps vita', 'psvita', 'vita', 'psv'],
  },
  {
    id: 38,
    name: 'PlayStation Portable',
    aliases: ['psp', 'playstation portable'],
  },
  {
    id: 169,
    name: 'Xbox Series X|S',
    aliases: [
      'xbox series',
      'xbox series x',
      'xbox series s',
      'xbox series x/s',
      'xbox series x|s',
      'xsx',
      'xss',
      'series x',
      'series s',
    ],
  },
  {
    id: 49,
    name: 'Xbox One',
    aliases: ['xboxone', 'xb1', 'xone'],
  },
  {
    id: 12,
    name: 'Xbox 360',
    aliases: ['x360', 'xbox360'],
  },
  {
    id: 11,
    name: 'Xbox',
    aliases: ['xbox original', 'og xbox'],
  },
  {
    id: 130,
    name: 'Nintendo Switch',
    aliases: ['switch', 'nsw', 'ns'],
  },
  {
    id: 508,
    name: 'Nintendo Switch 2',
    aliases: ['switch 2', 'nsw2', 'ns2'],
  },
  {
    id: 41,
    name: 'Wii U',
    aliases: ['wiiu'],
  },
  {
    id: 5,
    name: 'Wii',
    aliases: ['nintendo wii'],
  },
  {
    id: 37,
    name: 'Nintendo 3DS',
    aliases: ['3ds', 'n3ds', 'new 3ds'],
  },
  {
    id: 20,
    name: 'Nintendo DS',
    aliases: ['nds', 'ds', 'dsi'],
  },
  {
    id: 21,
    name: 'Nintendo GameCube',
    aliases: ['gamecube', 'gcn', 'ngc'],
  },
  {
    id: 4,
    name: 'Nintendo 64',
    aliases: ['n64', 'nintendo64'],
  },
  {
    id: 19,
    name: 'Super Nintendo Entertainment System',
    aliases: ['snes', 'super nintendo', 'super nes', 'super famicom'],
  },
  {
    id: 18,
    name: 'Nintendo Entertainment System',
    aliases: ['nes', 'famicom'],
  },
  {
    id: 24,
    name: 'Game Boy Advance',
    aliases: ['gba', 'gameboy advance'],
  },
  {
    id: 22,
    name: 'Game Boy Color',
    aliases: ['gbc', 'gameboy color'],
  },
  {
    id: 33,
    name: 'Game Boy',
    aliases: ['gb', 'gameboy'],
  },
  {
    id: 34,
    name: 'Android',
    aliases: ['google play', 'mobile android'],
  },
  {
    id: 39,
    name: 'iOS',
    aliases: ['iphone', 'ipad', 'apple ios', 'mobile ios'],
  },
  {
    id: 82,
    name: 'Web browser',
    aliases: ['browser', 'web', 'html5', 'flash'],
  },
  {
    id: 52,
    name: 'Arcade',
    aliases: ['arcade cabinet', 'coin-op'],
  },
  {
    id: 163,
    name: 'SteamVR',
    aliases: ['steam vr', 'valve index'],
  },
  {
    id: 162,
    name: 'Oculus VR',
    aliases: ['oculus', 'meta quest', 'quest', 'quest 2', 'quest 3', 'rift'],
  },
  {
    id: 165,
    name: 'PlayStation VR',
    aliases: ['psvr', 'ps vr', 'playstation vr', 'psvr2', 'ps vr2'],
  },
  {
    id: 170,
    name: 'Google Stadia',
    aliases: ['stadia'],
  },
  {
    id: 309,
    name: 'Amazon Luna',
    aliases: ['luna'],
  },
  {
    id: 386,
    name: 'Meta Quest 2',
    aliases: ['oculus quest 2'],
  },
  {
    id: 471,
    name: 'Meta Quest 3',
    aliases: ['oculus quest 3'],
  },
]);

/** @type {Map<number, BackloggdPlatform>} */
const BY_ID = new Map(BACKLOGGD_PLATFORMS.map((p) => [p.id, p]));

/** @type {Map<string, BackloggdPlatform>} */
const BY_NAME = new Map(
  BACKLOGGD_PLATFORMS.map((p) => [normalizePlatformKey(p.name), p]),
);

/** @type {Map<string, BackloggdPlatform>} */
const BY_ALIAS = (() => {
  /** @type {Map<string, BackloggdPlatform>} */
  const map = new Map();
  for (const platform of BACKLOGGD_PLATFORMS) {
    map.set(normalizePlatformKey(platform.name), platform);
    for (const alias of platform.aliases || []) {
      const key = normalizePlatformKey(alias);
      if (key && !map.has(key)) map.set(key, platform);
    }
  }
  return map;
})();

/**
 * @param {string} value
 */
export function normalizePlatformKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_/|]+/g, ' ')
    .replace(/[()[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Exact Backloggd name or numeric id (not alias-only).
 * @param {unknown} raw
 */
export function isCanonicalPlatformValue(raw) {
  return findCanonicalPlatform(raw) != null;
}

/**
 * @param {unknown} raw
 * @returns {ResolvedPlatform | null}
 */
export function findCanonicalPlatform(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) {
    const platform = BY_ID.get(Number(s));
    return platform ? { id: platform.id, name: platform.name } : null;
  }

  const byName = BY_NAME.get(normalizePlatformKey(s));
  return byName ? { id: byName.id, name: byName.name } : null;
}

/**
 * Resolve via aliases / fuzzy catalog lookup (no user map).
 * @param {unknown} raw
 * @returns {ResolvedPlatform | null}
 */
export function mapPlatformToBackloggd(raw) {
  const canonical = findCanonicalPlatform(raw);
  if (canonical) return canonical;

  const s = String(raw || '').trim();
  if (!s) return null;

  const byAlias = BY_ALIAS.get(normalizePlatformKey(s));
  if (byAlias) return { id: byAlias.id, name: byAlias.name };

  // Soft contains match against names (e.g. "Sony PlayStation 5 Digital")
  const key = normalizePlatformKey(s);
  let best = null;
  let bestScore = 0;
  for (const platform of BACKLOGGD_PLATFORMS) {
    const nameKey = normalizePlatformKey(platform.name);
    let score = 0;
    if (key === nameKey) score = 100;
    else if (key.includes(nameKey) || nameKey.includes(key)) score = 70;
    else {
      for (const alias of platform.aliases || []) {
        const a = normalizePlatformKey(alias);
        if (!a) continue;
        if (key === a) {
          score = Math.max(score, 95);
          break;
        }
        if (key.includes(a) || a.includes(key)) score = Math.max(score, 55);
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = platform;
    }
  }

  if (best && bestScore >= 70) return { id: best.id, name: best.name };
  return null;
}

/**
 * @param {number | string | null | undefined} idOrName
 * @returns {ResolvedPlatform | null}
 */
export function platformByIdOrName(idOrName) {
  if (idOrName == null || idOrName === '') return null;
  return findCanonicalPlatform(idOrName) || mapPlatformToBackloggd(idOrName);
}

/**
 * Options for platform select in value-map UI.
 * @returns {{ value: string, label: string }[]}
 */
export function platformSelectOptions() {
  return BACKLOGGD_PLATFORMS.map((p) => ({
    value: String(p.id),
    label: `${p.name} · ${p.id}`,
  }));
}
