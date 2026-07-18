# System Patterns

- **Platform:** EmDash CMS on Astro (`output: "server"`)
- **Hosting:** Cloudflare Workers
- **Database:** D1 (`DB` binding)
- **Media:** R2 (`MEDIA` binding)
- **Tenancy:** Shared instance; `productos.restaurante` → `restaurantes`; `categorias.restaurante` → `restaurantes`; public URL `/m/{slug}`
- **Admin:** `/_emdash/admin` (ops only)
- **Owner app:** `/app` DigiMenu + Supabase auth; Starwind sidebar; View Transitions disabled (`ClientRouter` off in `Dashboard.astro`)
- **Owner session:** Signed httpOnly cookie `digimenu_owner` (Path=`/app`, 3d). `requireOwner` prefers cookie; `chromeOnly` skips EmDash for sidebar chrome. Snapshot incluye `logo` (`{src,alt}|null`; `undefined` = cookie vieja → 1 lectura EmDash + upgrade con `requireLogo`). Post-mutación: producto/categoría no tocan cookie; restaurante re-firma con `refreshOwnerSnapshot` (snapshot desde payload, cero requests extra).
- **Owner list GETs:** SSR live collections (`listProductosForRestaurant` / `listCategoriasForRestaurant` + `Astro.cache.set`) — one document request owns the reads. Worker read-through cache (`owner-list-cache.ts`, Cache API, 5min TTL, bust both on product/categoria write). info/menu/estilos keep `fromSession`.
- **Layouts:** Root → Menu (public/`/m`) or Dashboard (`/app`) or AppGuest (login/pending)
- **Plugins:** `digimenu-autofill` (trusted) auto-assigns restaurant on product create when only one published restaurant exists
- **Categorías:** colección `categorias` (nombre, restaurante ref req, icon, cover, orden) — no taxonomía. `productos.categoria` ref opcional; agrupado del menú en memoria (3 queries totales). Page handlers validate ownership.
- **Public display:** `restaurantes.menu_layout` + `restaurantes.theme` applied in `Menu.astro` / `/m/[slug]`; icono/portada de sección desde la entrada `categorias`
- **Writes:** Browser never talks to EmDash admin; page form POST + PAT helpers; create = draft + publish (API rechaza `status: "published"` en create); PUT sin `_rev` previo; publish después de update para que el menú público vea live data
- **Media uploads:** Owner multipart → `POST /_emdash/api/media` → attach to `imagen` / `logo` / `categorias.cover`
- **Image fields in-process:** pueden venir sin `src`/`url`; `imageSrc` cae a `/_emdash/api/media/file/{storageKey}`
