# Progress

## Done
- DigiMenu schema + public `/m/[slug]` menu (layout + theme aware)
- Supabase digimenu-db: table `owner_restaurants` + RLS
- Owner app: auth + dashboard shell (Starwind sidebar, View Transitions)
- Owner sections: info, menu type, estilos, categorías, productos (+ detalle)
- BFF: `/app/api/restaurante`, `/app/api/productos`, `/app/api/productos/[id]`, `/app/api/categorias`
- DigiMenu owner session cookie (`digimenu_owner`, 3d TTL, HMAC)
- Docs: `docs/owner-auth.md`, `docs/owner-dashboard.md`, `.env.example`
- Local schema: `menu_layout` + `theme` on `restaurantes`
- Worker: `restaurantes` + fields, `productos.imagen`/`restaurante`, `finca` + 5 products via MCP
- Deployed `https://digimenu.nachomallavia.workers.dev` (menu smoke OK)
- Pushed to GitHub `main` (`9e48470`)

## Next
- Worker taxonomy `categoria` (admin) + assign terms to products
- Worker secrets for owner BFF writes (`EMDASH_API_TOKEN`, API base)
- Logo / product image upload from `/app`
- OAuth / onboarding track

## Known issues
- Production D1 is not re-seeded on deploy — align via MCP/admin (`memory-bank/worker-align.md`)
- MCP cannot create taxonomy definitions (only terms); `categoria` needs admin once
- Local MCP EmDash may need reconnect after restarting `emdash dev`
- After DB wipe, also clear `.wrangler/state/v3/kv` for seed/setup
- Without `EMDASH_API_TOKEN`, owner forms are read-oriented
- Worker `productos.descripcion` is currently required (local seed: optional)
