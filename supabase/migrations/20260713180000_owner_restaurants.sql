-- DigiMenu: map Supabase Auth users to EmDash restaurants
-- Applied via Supabase MCP; kept in-repo for reference / CLI sync.

create table if not exists public.owner_restaurants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  emdash_restaurant_id text not null,
  emdash_restaurant_slug text not null,
  created_at timestamptz not null default now()
);

comment on table public.owner_restaurants is 'Links DigiMenu owners (Supabase Auth) to EmDash restaurantes entries';

alter table public.owner_restaurants enable row level security;

drop policy if exists "Owners can read own restaurant mapping" on public.owner_restaurants;
create policy "Owners can read own restaurant mapping"
  on public.owner_restaurants
  for select
  to authenticated
  using ( (select auth.uid()) = user_id );

grant select on table public.owner_restaurants to authenticated;
grant all on table public.owner_restaurants to service_role;
