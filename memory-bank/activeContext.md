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
- Owner session: signed cookie `digimenu_owner` (HMAC, Path=/app, TTL 3 days). Secret: `DIGIMENU_SESSION_SECRET` or fallback `EMDASH_ENCRYPTION_KEY`. Revalidate on POST only.

## Recent
- Memory bank updated; Worker schema/content aligned via MCP; code deployed; pushed `9e48470` to `main`
- Public menu live: https://digimenu.nachomallavia.workers.dev/m/finca

## Next
- Create taxonomy `categoria` on Worker (admin) + assign terms
- Worker secrets for `/app` writes (PAT + API base)
- Media upload for logo/imagen from `/app`
- OAuth / self-serve onboarding (separate track)
