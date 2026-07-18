# DigiMenu owner dashboard (`/app`)

Owners edit their restaurant through DigiMenu `/app`, not EmDash admin.

## Auth

See [owner-auth.md](./owner-auth.md) for Supabase magic link + `owner_restaurants` mapping.

All owner pages call `requireOwner()`. OAuth / self-serve onboarding are out of scope here.

## Shell

- Layout: [`src/layouts/Dashboard.astro`](../src/layouts/Dashboard.astro) — DigiMenu sidebar (Starwind) + top bar.
- View Transitions (`ClientRouter`) are **disabled** (soft nav waited on full SSR and felt slower on Workers). Restore notes are in the layout file.
- Restaurant theming applies only on the public menu (`Menu.astro`), never on the dashboard.

## Routes

| Path | Purpose |
|------|---------|
| `/app` | Resumen (SSR counts from live collections) |
| `/app/info` | Info restaurante (nombre, descripción, logo) |
| `/app/menu` | Tipo de menú (`menu_layout` JSON) |
| `/app/estilos` | Estilos / theme tokens (`theme` JSON) |
| `/app/categorias` | CRUD colección `categorias` (nombre + icono + portada en un solo form) |
| `/app/productos` | Lista + crear producto |
| `/app/productos/[id]` | Detalle / editar / borrar + categoría (select único) + imagen |
| `/app/login` | Magic link |
| `/app/pending` | Logged in, no restaurant link |

Mutations are form POST on these pages (not a separate JSON BFF).

## Writes

Reads use in-process EmDash (`getEmDashCollection` / `list*` helpers). Mutations need `EMDASH_API_BASE` + `EMDASH_API_TOKEN` (server-side PAT to EmDash content/media APIs).

**Local** (`.env`):

```bash
EMDASH_API_BASE=http://localhost:4321
EMDASH_API_TOKEN=ec_pat_...
```

**Workers** (runtime secrets — Vite would otherwise bake local `.env` into the bundle):

```bash
echo 'https://digimenu.nachomallavia.workers.dev' | npx wrangler secret put EMDASH_API_BASE
npx wrangler secret put EMDASH_API_TOKEN
```

Create the PAT in EmDash admin on the **same** environment. Without these, forms stay read-oriented.

Workers also need the compatibility flag `global_fetch_strictly_public` in [`wrangler.jsonc`](../wrangler.jsonc): the owner BFF self-fetches `EMDASH_API_BASE` (same Worker origin). Without that flag Cloudflare returns **404 / error 1042**.

## Media uploads

Owner forms upload images via the same PAT: `POST /_emdash/api/media` (multipart), then attach the media id to content fields.

| Surface | Field |
|---------|--------|
| Producto detalle | `productos.imagen` |
| Info | `restaurantes.logo` |
| Categorías | `categorias.cover` |

Default EmDash max file size is 10MB. With R2 binding, uploads go through the Worker (no client pre-signed URLs).

## Schema fields on `restaurantes`

- `menu_layout` (json): `{ columns: 1|2, navigation: "por_categorias"|"scroll_unico", showImages: boolean }`
- `theme` (json): mode, colors, fonts, radius (see `src/lib/restaurant-theme.ts`)

## Categorías (`categorias` collection)

Per-restaurant collection (no taxonomy): `nombre` (req), `restaurante` (reference, req), `icon` (Tabler id — curated list in `src/lib/category-icons.ts`), `cover` (image), `orden` (integer; orders menu sections). Page handlers validate ownership on every mutation (404 / error if the category doesn't belong to the session restaurant). Deleting a category leaves `productos.categoria` dangling — those products render under "Sin categoría".

## Session refresh on writes

Product/category mutations never touch the session cookie. Restaurant-level mutations (info / menu / estilos) re-sign the cookie via `refreshOwnerSnapshot`, building the snapshot from the payload just written (no extra Supabase/EmDash round trips).

## Page load strategy

**Rule:** each owner GET owns its reads in frontmatter via live collections. The browser makes **one** document request for that page’s data. Sidebar chrome stays `chromeOnly` (cookie name/slug, no EmDash). Always `Astro.cache.set(cacheHint)` when querying.

| Route | Data loading |
|-------|----------------|
| `/app` | `Promise.all(listProductos, listCategorias)` → counts in markup |
| `/app/productos` | `listProductosForRestaurant` → `<ul>` in Astro |
| `/app/categorias` | `listCategoriasForRestaurant` → forms mapped in Astro |
| `/app/productos/[id]` | `getProductoBySlug` + `listCategoriasForRestaurant` (select) |
| `/app/info`, `/menu`, `/estilos` | `fromSession` restaurant snapshot (`logo` included; old cookies fall back to one EmDash read + upgrade via `requireLogo`) |

### Before vs after (SWR frankenstein → live collections)

Former approach: chromeOnly HTML shell + client `GET /app/api/*` + sessionStorage SWR (`owner-browser-cache.ts`). Same EmDash list work, second HTTP hop, loading flash.

| Metric | Before (SWR) | After (SSR collections) |
|--------|--------------|-------------------------|
| Cold `/app` HTTP | 3 (HTML + 2 APIs) | **1** |
| Cold `/app/productos` HTTP | 2 (HTML + API) | **1** |
| Cold `/app/categorias` HTTP | 2 (HTML + API) | **1** |
| List in first HTML | No (“Cargando…”) | Yes |
| Extra modules | `owner-browser-cache.ts` + `/app/api/*` | None |
| Soft-nav TTFB | Often lower (empty shell) | Includes EmDash list in document |
| Time-to-usable-list | TTFB_html + TTFB_api (+ paint) | Document TTFB only |

**Local measurements** (2026-07-18, `npx emdash dev`, Finca: 86 productos / 15 categorías):

| Route (after, authenticated, 1 HTTP) | Total time | Notes |
|--------------------------------------|------------|--------|
| `/app` | ≈ **149ms** | Counts in HTML; no “Cargando…” |
| `/app/productos` | ≈ **82ms** | 86 product links in first HTML |
| `/app/categorias` | ≈ **85ms** | 15 edit forms in first HTML |
| `/m/finca` (proxy, warm) | TTFB ≈ **82–86ms** | Same in-process list helpers |

Before: same EmDash work plus a second `/app/api/*` hop after an empty shell. Deleted `/app/api/productos|categorias|restaurante` now return **404**.

If Worker EmDash list latency makes soft nav feel worse, fix query/cache performance — do **not** reintroduce a second HTTP list layer.

Seed defines schema for empty DBs. Existing DBs can be migrated with `scripts/migrate-categorias.mjs` (local) or via Worker MCP.
