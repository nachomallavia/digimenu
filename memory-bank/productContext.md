# Product Context

Restaurant owners need menus that are easy to update without reprinting, work well on phones (QR), and can be branded. DigiMenu provides that via a dedicated owner app (`/app`) backed by EmDash content, plus a public Astro-rendered menu for guests.

## How it should work
- Guests open `/m/{slug}` (and later custom domains/subdomains)
- Owners sign in with magic link, manage restaurant info, menu type, styles, categories, and products in `/app`
- DigiMenu ops use EmDash admin for schema, linking, and emergency edits
- Visual Edit toolbar on public pages is ops-only; owners never depend on it

## UX goals
- Fast sidebar navigation (session cookie keeps SSR chrome light)
- Clear DigiMenu brand in the owner chrome; restaurant theme only on the public menu
- Mobile-first public menu with optional images, columns, and category navigation
