# DigiMenu owner dashboard (`/app`)

Owners edit their restaurant through DigiMenu `/app`, not EmDash admin.

## Auth

See [owner-auth.md](./owner-auth.md) for Supabase magic link + `owner_restaurants` mapping.

All owner pages call `requireOwner()`. OAuth / self-serve onboarding are out of scope here.

## Shell

- Layout: [`src/layouts/Dashboard.astro`](../src/layouts/Dashboard.astro) — DigiMenu sidebar (Starwind) + top bar + View Transitions (`ClientRouter`).
- Restaurant theming applies only on the public menu (`Menu.astro`), never on the dashboard.

## Routes

| Path | Purpose |
|------|---------|
| `/app` | Resumen |
| `/app/info` | Info restaurante (nombre, descripción, logo) |
| `/app/menu` | Tipo de menú (`menu_layout` JSON) |
| `/app/estilos` | Estilos / theme tokens (`theme` JSON) |
| `/app/categorias` | CRUD colección `categorias` (nombre + icono + portada en un solo form) |
| `/app/productos` | Lista + crear producto |
| `/app/productos/[id]` | Detalle / editar / borrar + categoría (select único) + imagen |
| `/app/login` | Magic link |
| `/app/pending` | Logged in, no restaurant link |
| `/app/api/restaurante` | BFF GET/PATCH restaurante |
| `/app/api/productos` | BFF GET/POST productos |
| `/app/api/productos/[id]` | BFF GET/PUT/DELETE producto |
| `/app/api/categorias` | BFF GET/POST/PUT/DELETE categorías |

## Writes

Reads use in-process EmDash. Mutations need `EMDASH_API_BASE` + `EMDASH_API_TOKEN`.

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

Workers also need the compatibility flag `global_fetch_strictly_public` in [`wrangler.jsonc`](../wrangler.jsonc): the BFF self-fetches `EMDASH_API_BASE` (same Worker origin). Without that flag Cloudflare returns **404 / error 1042**.

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

Per-restaurant collection (no taxonomy): `nombre` (req), `restaurante` (reference, req), `icon` (Tabler id — curated list in `src/lib/category-icons.ts`), `cover` (image), `orden` (integer; orders menu sections). The BFF validates ownership on every mutation (404 if the category doesn't belong to the session restaurant). Deleting a category leaves `productos.categoria` dangling — those products render under "Sin categoría".

## Session refresh on writes

Product/category mutations never touch the session cookie. Restaurant-level mutations (info / menu / estilos / `PATCH /app/api/restaurante`) re-sign the cookie via `refreshOwnerSnapshot`, building the snapshot from the payload just written (no extra Supabase/EmDash round trips).

## Page load strategy (Workers latency)

In-process EmDash reads on the Worker cost ~600ms, so GETs avoid them:

- `/app/productos` and `/app/categorias`: SSR is cookie-only (`chromeOnly`); the list renders client-side from the BFF with sessionStorage SWR (`src/lib/app/owner-browser-cache.ts`). `?saved=1` / `?action=` busts the cache.
- `/app/info`, `/app/menu`, `/app/estilos`: render from the session cookie snapshot (`fromSession`). The snapshot includes `logo` (`{ src, alt } | null`); pre-logo cookies fall back to one EmDash read + cookie upgrade (`requireLogo`).

Seed defines these for empty DBs. Existing DBs can be migrated with `scripts/migrate-categorias.mjs` (local) or via Worker MCP.
