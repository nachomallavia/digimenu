# Active Context

## Current focus
Push a Git tras empatar local ↔ workers.dev. Falta taxonomía `categoria` en Worker (admin).

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
- Owner session: signed cookie `digimenu_owner` (HMAC, Path=/app, TTL 3 days). Secret: `DIGIMENU_SESSION_SECRET` or fallback `EMDASH_ENCRYPTION_KEY`. Revalidate on POST only.

## Recent
- Owner dashboard + session cookie + public menu theme/layout
- Worker MCP: created `restaurantes` (+ fields), `productos.imagen`/`restaurante`, content `finca` + 5 products
- Fixed `digimenu-autofill` entrypoint (absolute path) so `astro build` works
- Deployed to `https://digimenu.nachomallavia.workers.dev`

## Next
- Push to GitHub
- Create taxonomy `categoria` on Worker (admin — MCP has no create-taxonomy-def) + assign terms
- Worker secrets for `/app` writes (PAT + API base)
- Media upload for logo/imagen from `/app`
- OAuth / self-serve onboarding (separate track)
