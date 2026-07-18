# Progress

## Done
- DigiMenu schema + public `/m/[slug]` menu (layout + theme aware, 3 queries, agrupado en memoria)
- Supabase digimenu-db: table `owner_restaurants` + RLS
- Owner app: auth + dashboard shell (Starwind sidebar; View Transitions disabled)
- Owner sections: info, menu type, estilos, categorías, productos (+ detalle)
- Owner lists: SSR live collections (no client SWR / no `/app/api/*` JSON BFF); local `/app/productos` ≈ 82ms with 86 rows in first HTML
- DigiMenu owner session cookie (`digimenu_owner`, 3d TTL, HMAC) — sin revalidación post-mutación (`refreshOwnerSnapshot` desde payload)
- Docs: `docs/owner-auth.md`, `docs/owner-dashboard.md`, `.env.example`
- **Categorías como colección `categorias`** (nombre, restaurante ref, icon, cover, orden) + `productos.categoria` — local y Worker migrados (2026-07-17), taxonomía y `category_meta` eliminados
- Owner media uploads: product `imagen`, restaurant `logo`, `categorias.cover` via EmDash multipart API
- Category icon picker (Tabler, `src/lib/category-icons.ts`) + cover en `/app/categorias`; public menu renders both
- Demo stock photos 4:5 on all 86 products + 15 category covers (local + Worker); menu CSS 4:5
- Quick wins seguridad: open redirect `//`, logout POST-only, hex validation en estilos, `primary-foreground` fix
- Scripts: `scripts/migrate-categorias.mjs` (migración local re-ejecutable con `--cleanup`)

## Next
- OAuth / onboarding track
- UI de reordenamiento de categorías (campo `orden` listo)

## Known issues
- Production D1 is not re-seeded on deploy — align via MCP/admin (`memory-bank/worker-align.md`)
- Local MCP EmDash may need reconnect after restarting `emdash dev`
- After DB wipe, also clear `.wrangler/state/v3/kv` for seed/setup
- Without `EMDASH_API_TOKEN`, owner forms are read-oriented
- Worker `productos.descripcion` is currently required (local seed: optional)
- Local `.env` PAT ≠ Worker PAT; Worker media scripting uses R2 `wrangler` + MCP `media_create`
- Borrar una categoría deja `productos.categoria` colgante → se muestran como "Sin categoría" (sin cascada, decisión deliberada)
