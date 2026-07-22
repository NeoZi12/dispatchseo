-- 0031: cloud accounts foundation. Adds project ownership (which Supabase
-- Auth user a project belongs to - null on self-host installs, where there
-- are no users) and the subscriptions table billing will fill in. Additive
-- and zero-downtime like every migration: self-host deployments can apply it
-- harmlessly; nothing reads the new column unless CLOUD_MODE is on.

alter table projects
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

create index if not exists projects_owner_user_id_idx on projects (owner_user_id);

-- One row per user, upserted by billing webhooks. Tier limits are stored
-- denormalized (sites_limit/keywords_limit) so enforcement never needs the
-- provider's API on the hot path.
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'polar',
  provider_customer_id text,
  provider_subscription_id text,
  tier text not null default 'starter',
  status text not null default 'inactive',
  sites_limit integer not null default 1,
  keywords_limit integer not null default 100,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_user_id_idx on subscriptions (user_id);

-- Same posture as every operational table: RLS on, zero policies - only the
-- service-role key (server code) touches it.
alter table subscriptions enable row level security;
