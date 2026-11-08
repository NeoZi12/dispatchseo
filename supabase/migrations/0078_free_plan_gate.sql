-- 0078: the free plan's memory - what one person has already had for free,
-- kept so deleting a site (or the account) never resets it (lib/free-gate.ts).
--
-- Owner-level and cross-project ON PURPOSE, so unlike other operational tables
-- there is no project_id default and no foreign keys: a row must outlive the
-- project and the auth user it was written for, or "delete the site and add it
-- again" would hand out a fresh free plan (security review, 2026-11-08).
-- Keys are HMACs of normalized values - no domain, email or IP is stored as is.

-- One row per thing that has had the free plan: a registrable domain, a
-- normalized email, a GitHub account, a browser, an IP. kind+key is unique
-- for all but ip, which is counted over a 30-day window instead.
create table if not exists free_claims (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('domain', 'email', 'github', 'device', 'ip')),
  key text not null,
  owner_user_id uuid not null,
  project_id uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists free_claims_kind_key_uniq on free_claims (kind, key) where kind <> 'ip';
create index if not exists free_claims_ip_idx on free_claims (key, created_at) where kind = 'ip';
create index if not exists free_claims_owner_idx on free_claims (owner_user_id);

-- Every free article start, per OWNER (the engine's own per-project ledger
-- cascades with the project).
create table if not exists free_article_starts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  project_id uuid,
  domain text,
  started_at timestamptz not null default now()
);
create index if not exists free_article_starts_owner_idx on free_article_starts (owner_user_id, started_at desc);

-- A free owner's platform DataForSEO spend per month, in micro-dollars.
create table if not exists free_owner_spend (
  owner_user_id uuid not null,
  month date not null,
  micro_usd bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, month)
);

-- Atomic add, so two workers charging at once can't lose one.
create or replace function free_owner_spend_add(p_owner uuid, p_month date, p_micro bigint)
returns void language sql as $$
  insert into free_owner_spend (owner_user_id, month, micro_usd)
  values (p_owner, p_month, greatest(p_micro, 0))
  on conflict (owner_user_id, month)
  do update set micro_usd = free_owner_spend.micro_usd + greatest(p_micro, 0), updated_at = now();
$$;

-- When a signed-in owner last opened the dashboard, and the inactivity email:
-- a free site pauses after 60 days unseen, but only once that email went out.
create table if not exists owner_activity (
  owner_user_id uuid primary key,
  last_seen_at timestamptz not null default now(),
  pause_warned_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists owner_activity_seen_idx on owner_activity (last_seen_at);

alter table free_claims enable row level security;
alter table free_article_starts enable row level security;
alter table free_owner_spend enable row level security;
alter table owner_activity enable row level security;
