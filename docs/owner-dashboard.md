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
| `/app/info` | Info restaurante (nombre, descripción) |
| `/app/menu` | Tipo de menú (`menu_layout` JSON) |
| `/app/estilos` | Estilos / theme tokens (`theme` JSON) |
| `/app/categorias` | CRUD taxonomy `categoria` |
| `/app/productos` | Lista + crear producto |
| `/app/productos/[id]` | Detalle / editar / borrar + categorías |
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

## Schema fields on `restaurantes`

- `menu_layout` (json): `{ columns: 1|2, navigation: "por_categorias"|"scroll_unico", showImages: boolean }`
- `theme` (json): mode, colors, fonts, radius (see `src/lib/restaurant-theme.ts`)

Seed defines these for empty DBs. Existing DBs need the fields added via EmDash admin / schema CLI / Worker MCP.
