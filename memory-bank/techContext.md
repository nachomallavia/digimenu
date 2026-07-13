# Tech Context

- Node 22+, npm
- Astro 7 + `@astrojs/cloudflare`
- `emdash` + `@emdash-cms/cloudflare`
- Local: `npx emdash dev` (Miniflare; uses `.env` for `EMDASH_ENCRYPTION_KEY`)
- Deploy: `npm run deploy` → `astro build && wrangler deploy`
- Peer deps: `.npmrc` sets `legacy-peer-deps=true` (workers-types v4 vs wrangler optional v5)
- Wrangler resources: Worker `digimenu`, D1 `digimenu-db`, R2 `digimenu-media`
- Public URL: `https://digimenu.nachomallavia.workers.dev`
- Owner UI: Starwind UI + Tailwind v4 via `@tailwindcss/postcss` (not `@tailwindcss/vite` — breaks EmDash admin SSR)
- Optional writes: `EMDASH_API_BASE` + `EMDASH_API_TOKEN`
- Owner session: `DIGIMENU_SESSION_SECRET` (fallback `EMDASH_ENCRYPTION_KEY`)
- Auth: Supabase (`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`); mapping table `owner_restaurants`
- MCP: `user-emdashLocal` (dev), `user-emdashWorker` (prod D1 content/schema — not code deploy)
