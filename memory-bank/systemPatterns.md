# System Patterns

- **Platform:** EmDash CMS on Astro (`output: "server"`)
- **Hosting:** Cloudflare Workers
- **Database:** D1 (`DB` binding)
- **Media:** R2 (`MEDIA` binding)
- **Tenancy:** Shared instance; `productos.restaurante` → `restaurantes`; `menus`/`tags`/`categorias`.restaurante → `restaurantes`; public URL `/m/{slug}`
- **Admin:** `/_emdash/admin` (ops only)
- **Owner app:** `/app` DigiMenu + Supabase auth; Starwind sidebar (Resumen, Restaurant, Menús→Estilo/Lista, Productos, Categorías, Etiquetas); View Transitions disabled
- **Owner session:** Signed httpOnly cookie `digimenu_owner` (Path=`/app`, 3d). `requireOwner` prefers cookie; `chromeOnly` skips EmDash for sidebar chrome. Snapshot incluye `logo_light` / `logo_dark`. Post-mutación: producto/categoría/menú/tag no tocan cookie; restaurante re-firma con `refreshOwnerSnapshot`.
- **Owner list GETs:** SSR live collections (`listProductos` / `listCategorias` / `listMenus` / `listTags` + cache); info/estilo theme from session
- **Layouts:** Root → Menu (public/`/m`) or Dashboard (`/app`) or AppGuest (login/pending)
- **Plugins:** `digimenu-autofill` auto-assigns restaurant (+ sole menu, tags=[]) on product create
- **Menús:** colección `menus` (nombre, restaurante, orden, plantilla); many-to-many con productos vía JSON `productos.menus`
- **Tags:** colección `tags`; many-to-many vía JSON `productos.tags`
- **Categorías:** colección `categorias` — no taxonomía. Agrupado del menú en memoria
- **Public display:** `/m/[slug]` carga data → plantilla (`Classic` hoy) vía `menus.plantilla`; theme en `restaurantes.theme`; legacy `menu_layout` knobs solo Classic
- **Writes:** Browser never talks to EmDash admin; page form POST + PAT helpers; create = draft + publish
- **Media uploads:** Owner multipart → `POST /_emdash/api/media`
- **Image fields in-process:** `imageSrc` cae a `/_emdash/api/media/file/{storageKey}`
