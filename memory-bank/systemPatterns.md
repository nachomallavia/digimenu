# System Patterns

- **Platform:** EmDash CMS on Astro (`output: "server"`)
- **Hosting:** Cloudflare Workers
- **Database:** D1 (`DB` binding)
- **Media:** R2 (`MEDIA` binding)
- **Tenancy:** Shared instance; `productos.restaurante` → `restaurantes`; public URL `/m/{slug}`
- **Admin:** `/_emdash/admin` (ops only)
- **Owner app:** `/app` DigiMenu BFF + Supabase auth; Starwind sidebar; View Transitions
- **Owner session:** Signed httpOnly cookie `digimenu_owner` (Path=`/app`, 3d). `requireOwner` prefers cookie; `revalidateOwnerSession` on mutations; `chromeOnly` skips EmDash for sidebar chrome
- **Layouts:** Root → Menu (public/`/m`) or Dashboard (`/app`) or AppGuest (login/pending)
- **Plugins:** `digimenu-autofill` (trusted) auto-assigns restaurant on product create when only one published restaurant exists
- **Taxonomy:** `categoria` groups menu sections
- **Public display:** `restaurantes.menu_layout` + `restaurantes.theme` applied in `Menu.astro` / `/m/[slug]`
- **Writes:** Browser never talks to EmDash admin; BFF + PAT; publish after update so public menu sees live data
