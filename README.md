# Backloggd Data Transfer

[![CI](https://github.com/NemoKing1210/backloggd-data-transfer/actions/workflows/ci.yml/badge.svg)](https://github.com/NemoKing1210/backloggd-data-transfer/actions/workflows/ci.yml)
[![Install userscript](https://img.shields.io/badge/Install-userscript-3db89a?style=for-the-badge)](https://raw.githubusercontent.com/NemoKing1210/backloggd-data-transfer/main/backloggd-data-transfer.user.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.7.0-green?style=for-the-badge)](CHANGELOG.md)

Userscript that **imports game logs into [Backloggd](https://www.backloggd.com)** from other platforms via a **unified transfer JSON** (or CSV). Backloggd has no native import/export — this fills that gap.

Compatible with [Tampermonkey](https://www.tampermonkey.net/), [Violentmonkey](https://violentmonkey.github.io/), [Greasemonkey](https://www.greasespot.net/), [ScriptCat](https://scriptcat.org/), and similar managers.

> **Status:** early (`0.7.0`). Runs on Backloggd only. Transfer format **v2** mirrors the native log POST body. Import, CSV mapping, match cache, and multi-log cleanup are live; full library export is next.

Companion to [Backloggd Plus](https://github.com/NemoKing1210/backloggd-plus) (enrichment UI). **Not affiliated with Backloggd.**

---

## Table of contents

- [How it works](#how-it-works)
- [Install](#install)
- [Using the panel](#using-the-panel)
- [Import wizard](#import-wizard)
- [Cleanup](#cleanup)
- [Cache, history & settings](#cache-history--settings)
- [Transfer format](#transfer-format)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

---

## How it works

```text
Other platforms / CSV / tools
        │
        ▼
  transfer JSON (v2)  ──►  Backloggd Data Transfer  ──►  POST logs
        ▲
        │
  Backloggd library   ──►  transfer JSON   (export — planned)
```

1. Produce a `backloggd-transfer` file ([format spec](docs/transfer-format.md)), or a CSV you’ll map in the panel.
2. On **backloggd.com** (signed in), open **Transfer** in the navbar (or the userscript menu).
3. Walk the import wizard: file → (optional CSV map) → match & review → write logs.
4. Optionally use **Cleanup** to find games with more than one log and tidy them on the site.

Prefixes `bdt_` / `data-bdt-*` keep storage and DOM separate from Backloggd Plus (`blp_`).

---

## Install

1. Install a userscript manager (Tampermonkey, Violentmonkey, Greasemonkey, ScriptCat, …).
2. Click **Install userscript**, or open the raw file:

```text
https://raw.githubusercontent.com/NemoKing1210/backloggd-data-transfer/main/backloggd-data-transfer.user.js
```

3. Confirm the install in your manager, then visit [backloggd.com](https://www.backloggd.com) while logged in.

Local build: run `npm run build` and install `backloggd-data-transfer.user.js` from the repo root (do not hand-edit that file — it is generated).

Updates: managers pick up new versions via `@updateURL` / `@version` when you bump and rebuild.

---

## Using the panel

| Entry point | Where |
|-------------|--------|
| Navbar **Transfer** | Same slot as Log a Game / Plus (`#bdt-nav-transfer`) |
| Userscript menu | “Backloggd Data Transfer” |

| Tab | Purpose |
|-----|---------|
| **Import** | Stepped wizard: JSON or CSV → match → write logs |
| **Export** | Placeholder until library export ships |
| **Cleanup** | Scan for games with 2+ logs; deep-link to tidy |
| **History** | Recent transfer sessions |
| **Cache** | Match cache meter, stats, clear actions |
| **Settings** | Language, delays, parallelism, debug |
| **About** | Version, author, links |

UI languages: English and Russian (or follow browser locale).

---

## Import wizard

### Steps

| Step | What happens |
|------|----------------|
| **File** | Choose **Transfer JSON** or **CSV**, drop/browse a file, optional example download |
| **Map** | CSV only — column mapping + status / rating / platform value maps |
| **Review** | Parallel title match, filters, selection, summary stats |
| **Import** | Parallel `POST` of selected matches with live progress |

### Transfer JSON

Use the canonical `backloggd-transfer` document (version **2**). Fields align with Backloggd’s create-log form (`log`, `playthroughs`, `dates`). v1 files are still accepted and migrated on read.

### CSV

1. Auto-detect columns (title, status, rating, dates, platform, …).
2. Adjust mappings; map non-Backloggd labels (e.g. Notion / Plus-style statuses) to canonical values.
3. Manual vs auto mappings are labeled; only manual choices are remembered for next time.
4. Continue to the same Review → Import flow as JSON.

### Matching & review

- Titles resolve via Backloggd autocomplete; hits fill `game_id` / `slug`.
- **Match cache** reuses previous title → game lookups (skips network on hits).
- Duplicate titles in the file are deduped before match; the summary reports what was removed.
- Your library is indexed so rows already logged can be marked and left unchecked by default (`Import existing` off).
- Unmatched rows: paste a Backloggd `game_id` or `/games/slug/` URL to resolve manually.
- Filters: your log (existing / new), match status, cache vs live, selection; search by file or Backloggd title.
- Progress shows parallel in-flight title chips while reading.

### Writing logs

- Creates logs with the same form fields as the native editor (CSRF + user id from the page session).
- Parallel writes use the same concurrency setting as Read / Cleanup.
- Live log: progress bar, active game chips, ok / fail / skip counters, elapsed time.
- Skips (e.g. already in library) are separate from failures.
- Sign-in required; if user id cannot be inferred, the panel asks for it.

---

## Cleanup

After imports (or anytime), open **Cleanup**:

1. Scan your library for games with **more than one** log.
2. Expand a card to see each log (rating, platform, dates / badges).
3. **Open logs** on Backloggd to merge or delete duplicates manually.

Scanning uses the same parallel request pool as import (library pages + per-game probes).

---

## Cache, history & settings

### Cache

- Stores successful and negative title → game matches (with TTLs).
- Meter shows approximate fill vs a soft budget; stats for hits/misses, history, CSV maps, settings.
- Clear game cache, or **Clear all cache** (matches + history + CSV maps; settings kept).

### History

Keeps the latest transfer sessions so you can see what you imported recently.

### Settings

| Setting | Notes |
|---------|--------|
| **Language** | Auto, English, or Russian |
| **Import delay** | Pause between network waves (ms) |
| **Parallel requests** | Concurrent lookups / library / import (1–8) |
| **Debug mode** | Extra detail on Review (e.g. indexed library sources) |

---

## Transfer format

Full specification: **[docs/transfer-format.md](docs/transfer-format.md)**.

Minimal document:

```json
{
  "format": "backloggd-transfer",
  "version": 2,
  "exportedAt": "2026-07-18T12:00:00.000Z",
  "source": {
    "platform": "custom",
    "label": "my-library.json"
  },
  "entries": [
    {
      "game_id": null,
      "title": "Raft",
      "slug": "",
      "log": {
        "game_liked": false,
        "is_play": true,
        "is_playing": false,
        "is_backlog": false,
        "is_wishlist": false,
        "status": "completed",
        "total_hours": null,
        "total_minutes": null,
        "time_source": 1,
        "override_cover_id": null
      },
      "playthroughs": [
        {
          "title": "Windows PC",
          "rating": 5,
          "review": "",
          "review_spoilers": false,
          "platform": 6,
          "start_date": "2024-08-02",
          "finish_date": "2024-08-03"
        }
      ],
      "dates": []
    }
  ]
}
```

| `log.status` | Meaning on Backloggd |
|--------------|----------------------|
| `wishlist` | Wishlist |
| `backlog` | Backlog |
| `playing` | Playing |
| `played` | Played (nothing specific) |
| `completed` | Completed (main objective) |
| `shelved` | Shelved |
| `abandoned` | Abandoned |
| `retired` | Retired |

Ratings use Backloggd’s **1–10** half-star scale. `game_id` may be `null` — the Read step resolves it from `title`.

External tools and future source adapters should emit this JSON; the Backloggd importer stays shared. Notion already has native export — this project does **not** scrape Notion.

---

## Development

Same toolchain as [backloggd-plus](https://github.com/NemoKing1210/backloggd-plus): Vite + [vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey).

```bash
npm install
npm run dev      # Vite serve — install the "dev:" userscript from the open URL
npm run build    # Production → dist/ + copy to root install artifacts
npm run ci       # build + verify dist ↔ committed .user.js / .meta.js
```

Requires **Node.js 20+** (see `.nvmrc`).

| Path | Role |
|------|------|
| `src/main.js` | Bootstrap |
| `src/format/` | Schema, parse, serialize, CSV, status maps |
| `src/destinations/backloggd/` | Search, create-log, library, multi-log scan |
| `src/features/` | Panel, import, cleanup, cache, settings, toast |
| `src/i18n/` | en + ru |
| `docs/transfer-format.md` | Format spec |
| `backloggd-data-transfer.user.js` | Canonical install artifact (**generated**) |

Edit under `src/`, then `npm run build`. Version source of truth: `package.json` → drives `@version`, in-app version, and CI artifact checks. User-visible changes: bump version + [CHANGELOG.md](CHANGELOG.md), then rebuild. See [AGENTS.md](AGENTS.md) for conventions.

---

## Roadmap

- [x] Project scaffold + transfer format (v2)
- [x] Backloggd search + live log import
- [x] CSV import with column / value mapping
- [x] Match cache + history + settings
- [x] Multi-log cleanup scan
- [x] Parallel read / library / import
- [ ] Export library from Backloggd → transfer JSON
- [ ] Additional source adapters as needed

---

## License

[MIT](LICENSE)
