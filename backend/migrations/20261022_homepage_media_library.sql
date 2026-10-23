-- Publicly viewable homepage imagery; mutation restricted to Owner-verified Edge Functions.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('brickivy-homepage-media','brickivy-homepage-media',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

create table if not exists public.brickivy_homepage_media (
 id uuid primary key default gen_random_uuid(),
 object_key text not null unique check (object_key ~ '^images/[0-9a-f-]{36}\\.(jpg|png|webp)$'),
 filename text not null check (char_length(filename) between 1 and 160),
 mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
 size_bytes integer not null check (size_bytes between 1 and 5242880),
 uploaded_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table public.brickivy_homepage_media enable row level security;
revoke all on table public.brickivy_homepage_media from anon,authenticated;
grant select,insert,delete on table public.brickivy_homepage_media to service_role;
-- No public INSERT/UPDATE/DELETE storage.objects policies: all writes use Edge Function service role.