-- 0031: cloud accounts foundation. Adds project ownership (which Supabase
-- Auth user a project belongs to - null on self-host installs, where there
-- are no users) and the subscriptions table billing will fill in. Additive
-- and zero-downtime like every migration.
--
-- Self-host safety: `auth.users` only exists on Supabase. The columns are
-- added everywhere; the foreign keys attach inside a DO block that first
-- checks the auth schema exists - vanilla Postgres (the docker stack's
-- bundled database) skips them, Supabase gets the identical constraints.
-- First docker install after the unguarded version shipped failed with
-- 'schema "auth" does not exist'; this guard is what makes the header's
-- "applies harmlessly on self-host" claim actually true.

alter table projects
  add column if not exists owner_user_id uuid;

create index if not exists projects_owner_user_id_idx on projects (owner_user_id);

-- One row per user, upserted by billing webhooks. Tier limits are stored
-- denormalized (sites_limit/keywords_limit) so enforcement never needs the
-- provider's API on the hot path.
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
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

-- Supabase-only: reference auth.users where it exists. Constraint names
-- match what the earlier inline `references` produced, so re-running this
-- on a database that already has them is a no-op.
do $$
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
  ) then
    if not exists (select 1 from pg_constraint where conname = 'projects_owner_user_id_fkey') then
      alter table projects
        add constraint projects_owner_user_id_fkey
        foreign key (owner_user_id) references auth.users (id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'subscriptions_user_id_fkey') then
      alter table subscriptions
        add constraint subscriptions_user_id_fkey
        foreign key (user_id) references auth.users (id) on delete cascade;
    end if;
  end if;
end $$;
