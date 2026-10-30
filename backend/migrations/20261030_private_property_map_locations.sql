-- Private Brick & Ivy staging coordinates. Only service-role Edge Functions
-- may read/write these points; NO public or authenticated Data API access.
create table if not exists public.brickivy_property_map_locations (
 property_id text primary key check (property_id ~ '^[A-Za-z0-9_-]{1,80}$'),
 x double precision not null check (x between -8000 and 8000),
 y double precision not null check (y between -8000 and 9000),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
alter table public.brickivy_property_map_locations enable row level security;
revoke all on public.brickivy_property_map_locations from public,anon,authenticated;
grant select,insert,update,delete on public.brickivy_property_map_locations to service_role;
comment on table public.brickivy_property_map_locations is
 'Private Owner-only map staging. Never expose coordinates publicly until the Owner publishes the map.';
