# DigiMenu

EmDash CMS site for DigiMenu — digital menus for restaurants — hosted on Cloudflare Workers (D1 + R2).

## Local development

```bash
npm install
npm run dev
```

- Site: http://localhost:4321/
- Admin: http://localhost:4321/_emdash/admin
- Dev bypass: http://localhost:4321/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin

## Deploy

```bash
npm run deploy
```

Production: https://digimenu.nachomallavia.workers.dev

## Stack

- Astro 7 + EmDash on Cloudflare Workers
- D1 (`digimenu-db`) + R2 (`digimenu-media`) + KV sessions (`SESSION`)
