# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
