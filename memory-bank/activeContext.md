# Active Context

## Current focus
Categorías como colección + reducción de round trips: COMPLETADO (local + producción). Próximo track: OAuth / onboarding.

## Decisions
- Collections: `restaurantes`, `categorias`, `productos`, `pages`
- **Categorías = colección `categorias`** (no taxonomía): `nombre`, `restaurante` (ref, req), `icon`, `cover`, `orden`. Scoped por restaurante → aislamiento multi-tenant real.
- `productos.categoria` = reference opcional a `categorias` (un producto, una categoría). Borrar categoría deja ref colgante → "Sin categoría".
- Public menu: `/m/[slug]` con 3 queries (restaurante, productos, categorías) y agrupado en memoria — sin N+1.
- Owner never uses `/_emdash/admin`
- EmDash visual Edit toolbar = ops/admin only (`role >= 30`); owners edit via `/app`
- Auth: Supabase magic link MVP; OAuth later; mapping in `owner_restaurants`
- EmDash reads via in-process `getEmDashCollection`; writes via `EMDASH_API_TOKEN` (page form POST helpers)
- Dashboard: Astro routes (View Transitions disabled); Starwind Sidebar
- `restaurantes.menu_layout` + `restaurantes.theme` (JSON) drive public menu display/theming
- Owner session: signed cookie `digimenu_owner` (HMAC, Path=/app, TTL 3 days). Secret: `DIGIMENU_SESSION_SECRET` or fallback `EMDASH_ENCRYPTION_KEY`. `requireOwner` trusts cookie. **No revalidation round trips post-mutación**: mutaciones de producto/categoría no tocan la cookie; mutaciones de restaurante (info/menu/estilos) re-firman con `refreshOwnerSnapshot` desde el payload.
- Writes sin `_rev` previo: PUT de EmDash acepta omitirlo; create es draft + publish (API rechaza `status: "published"` en create).
- Owner media: multipart `POST /_emdash/api/media` via PAT BFF, then attach to `imagen` / `logo` / `categorias.cover`

## Recent
- Owner lists: SSR live collections (`listProductos`/`listCategorias` + `Astro.cache.set`); eliminados SWR, `owner-browser-cache.ts`, y `/app/api/*` JSON BFF — 1 HTTP por ruta (antes 2–3)
- Migración categorías → colección: seed, `scripts/migrate-categorias.mjs` (local), MCP (Worker: colección + campos + 15 entradas + 86 productos + cleanup taxonomía/category_meta)
- Eliminados: taxonomía `categoria`, `restaurantes.category_meta`, `src/lib/category-meta.ts` (iconos ahora en `src/lib/category-icons.ts`)
- `/m/[slug]`: ~89 queries → 3 (~2.9s → ~1.0s local)
- Guardado producto ~7 req → ~3; guardado categoría 4 req → 1-2
- Quick wins seguridad: open redirect `//` en callback, logout solo POST, validación hex server-side en estilos, fix ternario `primary-foreground`
- `imageSrc` helper: fallback a `/_emdash/api/media/file/{storageKey}` para image fields nativos leídos in-process
- Perf GETs /app: snapshot incluye `logo` → info/menu/estilos `fromSession`; listas (`/app`, productos, categorías) SSR con live collections + `Astro.cache.set` (eliminado SWR / `owner-browser-cache` / `/app/api/*`)
- Deploy verificado: https://digimenu.nachomallavia.workers.dev/m/finca (15 secciones, 86 productos)

## Next
- OAuth / self-serve onboarding (separate track)
- UI de reordenamiento de categorías (campo `orden` ya listo)
- Fuera de alcance anotado: rate limiting magic link, tests, limpieza media huérfano R2
