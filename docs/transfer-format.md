# Transfer format (`backloggd-transfer`)

Unified JSON used by **Backloggd Data Transfer**.

Entry fields mirror Backloggd’s log create/update POST  
(`POST /api/user/{userId}/log/{gameId}`, `application/x-www-form-urlencoded`):  
`game_id`, `log[...]`, `playthroughs[...]`, `dates[...]`.

Current version: **2**.

## Document

```json
{
  "format": "backloggd-transfer",
  "version": 2,
  "exportedAt": "2026-07-18T12:00:00.000Z",
  "source": {
    "platform": "custom",
    "label": "my-library.json"
  },
  "entries": []
}
```

| Field | Type | Notes |
|-------|------|--------|
| `format` | string | Always `"backloggd-transfer"` |
| `version` | number | `2` |
| `exportedAt` | string | ISO-8601 datetime |
| `source.platform` | string | Origin label (`custom`, `steam`, …) |
| `source.label` | string? | Human label |
| `source.url` | string? | Optional URL |
| `entries` | array | Games to import |

## Entry

```json
{
  "game_id": 27082,
  "title": "Raft",
  "slug": "raft",
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
      "hours_played": null,
      "mins_played": null,
      "is_master": false,
      "is_replay": false,
      "start_date": "2024-08-02",
      "finish_date": "",
      "edition_id": null,
      "edition_type": null,
      "medium_id": null,
      "played_platform": null,
      "storefront_id": null,
      "hours_finished": null,
      "mins_finished": null,
      "hours_mastered": null,
      "mins_mastered": null,
      "sync_sessions": false
    }
  ],
  "dates": [
    {
      "range_start_date": "2024-08-02",
      "range_end_date": "2024-08-03",
      "status": 5,
      "note": "",
      "hours": null,
      "minutes": null,
      "start_date": "2024-08-02",
      "finish_date": ""
    }
  ]
}
```

### Top-level

| Field | Type | Notes |
|-------|------|--------|
| `game_id` | number \| null | Backloggd game id (filled after resolve / known upfront) |
| `title` | string | Required for search when `game_id` is missing |
| `slug` | string | Optional Backloggd slug (`raft`) |

### `log` → `log[...]`

| Field | Form key | Notes |
|-------|----------|--------|
| `game_liked` | `log[game_liked]` | Heart / liked |
| `is_play` | `log[is_play]` | Completed / played flag |
| `is_playing` | `log[is_playing]` | |
| `is_backlog` | `log[is_backlog]` | |
| `is_wishlist` | `log[is_wishlist]` | |
| `status` | `log[status]` | e.g. `completed`, `playing`, `backlog`, `wishlist`, `shelved`, `abandoned`, `retired` |
| `total_hours` / `total_minutes` | `log[total_*]` | |
| `time_source` | `log[time_source]` | Default `1` |
| `override_cover_id` | `log[override_cover_id]` | Optional cover |

### `playthroughs[]` → `playthroughs[0][...]`

| Field | Form key | Notes |
|-------|----------|--------|
| `title` | `playthroughs[0][title]` | Platform label (`Windows PC`) |
| `rating` | `playthroughs[0][rating]` | **1–10** half-star scale |
| `review` | `playthroughs[0][review]` | |
| `review_spoilers` | `playthroughs[0][review_spoilers]` | |
| `platform` | `playthroughs[0][platform]` | Numeric platform id (`6` = Windows PC) |
| `start_date` / `finish_date` | `…[start_date]` / `…[finish_date]` | `YYYY-MM-DD` |
| `hours_played` / `mins_played` | | |
| `is_master` / `is_replay` | | |
| `sync_sessions` | | |
| `edition_*` / `medium_id` / `storefront_id` / `played_platform` / `hours_*` / `mins_*` | | Optional |

On import, `playthroughs[0][id]` is sent as `-1` for a new playthrough.

### `dates[]` → `dates[-1][i][...]`

Play sessions / date ranges (optional).

| Field | Form key |
|-------|----------|
| `range_start_date` | `dates[-1][i][range_start_date]` |
| `range_end_date` | `dates[-1][i][range_end_date]` |
| `status` | `dates[-1][i][status]` (numeric session status) |
| `note` | `dates[-1][i][note]` |
| `hours` / `minutes` | |
| `start_date` / `finish_date` | |

On import, each session gets `id=-1` and `edited=true`.

## Removed vs v1

No longer part of the format: `tags`, `isDlc`, `favorite` (use `log.game_liked`), flat `status` / `rating` / `platform` / `dateStart` / `dateEnd` / `review`, `externalIds`, `sourceFields`.

v1 files are still **accepted**: the parser migrates them into v2 shape (`played` → `completed`, etc.).

## `log.status` values

| Value | UI |
|-------|-----|
| `wishlist` | Wishlist |
| `backlog` | Backlog |
| `playing` | Playing |
| `completed` | Completed / Played |
| `shelved` | Shelved |
| `abandoned` | Abandoned |
| `retired` | Retired |
