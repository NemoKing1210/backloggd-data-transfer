# Backloggd Data Transfer

[![CI](https://github.com/NemoKing1210/backloggd-data-transfer/actions/workflows/ci.yml/badge.svg)](https://github.com/NemoKing1210/backloggd-data-transfer/actions/workflows/ci.yml)
[![Install userscript](https://img.shields.io/badge/Install-userscript-3db89a?style=for-the-badge)](https://raw.githubusercontent.com/NemoKing1210/backloggd-data-transfer/main/backloggd-data-transfer.user.js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.6.4-green?style=for-the-badge)](CHANGELOG.md)

Userscript that **imports game logs into [Backloggd](https://www.backloggd.com)** from other platforms via a **unified transfer JSON** file. Backloggd has no native import/export.

Compatible with [Tampermonkey](https://www.tampermonkey.net/), [Violentmonkey](https://violentmonkey.github.io/), [Greasemonkey](https://www.greasespot.net/), [ScriptCat](https://scriptcat.org/), and similar managers.

> **Status:** early (`0.6.1`). Runs on Backloggd only. Transfer format **v2** mirrors the native log POST body. Import and multi-log cleanup are live; full library export is next.


Companion to [Backloggd Plus](https://github.com/NemoKing1210/backloggd-plus) (enrichment UI). Not affiliated with Backloggd.

## How it works

```text
Other platforms ──► transfer JSON ──► Backloggd (create logs)
Backloggd       ──► transfer JSON     (future export)
```

1. Produce a `backloggd-transfer` JSON file ([format spec](docs/transfer-format.md)) from any source.
2. On **Backloggd**, open the panel, load the JSON, match titles, then import selected logs. Use the **Cleanup** tab to find games with more than one log.

## Quick install

1. Install a userscript manager.
2. Install from the raw GitHub URL (after the repo is pushed):

```
https://raw.githubusercontent.com/NemoKing1210/backloggd-data-transfer/main/backloggd-data-transfer.user.js
```

Or build locally and install `backloggd-data-transfer.user.js` from the repo root.

## Development

```bash
npm install
npm run dev      # Vite — install the "dev:" userscript from the open URL
npm run build    # Production bundle → dist/ + root artifacts
npm run ci       # build + verify dist ↔ root
```

Requires Node.js 20+ (see `.nvmrc`).

## Roadmap

- [x] Project scaffold + transfer format (v2)
- [x] Backloggd search + live log import
- [x] CSV import with column mapping
- [x] Multi-log cleanup scan
- [ ] Export library from Backloggd
- [ ] Additional source adapters as needed

## License

[MIT](LICENSE)
