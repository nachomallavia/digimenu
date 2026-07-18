This is an EmDash site -- DigiMenu CMS on Astro with a full admin UI.

## Commands

```bash
npx emdash dev        # Start dev server (runs migrations, seeds, generates types)
npx emdash types      # Regenerate TypeScript types from schema
npm run deploy        # Build + wrangler deploy to workers.dev
```

The admin UI is at `http://localhost:4321/_emdash/admin`.

## Key Files

| File                     | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `astro.config.mjs`       | Astro config with `emdash()` integration, database, storage, DigiMenu plugin       |
| `src/live.config.ts`     | EmDash loader registration (boilerplate -- don't modify)                           |
| `seed/seed.json`         | Schema + demo content (restaurantes, categorias, productos)                        |
| `emdash-env.d.ts`        | Generated types for collections (auto-regenerated on dev server start)             |
| `src/layouts/Root.astro` | Shared HTML shell + Starwind defaults |
| `src/layouts/Menu.astro` | Public / customer menu chrome (+ theme hook) |
| `src/layouts/Dashboard.astro` | Owner `/app` chrome (DigiMenu brand) |
| `src/styles/starwind.css` | Tailwind v4 + Starwind design tokens |
| `src/pages/m/[slug].astro` | Public restaurant menu |
| `src/plugins/digimenu-autofill/` | Auto-assigns `restaurante` on new productos when empty |

DigiMenu front pages use **Starwind UI (free)** + Tailwind v4 via `@tailwindcss/postcss` (not `@tailwindcss/vite` — that plugin empties `/_emdash/admin` SSR HTML).

Layouts: **Root** → **Menu** (público/`/m`) or **Dashboard** (`/app` owner shell) / **AppGuest** (login/pending). Per-restaurant menu theming applies on `Menu` only (`theme` / `menu_layout`), not on Dashboard or EmDash admin.

## Skills

Agent skills are in `.agents/skills/`. Load them when working on specific tasks:

- **building-emdash-site** -- Querying content, rendering Portable Text, schema design, seed files, site features (menus, widgets, search, SEO, comments, bylines). Start here.
- **creating-plugins** -- Building EmDash plugins with hooks, storage, admin UI, API routes, and Portable Text block types.
- **emdash-cli** -- CLI commands for content management, seeding, type generation, and visual editing flow.

## Documentation

The EmDash docs are available as an MCP server at `https://docs.emdashcms.com/mcp`. When you need to verify an API, hook, config option, field type, or pattern, call `search_docs` against the live documentation rather than relying on training-data recall. The docs reflect current behaviour; assumptions may not.

## Rules

- All content pages must be server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- Image fields are objects (`{ src, alt }`). Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for reference fields and API calls).
- Always call `Astro.cache.set(cacheHint)` on pages that query content.
- Categories are a regular collection (`categorias`) scoped per restaurant — there is no taxonomy.

## Pages

| Page        | Path            | What it shows                          |
| ----------- | --------------- | -------------------------------------- |
| Home        | `/`             | List of restaurants                    |
| Menu        | `/m/[slug]`     | Public menu grouped by category        |
| Page        | `/[slug]`       | Static page content                    |

## Schema

- `restaurantes`: `nombre` (req), `descripcion`, `logo` (optional), `menu_layout` (json), `theme` (json).
- `categorias`: `nombre` (req), `restaurante` (reference, req), `icon` (string, Tabler id), `cover` (image), `orden` (integer; menu section order).
- `productos`: `nombre`, `precio` (req), `descripcion`, `imagen`, `restaurante` (reference; auto-filled by plugin when empty and only one restaurant exists), `categoria` (reference → categorias, optional; one per product).
- `pages`: `title`, `content` (Portable Text).
- Single `primary` menu.

Site settings: Digimenu title, dateFormat `DD/MM/YY`.

## Owner `/app`

See `docs/owner-dashboard.md`. Shell: Sidebar + View Transitions. Mutations need `EMDASH_API_TOKEN`.

## Worker sync note

Seed only applies to an empty DB. Production D1 already initialized must be aligned via MCP (`user-emdashWorker`) / admin. Current production schema matches local: `categorias` collection + `productos.categoria` reference (migrated 2026-07-17; old taxonomy `categoria` and `restaurantes.category_meta` removed). For local re-migrations see `scripts/migrate-categorias.mjs`.
