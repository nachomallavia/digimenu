# Tech Context

- Node 22+, npm
- Astro 7 + `@astrojs/cloudflare`
- `emdash` + `@emdash-cms/cloudflare`
- Local: `npx emdash dev` (Miniflare; uses `.env` for `EMDASH_ENCRYPTION_KEY`)
- Deploy: `npm run deploy` → `astro build && wrangler deploy`
- Peer deps: `.npmrc` sets `legacy-peer-deps=true` (workers-types v4 vs wrangler optional v5)
- Wrangler resources: Worker `digimenu`, D1 `digimenu-db`, R2 `digimenu-media`
