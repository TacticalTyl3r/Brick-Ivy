-- Brick & Ivy dedicated Supabase project — backend-only data.
-- Apply to a NEW Brick & Ivy project, not the existing Green Wonderland project.
-- This table has RLS enabled and no anon/authenticated grants or policies.
-- The Edge Functions validate Discord guild membership on every protected request.
create table if not exists public.brickivy_realtors (
  id uuid primary key default gen_random_uuid(),
  character_id bigint not null unique check (character_id > 0),
  name text not null check (char_length(name) between 1 and 80),
  role_label text not null default 'Realtor' check (role_label in ('Owner','Realtor')),
  title text not null default 'Realtor' check (char_length(title) <= 80),
  in_game_phone text not null default '' check (char_length(in_game_phone) <= 35),
  discord_username text not null default '' check (char_length(discord_username) <= 70),
  discord_user_id text not null default '' check (discord_user_id = '' or discord_user_id ~ '^[0-9]{17,20}$'),
  photo_url text not null default '' check (char_length(photo_url) <= 2048),
  email text not null default '' check (char_length(email) <= 254),
  bio text not null default '' check (char_length(bio) <= 500),
  published boolean not null default false,
  display_order integer not null default 100 check (display_order between 0 and 100000),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);
alter table public.brickivy_realtors enable row level security;
revoke all on table public.brickivy_realtors from PUBLIC, anon, authenticated;

-- Seed the known Owner's PUBLIC in-game profile (not an authentication grant).
-- Discord guild-role verification remains the sole source of Owner privileges.
insert into public.brickivy_realtors
(character_id, name, role_label, title, in_game_phone, discord_username, published, display_order)
values (8, 'Johnny Sausage', 'Owner', 'Owner', '145-7459', 'TacticalTyl3r', true, 1)
on conflict (character_id) do nothing;

-- Verify RLS and seeded record without exposing service keys:
-- select relrowsecurity from pg_class where oid='public.brickivy_realtors'::regclass;
-- select name, character_id, published from public.brickivy_realtors;
