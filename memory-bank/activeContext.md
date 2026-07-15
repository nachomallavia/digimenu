# Active Context

## Current focus
Post-parity polish: Worker taxonomy `categoria` (admin) + secrets for `/app` writes.

## Decisions
- Collections: `restaurantes`, `productos`, `pages`
- Taxonomy: `categoria` on `productos`
- Public menu: `/m/[slug]`
- Owner never uses `/_emdash/admin`
- EmDash visual Edit toolbar = ops/admin only (`role >= 30`); owners edit via `/app`
- Auth: Supabase magic link MVP; OAuth later; mapping in `owner_restaurants`
- EmDash reads via in-process `getEmDashCollection`; writes via `EMDASH_API_TOKEN` BFF
- Dashboard: Astro routes + View Transitions (not a client SPA); Starwind Sidebar
- `restaurantes.menu_layout` + `restaurantes.theme` (JSON) drive public menu display/theming
- Owner session: signed cookie `digimenu_owner` (HMAC, Path=/app, TTL 3 days). Secret: `DIGIMENU_SESSION_SECRET` or fallback `EMDASH_ENCRYPTION_KEY`. `requireOwner` trusts cookie (no EmDash); restaurant snapshot for Info/Menu/Estilos GETs; list pages (Resumen/Productos/Categorías) use sessionStorage SWR via `/app/api/*`. Revalidate + EmDash on POST only.

## Recent
- Workers writes: `global_fetch_strictly_public` (fixes 1042 self-fetch to same workers.dev).
- Fixed Workers writes env: CF secrets for API base/token (was baking localhost → 403/1003).
- Owner list pages sessionStorage SWR; session snapshot for Info/Menu/Estilos.
- Public menu live: https://digimenu.nachomallavia.workers.dev/m/finca

## Next
- Create taxonomy `categoria` on Worker (admin) + assign terms
- Worker secrets for `/app` writes (PAT + API base)
- Media upload for logo/imagen from `/app`
- OAuth / self-serve onboarding (separate track)
