# Progress

## Done
- DigiMenu schema + public `/m/[slug]` menu (layout + theme aware)
- **Menús + tags foundation (2026-07-23):** collections `menus`/`tags`; `productos.menus`/`tags` JSON; Classic template + registry; owner IA (Menús→Estilo/Lista, Etiquetas); migrate script local; Worker schema + Carta created
- Supabase digimenu-db: table `owner_restaurants` + RLS
- Owner app: auth + dashboard shell (Starwind sidebar; View Transitions disabled)
- Owner lists: SSR live collections + Worker list cache
- DigiMenu owner session cookie `digimenu_owner`
- Docs: `docs/owner-auth.md`, `docs/owner-dashboard.md`
- Categorías colección + productos.categoria
- Owner media uploads + dual logos (local)
- CSV productos import/export

## Next
- `npm run deploy` + verify Worker `/m/finca` with menus collection
- Multi-plantilla gallery + theme override por menú
- Multi-select menús/tags en ficha producto
- OAuth / onboarding
- UI reordenamiento categorías

## Known issues
- Production D1 is not re-seeded on deploy — align via MCP/admin (`memory-bank/worker-align.md`)
- Worker Carta may need publish if left as draft; productos.menus empty uses sole-menu fallback
- Without `EMDASH_API_TOKEN`, owner forms are read-oriented
- Worker `productos.descripcion` is currently required (local seed: optional)
- Borrar categoría deja `productos.categoria` colgante → "Sin categoría"
