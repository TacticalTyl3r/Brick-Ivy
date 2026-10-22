-- Staff-configured weekly property value overrides.
-- OPFW remains read-only. This table never stores rental/tenant details.
create table if not exists public.brickivy_property_weekly_costs (
  property_id text primary key check (property_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  weekly_cost_override numeric(12,2) null check (weekly_cost_override between 0 and 9999999999.99),
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null
);
alter table public.brickivy_property_weekly_costs enable row level security;
revoke all on table public.brickivy_property_weekly_costs from public, anon, authenticated;

create table if not exists public.brickivy_property_weekly_cost_audit (
  id bigint generated always as identity primary key,
  property_id text not null check (property_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  previous_weekly_cost numeric(12,2),
  new_weekly_cost numeric(12,2),
  changed_at timestamptz not null default now(),
  changed_by uuid null references auth.users(id) on delete set null
);
alter table public.brickivy_property_weekly_cost_audit enable row level security;
revoke all on table public.brickivy_property_weekly_cost_audit from public, anon, authenticated;
create index if not exists brickivy_price_audit_property_time_idx
  on public.brickivy_property_weekly_cost_audit(property_id, changed_at desc);
