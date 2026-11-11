-- 0090: multi-site plans (src/lib/site-shares.ts).
--
-- A paid plan is now one monthly pool of articles per OWNER (Starter 5 on one
-- site, Growth 15 on up to three, Scale 30 on up to five), split into a fixed
-- monthly share per covered site. Each site then runs exactly as a single
-- site always has: its own queue, research, ramp and spacing.
--
-- projects.monthly_share: this site's articles this month. NULL = not
-- allocated yet, which reads as an even split of whatever the owner's other
-- sites leave (a single site with NULL gets the whole pool), so every
-- existing site keeps writing the moment this deploys, before the first
-- rebalance writes a number.
-- projects.share_mode: 'auto' = the daily rebalance sets the share from the
-- site's ramp and backlog; 'custom' = the owner set it by hand (Settings or
-- the set_site_share MCP tool) and the rebalance leaves it alone.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS monthly_share integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS share_mode text NOT NULL DEFAULT 'auto';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_share_mode_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_share_mode_check CHECK (share_mode IN ('auto', 'custom'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'projects_monthly_share_check') THEN
    ALTER TABLE projects ADD CONSTRAINT projects_monthly_share_check CHECK (monthly_share IS NULL OR monthly_share >= 0);
  END IF;
END $$;

-- What a DELETED site already used this month, per owner, so "delete a site
-- and add it again" never resets the month: its writer_runs and drafts
-- cascade away with the project, and the owner's DataForSEO month is summed
-- over the projects they still own. The deleting path adds the site's month
-- here first; the month gate (lib/autopilot/usage.ts monthAllowance) and the
-- owner's DataForSEO budget (lib/dataforseo-usage.ts) add it back.
--
-- Owner-level ON PURPOSE, like free_article_starts (0078): no project_id and
-- no foreign keys, so a row outlives the project and the auth user it was
-- written for.
create table if not exists owner_month_carry (
  owner_user_id uuid not null,
  month date not null,
  article_starts integer not null default 0,
  dfs_microusd bigint not null default 0,
  primary key (owner_user_id, month)
);

alter table owner_month_carry enable row level security;

-- Atomic add, so two deletes at once can't lose one (same shape as 0078's
-- free_owner_spend_add).
create or replace function owner_month_carry_add(p_owner uuid, p_month date, p_starts integer, p_micro bigint)
returns void language sql as $$
  insert into owner_month_carry (owner_user_id, month, article_starts, dfs_microusd)
  values (p_owner, p_month, greatest(p_starts, 0), greatest(p_micro, 0))
  on conflict (owner_user_id, month)
  do update set
    article_starts = owner_month_carry.article_starts + greatest(p_starts, 0),
    dfs_microusd = owner_month_carry.dfs_microusd + greatest(p_micro, 0);
$$;
