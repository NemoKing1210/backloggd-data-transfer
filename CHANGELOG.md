# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.4] - 2026-07-18

### Changed

- Toasts appear in the top-right corner.

## [0.6.3] - 2026-07-18

### Added

- Match results table: search by file title or Backloggd title.
- Parallel matching (4 concurrent lookups) with live in-flight title chips on the progress bar.

### Changed

- Match stage progress shows parallel activity instead of a single sequential title.

## [0.6.2] - 2026-07-18

### Changed

- Log tab title uses the platform name again when available; falls back to `Log`.

## [0.6.1] - 2026-07-18

### Removed

- Cleanup in-panel Delete action (open the game on Backloggd to remove logs).

## [0.6.0] - 2026-07-18

### Added

- Cleanup cards expand to list each log with rating, platform, dates/badges.

## [0.5.6] - 2026-07-18

### Fixed

- Cleanup “Open logs” button: replace missing `fa-arrow-up-right-from-square` with an inline SVG.

## [0.5.5] - 2026-07-18

### Fixed

- Cleanup multi-log detection: count `.playthrough-view` blocks / `playthrough_id` on the profile logs page (not editor-only markup).

## [0.5.4] - 2026-07-18

### Fixed

- Cleanup multi-log count: stop treating profile chrome (“username”, “No play sessions logged”, months) as extra logs; prefer `#playthrough-container [playthrough_id]`.

## [0.5.3] - 2026-07-18

### Fixed

- Cleanup idle icon: replace missing `fa-clone` with an inline SVG so the glyph always shows.

## [0.5.2] - 2026-07-18

### Added

- **Clear all cache** on the Cache tab: wipes game matches, transfer history, and CSV value maps (settings kept).

## [0.5.1] - 2026-07-18

### Fixed

- Primary button text (e.g. “Open logs”) stayed invisible on Cleanup cards — site link styles overrode the dark label color.

## [0.5.0] - 2026-07-18

### Added

- **Cleanup** tab: scan your Backloggd library for games with more than one log, then open each log page to tidy duplicates.

## [0.4.3] - 2026-07-18

### Changed

- Rating placeholders (`...`, `-`, `—`, `n/a`, `none`, `?`, …) auto-map to no rating instead of “unmapped”.

## [0.4.2] - 2026-07-18

### Changed

- Auto-map MMORPG, Roguelike, Sandbox, Gacha, Infinity/Infinite, Session (and Endless) status labels to `played`.

## [0.4.1] - 2026-07-18

### Added

- `played` as its own Backloggd `log.status` (separate from `completed`) in status mapping.
- Reset button on CSV value-map blocks; manual vs auto mappings are labeled and only manual choices are remembered.

## [0.4.0] - 2026-07-18

### Added

- Manual Backloggd `game_id` (or `/games/slug/` URL) on unmatched rows — looks up metadata and updates the match table.

## [0.3.9] - 2026-07-18

### Fixed

- Existing-log detection: scrape real profile lists (`/games/added/type:…`), fix “Next” pagination, and probe `/u/{user}/logs/{slug}/` (GET log API is 404-only). Stops duplicate playthroughs when re-importing.

## [0.3.8] - 2026-07-18

### Changed

- Transfer panel is ~1.5× larger (up to 1560×1380).

## [0.3.7] - 2026-07-18

### Fixed

- Import now writes start/finish dates (journal session derived from playthrough dates when `dates[]` is missing).
- Log tab title defaults to `Log` instead of the platform name.

## [0.3.6] - 2026-07-18

### Added

- Filters on the match results table: your log (already have / new), match status, cache vs live, and selection.

## [0.3.5] - 2026-07-18

### Changed

- Deduplicate import list by title before matching; summary and read-issues list report which duplicates were removed.

## [0.3.4] - 2026-07-18

### Fixed

- Library detection during Read used fragile `/games/added/…` pagination and could miss existing logs; now scrapes main shelves with `?page=` + duplicate-page stop, and re-probes each game before import when “Import existing” is off (skips instead of creating duplicates).

## [0.3.3] - 2026-07-18

### Changed

- Unified tab badge styling (History, Cache, Export).

## [0.3.2] - 2026-07-18

### Added

- Fill percentage badge on the Cache tab.

## [0.3.1] - 2026-07-18

### Changed

- Cache tab shows a prominent fill percentage next to the storage meter.

## [0.3.0] - 2026-07-18

### Added

- Game match cache: title → `game_id` / slug reused on later Reads (skips network + delay on hits).
- Cache tab with storage meter (games hits/misses, history, CSV maps, settings), stats, recent lookups, and clear actions.

## [0.2.5] - 2026-07-18

### Added

- Show total elapsed time after import (summary, live log, and toast).

## [0.2.4] - 2026-07-18

### Added

- Rich live import log: current game, progress bar, ok/fail/skip counters, and a scrollable result list.

### Fixed

- Unmatched / error rows from the read step are no longer selectable or imported (`game_id not resolved`); skips are logged separately from failures.

## [0.2.3] - 2026-07-18

### Added

- CSV platform value mapping (e.g. `PC` → Windows PC) with a flexible alias catalog and remembered choices.

### Changed

- Status / rating / platform value-mapping blocks are collapsed by default.

## [0.2.2] - 2026-07-18

### Added

- Remember CSV status/rating value mappings across sessions (saved choices fill in next time).

## [0.2.1] - 2026-07-18

### Added

- CSV status/rating value mapping: detect non-Backloggd formats, show conversion tables with editable selects (Notion/Plus-style labels supported).

## [0.2.0] - 2026-07-18

### Added

- CSV import with auto column detection and a mapping step (selects + sample values) before game matching.
- Notion-style status/date/rating labels normalized into transfer v2 fields.

## [0.1.5] - 2026-07-18

### Added

- Export tab in the transfer panel (locked placeholder until Backloggd export ships).
- Transfer history tab, About author card, stepped import wizard polish, and random jitter between Backloggd requests.

## [0.1.4] - 2026-07-18

### Added

- Live Backloggd log import: `POST /api/user/{userId}/log/{gameId}` with CSRF + resolved user id from the page session.

## [0.1.3] - 2026-07-18

### Changed

- Transfer format **v2**: entry shape mirrors Backloggd log POST (`game_id`, `log`, `playthroughs`, `dates`); dropped tags / flat v1 field names. Parser still migrates v1 files.
- Read step matches titles via Backloggd `/autocomplete` (progress bar + results table; fills `game_id` / `slug`).

### Fixed

- Navbar Transfer icon: use `fa-layer-group` (present on Backloggd) instead of missing `fa-file-import`.

## [0.1.2] - 2026-07-18

### Changed

- Navbar **Transfer** button next to Log a Game / Plus (same slot as Backloggd Plus); removed floating FAB.

## [0.1.1] - 2026-07-18

### Removed

- Notion host matching, panel tab, and CSV → transfer JSON export (Notion already exports on its own).

### Changed

- Script runs only on Backloggd; import accepts unified transfer JSON.

## [0.1.0] - 2026-07-18

### Added

- Project scaffold (Vite + vite-plugin-monkey), mirroring Backloggd Plus tooling.
- Unified `backloggd-transfer` JSON format (v1) with parse/serialize helpers.
- Notion CSV → transfer JSON converter (status/rating mapping aligned with Backloggd Plus).
- Backloggd import pipeline stubs (search + create log) with dry-run UI.
- Floating panel + GM menu on Backloggd and Notion hosts.
- Docs: `docs/transfer-format.md`.
