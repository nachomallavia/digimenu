# Worker alignment checklist

After `npm run deploy`, production D1 is **not** re-seeded. Align schema/content manually.

Public: `https://digimenu.nachomallavia.workers.dev`

## Status (2026-07-17)

| Piece | Local | Worker |
|-------|-------|--------|
| Code (`/app`, menu theme, categorias) | yes | deployed |
| `pages` | yes | yes |
| `productos` (nombre, precio, descripcion, imagen, restaurante, **categoria**) | yes | yes (`descripcion` still required) |
| `restaurantes` (+ logo, menu_layout, theme) | yes | yes (`category_meta` **removed** 2026-07-17) |
| `categorias` collection (nombre, restaurante, icon, cover, orden) | yes | yes (15 entradas, migradas 2026-07-17) |
| Taxonomy `categoria` | removed | **removed** (15 términos borrados 2026-07-17) |
| Content finca + 86 products (con categoria ref) | yes | yes |

Restaurant ULID: `01KXEQE87VY4Z5ESANZMC5WH7P` (slug `finca`)

## Migración categorías (hecha 2026-07-17)

1. MCP: `schema_create_collection categorias` + fields (nombre, restaurante ref, icon, cover, orden); `schema_add_field productos.categoria`
2. MCP: 15 entradas `categorias` creadas desde términos + `category_meta` (mismos media ids de covers), publicadas
3. MCP: `content_update` de los 86 productos con su `categoria` ULID (mapping en `tmp/worker-updates.json`)
4. Cleanup: 15 términos borrados (`taxonomy_delete_term`), `schema_delete_field restaurantes.category_meta`
5. `npm run deploy` + verificación `/m/finca` (15 secciones, 86 productos, covers OK)

Nota: la **definición** de la taxonomía `categoria` puede seguir listada en admin (MCP no borra definiciones, solo términos); está vacía y sin uso.

## Remaining (admin)

- Nada bloqueante. Para `/app` writes en Worker ya están los secrets (`EMDASH_API_TOKEN`, `EMDASH_API_BASE`).

## Note
MCP updates **content/schema on D1**, not Worker JS. Always deploy code separately.
