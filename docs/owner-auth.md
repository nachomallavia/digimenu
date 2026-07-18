# DigiMenu owner app — link owner to EmDash restaurant

## Supabase Dashboard (one-time)

1. Authentication → Providers → **Email** enabled (magic link).
2. Authentication → URL configuration:
   - **Site URL** (fallback if redirect is rejected): prefer production  
     `https://digimenu.nachomallavia.workers.dev`
   - **Redirect URLs** (allowlist — must include every callback you use):
     - `https://digimenu.nachomallavia.workers.dev/app/auth/callback`
     - `http://localhost:4321/app/auth/callback`
3. (Later) add Google/Facebook providers; same callback paths.

If the magic link lands on `http://localhost:3000/?code=…` (or any host **without** `/app/auth/callback`), Supabase ignored `emailRedirectTo` because that URL is **not** in Redirect URLs, and fell back to Site URL. Fix the allowlist, then request a **new** magic link (old links keep the bad redirect).

## Env

Copy from [`.env.example`](../.env.example). Required for local:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY` (legacy anon or publishable key)

Recommended for production builds (magic-link redirects):

- `PUBLIC_SITE_URL=https://digimenu.nachomallavia.workers.dev`  
  (local: omit it, or set `http://localhost:4321`)

Owner session cookie (HMAC, httpOnly, path `/app`, TTL **3 days**):

- `DIGIMENU_SESSION_SECRET` — preferred
- Falls back to `EMDASH_ENCRYPTION_KEY` if unset

Optional for product writes via BFF:

- Local (`.env`): `EMDASH_API_BASE=http://localhost:4321` + `EMDASH_API_TOKEN=ec_pat_...`
- Workers (runtime secrets — do **not** rely on baking `.env` into the build):
  ```bash
  echo 'https://digimenu.nachomallavia.workers.dev' | npx wrangler secret put EMDASH_API_BASE
  npx wrangler secret put EMDASH_API_TOKEN   # PAT from production /_emdash/admin
  ```
  `getEmDashApiConfig` reads Cloudflare secrets first; a baked `localhost` from local `.env` would break production writes (Cloudflare 403 / error 1003).

Ops linking (service role, never in browser):

- `SUPABASE_SERVICE_ROLE_KEY`

## DigiMenu owner session

After magic-link login, DigiMenu sets cookie `digimenu_owner` with user + restaurant id/slug/name + snapshot (`nombre`, `descripcion`, `menu_layout`, `theme`) (signed). Sidebar navigations and Info/Menu/Estilos GETs read that cookie and **do not** call Supabase/EmDash just for chrome/forms.

- **Issued:** `/app/auth/callback` (and first `requireOwner` fallback if cookie missing)
- **Cleared:** logout
- **Refreshed (new 3d TTL):** any successful owner POST / BFF mutation via `revalidateOwnerSession`

## Layouts

| Layout | Path | Role |
|--------|------|------|
| Root | `src/layouts/Root.astro` | Shared HTML + Starwind defaults |
| Menu | `src/layouts/Menu.astro` | Public customer UI (`/`, `/m/…`) — future restaurant theme hook |
| Dashboard | `src/layouts/Dashboard.astro` | Owner `/app` — DigiMenu brand + sidebar |
| AppGuest | `src/layouts/AppGuest.astro` | `/app/login`, `/app/pending` |

EmDash `/_emdash/admin` does not use these layouts. Guest `/app/login` and `/app/pending` use `AppGuest.astro`.

## Visual editing (EmDash toolbar)

The floating **EmDash / Edit** pill on public pages (e.g. `/m/[slug]`) is **ops/admin only**.

- EmDash injects it only when there is an EmDash session with editor role (`role >= 30`). Anonymous visitors and restaurant owners signed in only via Supabase never see it.
- Owners must edit content through DigiMenu `/app` (+ BFF), not via the Edit toggle or `/_emdash/admin`.
- DigiMenu ops logged into EmDash can toggle Edit on the public menu; fields on `/m/[slug]` are annotated with `{...entry.edit.*}` for that workflow (`string`/`number` tend to inline-edit; `text`/`image` may open admin).
- Product list items re-attach `createEditable` in edit mode because EmDash collection reads revive entries with a no-op `edit` proxy (single-entry `getEmDashEntry` is fine for the restaurant header).

## Routes

| Path | Purpose |
|------|---------|
| `/app/login` | Magic link form |
| `/app/auth/callback` | Exchange code → session |
| `/app/pending` | Logged in but no `owner_restaurants` row |
| `/app` | Owner dashboard shell (sidebar + resumen) |
| `/app/info` … `/app/productos/[id]` | See [owner-dashboard.md](./owner-dashboard.md) |

## Link a user to Finca

After the owner completes magic-link login once, copy their `auth.users.id` from Supabase Dashboard → Authentication → Users.

Get Finca ULID from the **same** EmDash environment the owner will use (local and Worker D1 have different ULIDs for the same slug):

```bash
# Local
npx emdash content list restaurantes --json -u http://localhost:4321

# Worker (or admin / MCP)
# finca → 01KXEQE87VY4Z5ESANZMC5WH7P on digimenu.nachomallavia.workers.dev
```

At login and on `revalidateOwnerSession` (after mutations), DigiMenu re-resolves the ULID from `emdash_restaurant_slug` against the current EmDash DB, so a stale ID in Supabase is corrected. Normal `requireOwner` navigations trust the signed cookie only (no EmDash/Supabase). Still prefer storing the production ULID in `owner_restaurants` for clarity.
Insert mapping (SQL editor or MCP `execute_sql`) with **service role**:

```sql
insert into public.owner_restaurants (user_id, emdash_restaurant_id, emdash_restaurant_slug)
values (
  '<supabase_user_id>',
  '<emdash_restaurant_id>',
  '<emdash_restaurant_slug>'
);
```

Then open `/app` — should list Finca products without using `/_emdash/admin`.
