-- Owner-configured permissions for verified Brick & Ivy Discord Realtors.
-- All permission checks run in protected Edge Functions using service_role, never in the browser.
create table if not exists public.brickivy_realtor_permissions (
  discord_user_id text primary key check (discord_user_id ~ '^[0-9]{17,20}$'),
  can_edit_area boolean not null default false,
  can_manage_reservations boolean not null default true,
  can_edit_description boolean not null default false,
  can_set_prices boolean not null default false,
  can_manage_storage boolean not null default false,
  can_publish boolean not null default false,
  can_feature boolean not null default false,
  can_manage_photos boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.brickivy_realtor_permissions enable row level security;
revoke all on public.brickivy_realtor_permissions from anon,authenticated;
grant select,insert,update,delete on public.brickivy_realtor_permissions to service_role;

create table if not exists public.brickivy_realtor_permission_audit (
  id bigint generated always as identity primary key,
  discord_user_id text not null,
  actor uuid references auth.users(id) on delete set null,
  previous jsonb not null,
  updated jsonb not null,
  changed_at timestamptz not null default now()
);
alter table public.brickivy_realtor_permission_audit enable row level security;
revoke all on public.brickivy_realtor_permission_audit from anon,authenticated;
grant select,insert on public.brickivy_realtor_permission_audit to service_role;
grant usage,select on sequence public.brickivy_realtor_permission_audit_id_seq to service_role;