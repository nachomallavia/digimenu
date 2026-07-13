# System Patterns

- **Platform:** EmDash CMS on Astro (`output: "server"`)
- **Hosting:** Cloudflare Workers
- **Database:** D1 (`DB` binding)
- **Media:** R2 (`MEDIA` binding)
- **Tenancy (target):** Single shared EmDash instance; later `slug.digimenu.com` → rewrite/redirect to `/m/{slug}`
- **Admin:** `/_emdash/admin`
- **Plugins:** Prefer standard EmDash plugins; sandbox on Cloudflare when needed
