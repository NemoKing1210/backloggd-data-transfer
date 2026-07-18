# Transfer format (`backloggd-transfer`)

Unified JSON used by **Backloggd Data Transfer**.

Source platforms (or offline converters) emit this file. On [Backloggd](https://www.backloggd.com) the userscript reads it and creates logs via site requests.

## Document

```json
{
  "format": "backloggd-transfer",
  "version": 1,
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
| `version` | number | Currently `1` |
| `exportedAt` | string | ISO-8601 datetime |
| `source.platform` | string | `steam`, `backloggd`, `custom`, … |
| `source.label` | string? | Human label (filename, DB name) |
| `source.url` | string? | Optional origin URL |
| `entries` | array | Game rows |

## Entry

```json
{
  "title": "Hades",
  "status": "played",
  "rating": 9,
  "favorite": true,
  "platform": "PC",
  "dateStart": "2024-01-01",
  "dateEnd": "2024-01-20",
  "review": "",
  "isDlc": false,
  "tags": ["Roguelike"],
  "externalIds": {},
  "sourceFields": {}
}
```

| Field | Type | Notes |
|-------|------|--------|
| `title` | string | Required |
| `status` | string \| null | Canonical Backloggd key (see below) |
| `rating` | number \| null | Backloggd half-star scale **1–10** (½★…5★) |
| `favorite` | boolean | Liked / heart |
| `platform` | string | e.g. `PC`, `PlayStation 5` |
| `dateStart` / `dateEnd` | string | `YYYY-MM-DD` or empty |
| `review` | string | Free text |
| `isDlc` | boolean | |
| `tags` | string[] | |
| `externalIds` | object | Optional Steam / IGDB / etc. ids |
| `sourceFields` | object | Opaque extras from the exporter (not required for import) |

## Canonical statuses

| Key | Backloggd |
|-----|-----------|
| `wishlist` | Wishlist |
| `backlog` | Backlog |
| `playing` | Playing |
| `played` | Played |
| `shelved` | Shelved |
| `abandoned` | Abandoned |
| `retired` | Retired |

Alternate labels (e.g. Planned → `wishlist`, Done → `played`) are normalized by `mapStatusToCanonical` when adapters need them.
