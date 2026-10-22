-- Per-property region and reservation status; public access is through the filtered Edge Function only.
create table if not exists public.brickivy_property_listing_settings (
  property_id text primary key check (property_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  area text not null default '' check (area in ('','Los Santos','Sandy Shores','Paleto Bay')),
  reserved boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.brickivy_property_listing_settings enable row level security;
revoke all on public.brickivy_property_listing_settings from public, anon, authenticated;

-- The OPFW readonly stock table provides property_type, but not storage capacity.
-- Define editable per-type presets rather than inventing defaults.
create table if not exists public.brickivy_property_type_storage (
  property_type text primary key check (char_length(property_type) between 1 and 80),
  capacity_kg numeric(12,2) check (capacity_kg is null or capacity_kg between 0 and 9999999999.99),
  capacity_slots integer check (capacity_slots is null or capacity_slots between 0 and 1000000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.brickivy_property_type_storage enable row level security;
revoke all on public.brickivy_property_type_storage from public, anon, authenticated;

create table if not exists public.brickivy_property_listing_audit (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  property_id text,
  property_type text,
  action text not null check (action in ('set_area','set_reserved','set_storage')),
  previous jsonb not null default '{}'::jsonb,
  updated jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now()
);
alter table public.brickivy_property_listing_audit enable row level security;
revoke all on public.brickivy_property_listing_audit from public, anon, authenticated;
create index if not exists brickivy_listing_audit_recent
  on public.brickivy_property_listing_audit(changed_at desc);
