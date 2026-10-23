-- Owner-controlled financial visibility and durable, versioned homepage drafts.
alter table public.brickivy_realtor_permissions
  add column if not exists can_view_financials boolean not null default false;

create table if not exists public.brickivy_homepage_content (
  id integer primary key default 1 check (id = 1),
  published_content jsonb not null default '{}'::jsonb,
  draft_content jsonb not null default '{}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.brickivy_homepage_content enable row level security;
revoke all on table public.brickivy_homepage_content from anon,authenticated;
grant select,insert,update on table public.brickivy_homepage_content to service_role;
insert into public.brickivy_homepage_content (id) values (1) on conflict (id) do nothing;

create table if not exists public.brickivy_homepage_audit (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  action text not null check (action in ('save_draft','publish','reset_draft')),
  before_content jsonb not null,
  after_content jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.brickivy_homepage_audit enable row level security;
revoke all on table public.brickivy_homepage_audit from anon,authenticated;
grant select,insert on table public.brickivy_homepage_audit to service_role;
grant usage,select on sequence public.brickivy_homepage_audit_id_seq to service_role;