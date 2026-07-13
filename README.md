# DigiMenu

EmDash CMS site for DigiMenu — digital menus for restaurants — hosted on Cloudflare Workers (D1 + R2).

## Local development

```bash
npm install
npm run dev
```

- Site: http://localhost:4321/
- Demo menu: http://localhost:4321/m/finca
- Owner app: http://localhost:4321/app/login
- Admin EmDash: http://localhost:4321/_emdash/admin
- Dev bypass: http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin

Owner auth (Supabase magic link + EmDash content BFF): see [docs/owner-auth.md](docs/owner-auth.md).

## Deploy

```bash
npm run deploy
```

Production: https://digimenu.nachomallavia.workers.dev

## Stack

- Astro 7 + EmDash on Cloudflare Workers
- D1 (`digimenu-db`) + R2 (`digimenu-media`) + KV sessions (`SESSION`)
- DigiMenu UI: **Tailwind CSS v4** (`@tailwindcss/postcss`) + **Starwind UI (free)** (`src/styles/starwind.css`, components via `npx starwind add …`). Do not use `@tailwindcss/vite` here — it breaks `/_emdash/admin`.
