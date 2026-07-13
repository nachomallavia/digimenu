# DigiMenu — Project Brief

## What
DigiMenu is a SaaS that lets restaurant owners create, update, style, and customize digital menus for their customers.

## Goals
- Give restaurant owners a simple CMS-backed digital menu
- Host on Cloudflare with EmDash (Astro + D1 + R2)
- Public menus reachable via path and, later, restaurant subdomains on one shared instance
- Owner app at `/app` (not EmDash admin) for day-to-day edits

## Phase 1 (current)
- Schema: restaurantes, productos, pages; taxonomy `categoria`
- Public menu `/m/[slug]` with layout + theme
- Owner auth: Supabase magic link + `owner_restaurants` mapping
- Owner dashboard CRUD via DigiMenu BFF + session cookie
- Deploy: `digimenu.nachomallavia.workers.dev`

## Out of scope for Phase 1
- Billing
- OAuth / self-serve onboarding
- Wildcard subdomain routing middleware
- CSV import UI
- Media upload from `/app` (logo/product images) — planned next
