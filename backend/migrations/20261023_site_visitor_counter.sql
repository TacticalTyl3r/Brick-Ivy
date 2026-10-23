-- Privacy-minded site visitor counter.
-- Each browser holds a random local identifier. Only its SHA-256 digest
-- reaches this private table; no IP addresses, names, referrers or user agents
-- are stored. A primary key deduplicates repeat visits from that browser.
create table if not exists public.brickivy_site_visitors (
  visitor_hash text primary key check (visitor_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz not null default now()
);
alter table public.brickivy_site_visitors enable row level security;
revoke all on table public.brickivy_site_visitors from PUBLIC, anon, authenticated;
grant select,insert on public.brickivy_site_visitors to service_role;
create index if not exists brickivy_site_visitors_first_seen_idx on
  public.brickivy_site_visitors (first_seen_at);
