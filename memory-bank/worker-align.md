# Worker alignment checklist

After `npm run deploy`, production D1 is **not** re-seeded. Align schema/content manually.

Public: `https://digimenu.nachomallavia.workers.dev`

## Status (2026-07-13)

| Piece | Local | Worker |
|-------|-------|--------|
| Code (`/app`, menu theme) | yes | deployed |
| `pages` | yes | yes |
| `productos` (nombre, precio, descripcion, imagen, restaurante) | yes | yes (`descripcion` still required) |
| `restaurantes` (+ logo, menu_layout, theme) | yes | yes |
| Taxonomy `categoria` | yes | **still missing** (MCP cannot create taxonomy defs) |
| Content finca + 5 products | yes | yes (no category terms yet) |

Restaurant ULID: `01KXEQE87VY4Z5ESANZMC5WH7P` (slug `finca`)

## Remaining (admin)

1. Create taxonomy `categoria` (flat, linked to `productos`)
2. Add terms: tapeos, sin-alcohol, cafe-solo, cafe-espresso-leche
3. Assign terms to products
4. For `/app` writes on Worker: create EmDash PAT + set secrets (`EMDASH_API_TOKEN`, `EMDASH_API_BASE`, public Supabase vars if not baked at build)

## Steps (done this session)

1. MCP: created `restaurantes` + fields; added `imagen` + `restaurante` on `productos`
2. MCP: published `finca` + sample productos
3. Fixed plugin `entrypoint` to absolute path (build was failing)
4. `npm run deploy`

Plugin `digimenu-autofill` ships with the Worker build (trusted plugin in `astro.config.mjs`).

## Note
MCP updates **content/schema on D1**, not Worker JS. Always deploy code separately.
