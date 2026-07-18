# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
