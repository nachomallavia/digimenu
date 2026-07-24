# Active Context

## Current focus
Fundación menús/tags + plantilla Classic: colecciones `menus`/`tags`, `productos.menus`/`tags` JSON, owner sidebar IA (Menús→Estilo/Lista, Etiquetas), template registry. Próximo: multi-plantillas visuales + OAuth.

## Decisions
- Collections: `restaurantes`, `menus`, `tags`, `categorias`, `productos`, `pages`
- **Menús** = colección per-restaurant (cartas); `plantilla` string por menú (default `classic`); producto↔menús many-to-many vía JSON `productos.menus: string[]`
- **Tags** = colección per-restaurant; producto↔tags vía JSON `productos.tags: string[]`
- **Categorías = colección `categorias`** (no taxonomía): scoped por restaurante
- Public menu: `/m/[slug]` orquesta data → `<Classic />` (props tipadas); `?menu=` para switcher
- Owner never uses `/_emdash/admin`
- Auth: Supabase magic link MVP; OAuth later
- Dashboard: Astro routes; Starwind Sidebar con sub-items bajo Menús
- `restaurantes.theme` sigue en restaurante; `menu_layout` legacy solo para Classic knobs
- Owner session cookie `digimenu_owner` (HMAC, Path=/app, TTL 3 days)

## Recent
- Seed + migrate local: colección menus/tags, Carta default, 86 productos asignados
- Owner: `/app/menus`, `/new`, `[id]/estilo`, `[id]/productos`, `/app/etiquetas`
- Redirects: `/app/menu` → menus; `/app/estilos` → estilo del menú default
- Autofill: restaurant + sole menu + tags=[]

## Next
- Alinear Worker (schema fields + content migrate) + deploy
- Galería multi-plantilla + theme override por menú
- Multi-select menús/tags en ficha de producto
- OAuth / onboarding
