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

**Rule:** each owner GET owns its reads in frontmatter via live collections. The browser makes **one** document request for that page’s data. Sidebar chrome stays `chromeOnly` (cookie name/slug, no EmDash). Call `Astro.cache.set(cacheHint)` when EmDash returns a hint (skipped on Worker list-cache hits).

| Route | Data loading |
|-------|----------------|
| `/app` | `Promise.all(listProductos, listCategorias)` → counts in markup |
| `/app/productos` | `listProductosForRestaurant` → `<ul>` in Astro |
| `/app/categorias` | `listCategoriasForRestaurant` → forms mapped in Astro |
| `/app/productos/[id]` | `getProductoBySlug` + `listCategoriasForRestaurant` (select) |
| `/app/info`, `/menu`, `/estilos` | `fromSession` restaurant snapshot (`logo` included; old cookies fall back to one EmDash read + upgrade via `requireLogo`) |

### Owner list cache (Workers)

`listProductosForRestaurant` / `listCategoriasForRestaurant` use a **Worker-side read-through cache** ([`src/lib/emdash/owner-list-cache.ts`](../src/lib/emdash/owner-list-cache.ts)):

- Keyed by `restaurantId` (tenant-safe). Storage: Cache API (`digimenu-owner-lists`); in-memory Map when Cache API is unavailable (local).
- TTL **5 minutes** safety net; **bust both** lists after any product/category create/update/delete.
- Browser still gets one SSR HTML page — no client SWR, no public CDN `Cache-Control` on `/app` (unsafe for authenticated HTML).

First nav after deploy/save/TTL may still hit EmDash; repeat navs within TTL should be much faster on Workers.

### History note

Earlier approach used chromeOnly HTML + client `GET /app/api/*` + sessionStorage SWR (2–3 HTTP). Replaced by SSR collections (1 HTTP) + Worker list cache above.

Seed defines schema for empty DBs. Existing DBs can be migrated with `scripts/migrate-categorias.mjs` (local) or via Worker MCP.
