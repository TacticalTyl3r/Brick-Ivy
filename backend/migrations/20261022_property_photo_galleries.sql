-- Publicly viewable Brick & Ivy property photos, with Owner-only mutation
-- through the authenticated photo Edge Function (service-role credentials).
create table if not exists public.brickivy_property_photos (
 id uuid primary key default gen_random_uuid(),
 property_id text not null check (property_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
 object_key text not null unique,
 original_filename text not null default '',
 display_order integer not null default 0,
 is_cover boolean not null default false,
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id) on delete set null
);
create index if not exists brickivy_property_photos_order_idx
 on public.brickivy_property_photos(property_id,display_order,created_at,id);
alter table public.brickivy_property_photos enable row level security;
revoke all on public.brickivy_property_photos from public,anon,authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('brickivy-property-photos','brickivy-property-photos',true,6291456,
 ARRAY['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do nothing;
-- No storage.objects INSERT/UPDATE/DELETE policies: only the authenticated,
-- role-checking service-role Edge Function uploads to this bucket.
