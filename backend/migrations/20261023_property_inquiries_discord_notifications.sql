-- Brick & Ivy property inquiries: private queue, strict server-side access, and no public Data API writes.
alter table public.brickivy_realtor_permissions
  add column if not exists can_manage_inquiries boolean not null default false;

create table if not exists public.brickivy_property_inquiries (
  id uuid primary key default gen_random_uuid(),
  property_id text not null check (property_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  property_name text not null check (char_length(property_name) between 1 and 160),
  property_address text not null default '',
  character_name text not null check (char_length(character_name) between 2 and 80),
  in_game_phone text not null check (char_length(in_game_phone) between 3 and 35),
  discord_contact text not null default '' check (char_length(discord_contact) <= 80),
  message text not null check (char_length(message) between 10 and 1500),
  status text not null default 'new' check (status in ('new','in_progress','closed')),
  internal_note text not null default '' check (char_length(internal_note) <= 2000),
  assigned_discord_id text check (assigned_discord_id is null or assigned_discord_id ~ '^[0-9]{17,20}$'),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  discord_notification text not null default 'pending' check (discord_notification in ('pending','sent','not_configured','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
create index if not exists brickivy_inquiries_newest_idx
  on public.brickivy_property_inquiries (created_at desc);
create index if not exists brickivy_inquiries_source_recent_idx
  on public.brickivy_property_inquiries (source_hash,created_at desc);
create index if not exists brickivy_inquiries_phone_recent_idx
  on public.brickivy_property_inquiries (in_game_phone,created_at desc);

create table if not exists public.brickivy_inquiry_activity (
  id bigint generated always as identity primary key,
  inquiry_id uuid not null references public.brickivy_property_inquiries(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  previous_status text,
  new_status text,
  created_at timestamptz not null default now()
);
create index if not exists brickivy_inquiry_activity_inquiry_idx
  on public.brickivy_inquiry_activity (inquiry_id,created_at desc);

alter table public.brickivy_property_inquiries enable row level security;
alter table public.brickivy_inquiry_activity enable row level security;
revoke all on public.brickivy_property_inquiries from anon,authenticated;
revoke all on public.brickivy_inquiry_activity from anon,authenticated;
grant select,insert,update,delete on public.brickivy_property_inquiries to service_role;
grant select,insert on public.brickivy_inquiry_activity to service_role;
grant usage,select on sequence public.brickivy_inquiry_activity_id_seq to service_role;
