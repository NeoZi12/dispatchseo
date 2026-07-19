-- 0015: age-based publishing pace.
--
-- projects.site_launched_at is when the SITE went live - not when the project
-- was added to DispatchSEO. It drives the publishing-pace tiers (pacing.ts):
-- young sites publish slower, established sites ramp up to daily. Backfilled
-- from created_at (the best guess we have); the owner can correct it on the
-- Settings page.

alter table projects
  add column if not exists site_launched_at timestamptz not null default now();

update projects set site_launched_at = created_at;
