# AGENTS.md — Backloggd Data Transfer

Instructions for AI coding agents working in this repository.

## Project

Userscript that moves game logs **into** [Backloggd](https://www.backloggd.com) (and later **out** of it). Backloggd has no native import/export; this script bridges other platforms via a **unified transfer JSON** file.

Compatible with Tampermonkey, Violentmonkey, Greasemonkey, [ScriptCat](https://scriptcat.org/), and similar managers.

Built with [Vite](https://vitejs.dev/) + [vite-plugin-monkey](https://github.com/lisonge/vite-plugin-monkey) — same toolchain as [backloggd-plus](https://github.com/NemoKing1210/backloggd-plus).

- **Source:** `src/main.js`
- **Canonical install artifacts (committed):** `backloggd-data-transfer.user.js`, `backloggd-data-transfer.meta.js`
- **Version source of truth:** `package.json` `version`
- **Format spec:** `docs/transfer-format.md`
- **License:** MIT

Edit source under `src/`, then run `npm run build` to refresh the root install files. Do not hand-edit the built `.user.js` / `.meta.js`.

## Goals (priority order)

1. **Transfer JSON → Backloggd** — on backloggd.com, read the file and `POST` logs using the same form fields as the native log editor (`log`, `playthroughs`, `dates`).
2. **Other sources** — each platform (or offline tool) emits the same JSON; the Backloggd importer stays shared. Do **not** scrape/export from Notion — it already has native export.
3. **Backloggd → transfer JSON** — export the user’s library (future).

Transfer format **v2** field names match the site API; see `docs/transfer-format.md`.

## Repository layout

```text
backloggd-data-transfer/
├── src/
│   ├── main.js                 # Bootstrap
│   ├── constants.js            # Keys, format id, defaults
│   ├── state.js / settings.js / gm.js
│   ├── format/                 # Unified schema, parse, serialize, status maps
│   ├── destinations/backloggd/ # Search + create-log (import)
│   ├── features/               # Panel UI, toast, SPA hosts, future export
│   ├── i18n/                   # en + ru for now
│   ├── utils/
│   └── styles/
├── scripts/                    # copy-dist, verify-artifacts
├── docs/transfer-format.md
├── .github/workflows/ci.yml
├── dist/                       # Vite output (gitignored)
├── backloggd-data-transfer.user.js
├── backloggd-data-transfer.meta.js
├── package.json
├── vite.config.js
├── README.md
├── CHANGELOG.md
├── LICENSE
├── AGENTS.md
└── CLAUDE.md
```

## Architecture

1. Match **Backloggd** only at `document-idle`.
2. Inject a navbar **Transfer** button (`#bdt-nav-transfer`, same slot as Log a Game / Plus) + `GM_registerMenuCommand` → transfer panel.
3. **Import tab:** user picks JSON → `format/parse` → `destinations/backloggd` (search + create). Default **dry-run** until writes are implemented.
4. Prefix UI/storage with `bdt_` / `data-bdt-*` so it does not clash with Backloggd Plus (`blp_`).

Keep `@connect` / `@grant` minimal. Userscript metadata lives in `vite.config.js`.

## Conventions

- Vanilla JS ESM under `src/`; no frameworks. Import GM APIs from `$`.
- New source platform → `src/sources/<platform>/` that returns a `TransferDocument` (optional; sources may live outside this repo).
- New destination → `src/destinations/<platform>/` that consumes `TransferDocument`.
- Do not hand-edit committed `.user.js` / `.meta.js`.
- After source or metadata changes: `npm run build`.
- Do not imply affiliation with Backloggd in docs/UI copy.
- Do not add Notion host matching or in-page Notion export UI.

## Releases

1. Bump `version` in `package.json`.
2. `npm run build`.
3. Update `CHANGELOG.md`.
4. Refresh README badges if they mention the version.

## Local testing

```bash
npm install
npm run dev      # Vite serve — install the generated server userscript (prefix "dev:")
npm run build    # Production → dist/ + copy to repo root
npm run ci       # build + verify committed artifacts
```

## Do not

- Hand-edit committed install artifacts.
- Add TypeScript or a frontend framework unless explicitly requested.
- Expand `@connect` beyond what the import/export paths need.
- Commit localhost `@updateURL` / `@downloadURL` values.
- Reintroduce Notion export / Notion `@match` unless the user explicitly asks.
