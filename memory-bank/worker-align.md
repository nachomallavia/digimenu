# Worker alignment checklist

After `npm run deploy`, production D1 is **not** re-seeded. Align schema/content manually.

Public: `https://digimenu.nachomallavia.workers.dev`

## Status (2026-07-23)

| Piece | Local | Worker |
|-------|-------|--------|
| Code (`/app`, menus/tags IA, Classic template) | yes | deploy pending |
| `menus` collection (+ nombre, restaurante, descripcion, orden, plantilla) | yes | yes (schema + Carta draft→publish 2026-07-23) |
| `tags` collection (+ nombre, restaurante, icon) | yes | yes (schema 2026-07-23; no tags yet) |
| `productos.menus` / `productos.tags` (json) | yes | yes (fields 2026-07-23) |
| Productos assigned to Carta | yes (86 via migrate script) | empty arrays OK — sole-menu fallback shows all |
| `categorias` | yes | yes |
| `restaurantes` dual logos | yes | pending (single `logo` still) |

Restaurant ULID: `01KXEQE87VY4Z5ESANZMC5WH7P` (slug `finca`)  
Menú Carta ULID: `01KY8FNH0PTQFEZMD6VFJERV2T`

## Migración menus/tags

```bash
# Local (done 2026-07-23)
node scripts/migrate-menus-tags.mjs --target local

# Worker (optional: assign productos.menus explicitly)
node scripts/migrate-menus-tags.mjs --target worker --token "$WORKER_PAT"
```

## Note
MCP updates **content/schema on D1**, not Worker JS. Always deploy code separately.
