# Active Context

## Current focus
Phase 1 scaffold: EmDash Cloudflare starter running locally and on Workers; GitHub repo `digimenu`.

## Decisions
- Shared single instance (not one Worker per restaurant)
- D1 for CMS data; R2 for media
- DigiMenu schema and subdomain middleware deferred

## Next
1. Finish GitHub auth + create/push repo
2. DigiMenu collections seed (restaurants, categories, dishes)
3. Public menu page + later Host-based subdomain routing
