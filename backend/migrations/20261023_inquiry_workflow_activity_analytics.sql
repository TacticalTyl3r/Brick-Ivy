-- Extend Brick & Ivy inquiry workflow and immutable activity logging.
alter table public.brickivy_property_inquiries
  drop constraint if exists brickivy_property_inquiries_status_check;
alter table public.brickivy_property_inquiries
  add constraint brickivy_property_inquiries_status_check
  check (status in ('new','in_progress','contacted','awaiting_customer','closed'));
alter table public.brickivy_property_inquiries
  add column if not exists claimed_at timestamptz,
  add column if not exists contacted_at timestamptz,
  add column if not exists closed_at timestamptz;
-- Existing closed entries have an estimated historical close time if one was not recorded.
update public.brickivy_property_inquiries
  set closed_at=updated_at where status='closed' and closed_at is null;

alter table public.brickivy_inquiry_activity
  add column if not exists event_type text not null default 'status_changed',
  add column if not exists actor_discord_id text,
  add column if not exists old_assignee text,
  add column if not exists new_assignee text,
  add column if not exists note_changed boolean not null default false,
  add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.brickivy_inquiry_activity
  add constraint brickivy_inquiry_activity_event_type_check
  check (event_type in ('claimed','assigned','unassigned','status_changed','note_updated','updated'));
create index if not exists brickivy_inquiries_status_created_idx
  on public.brickivy_property_inquiries (status,created_at desc);
create index if not exists brickivy_inquiries_assignee_idx
  on public.brickivy_property_inquiries (assigned_discord_id,status);
create index if not exists brickivy_inquiry_activity_actor_idx
  on public.brickivy_inquiry_activity (actor_discord_id,created_at desc);
-- These data tables are never directly accessible to visitor/authenticated Data API roles.
alter table public.brickivy_property_inquiries enable row level security;
alter table public.brickivy_inquiry_activity enable row level security;
revoke all on public.brickivy_property_inquiries from anon,authenticated;
revoke all on public.brickivy_inquiry_activity from anon,authenticated;
grant select,insert,update,delete on public.brickivy_property_inquiries to service_role;
grant select,insert on public.brickivy_inquiry_activity to service_role;
