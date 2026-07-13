# DigiMenu owner app — link owner to EmDash restaurant

## Supabase Dashboard (one-time)

1. Authentication → Providers → **Email** enabled (magic link).
2. Authentication → URL configuration:
   - Site URL: `http://localhost:4321`
   - Redirect URLs: `http://localhost:4321/app/auth/callback`
3. (Later) add Google/Facebook providers; same callback URL.

## Env

Copy from [`.env.example`](../.env.example). Required for local:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY` (legacy anon or publishable key)

Owner session cookie (HMAC, httpOnly, path `/app`, TTL **3 days**):

- `DIGIMENU_SESSION_SECRET` — preferred
- Falls back to `EMDASH_ENCRYPTION_KEY` if unset

Optional for product writes via BFF:

- `EMDASH_API_BASE=http://localhost:4321`
- `EMDASH_API_TOKEN=ec_pat_...` (create in EmDash admin)

Ops linking (service role, never in browser):

- `SUPABASE_SERVICE_ROLE_KEY`

## DigiMenu owner session

After magic-link login, DigiMenu sets cookie `digimenu_owner` with user + restaurant id/slug/name (signed). Sidebar navigations read that cookie and **do not** call Supabase/EmDash just for chrome.

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
| `/app/api/*` | BFF JSON (restaurante, productos, categorias) |

## Link a user to Finca

After the owner completes magic-link login once, copy their `auth.users.id` from Supabase Dashboard → Authentication → Users.

Get Finca ULID from local EmDash (dev server running):

```bash
npx emdash content list restaurantes --json -u http://localhost:4321
```

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
